// app/scripts/close-minimal.ts — the floor money-shot: ONE atomic Close, 1 buyer + 1 LP.
// Run (proxy up on :8788): cd app && npx tsx --env-file=.env scripts/close-minimal.ts
//
// Drives a fresh ContinuationDeal Setup→Electing, builds the antecedent DAG +
// IssuanceBasis, allocates 2 legs (CV units → buyer, USDC → exiting LP) against the
// disclosed RegistryAllocationFactory, co-signs the ExecDelegations + burn authority,
// then exercises Deal.Close in a SINGLE transaction. Asserts one updateId, a
// SettlementReceipt, and the moved RegistryHolding balances.
import { HttpLedgerClient } from '../ledger-client/src/client';
import registry from '../party-registry.json';

const BASE = 'http://localhost:8788';
const c = new HttpLedgerClient(BASE);

const gp = registry.parties.gp;        // == vehicle == oldFund (MVP collapsed party)
const buyer = registry.parties.buyer;  // secondary buyer — receives CV units
const lp = registry.parties.lp;        // exiting LP — receives USDC, interest burned
const lpac = registry.parties.lpac;    // LPAC + (plays independent valuation agent / fairness provider, both ≠ gp)
const regulator = lpac;                // observer-only external attestation party

// package-qualified template ids (proxy resolves the concrete package)
const T = {
  deal: '#continuum-contracts:Continuum.Deal:ContinuationDeal',
  receipt: '#continuum-contracts:Continuum.Deal:SettlementReceipt',
  fairness: '#continuum-contracts:Continuum.Deal:FairnessDisclosure',
  holding: '#continuum-contracts:Continuum.Registry:RegistryHolding',
  factory: '#continuum-contracts:Continuum.Registry:RegistryAllocationFactory',
  alloc: '#continuum-contracts:Continuum.Registry:RegistryAllocation',
  execDeleg: '#continuum-contracts:Continuum.Registry:ExecDelegation',
  valuation: '#continuum-contracts:Continuum.Valuation:ValuationReport',
  opinion: '#continuum-contracts:Continuum.Valuation:FairnessOpinion',
  cert: '#continuum-contracts:Continuum.Auction:AuctionCertificate',
  consent: '#continuum-contracts:Continuum.Consent:LPACConsent',
  psa: '#continuum-contracts:Continuum.Issuance:PurchaseAgreement',
  basis: '#continuum-contracts:Continuum.Issuance:IssuanceBasis',
  interest: '#continuum-contracts:Continuum.Participation:OldFundInterest',
  accPart: '#continuum-contracts:Continuum.Participation:AcceptedParticipation',
  // Splice interface id for the allocation factory choice
  allocFactoryIface: '#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory',
};

// canonical minimal deal numbers (whole dollars). clearing 0.96 × 5.0M refNav = 4.8M PSA.
const RUN = Date.now();
const CV = `Meridian CV I ${RUN}`;
const DEAL_ID = 'M1';
const clearingPct = '0.96';
const refNav = '5000000.0';
const reconciledNav = '5000000.0';
const psaPrice = '4800000.0';       // == unit total → satisfies the on-ledger conservation guard
const unitAmt = '4800000.0';        // CV units delivered to buyer (only unit leg ⇒ == psaPrice)
const cashAmt = '4608000.0';        // USDC delivered to the exiting LP
const interestNav = '1000000.0';
const fairnessHash = 'continuum-fairness-v1';
const contentHash = 'deadbeef';     // BytesHex — not validated by ValidateIssuance
const NOW = new Date().toISOString();
const CLOSE_DATE = '2026-06-30';
const ELECTION_DEADLINE = '2026-12-31T00:00:00Z';
const USDC = 'USDC';
const UNIT = 'MERIDIAN-CV-I';

let step = 0;
async function submit(commandId: string, actAs: string[], commands: any[], disclosedContracts?: any[]) {
  const body: any = { commandId: `${commandId}-${RUN}`, actAs, commands };
  if (disclosedContracts) body.disclosedContracts = disclosedContracts;
  const r = await c.submit(body);
  console.log(`  [${String(++step).padStart(2, '0')}] ${commandId.padEnd(22)} updateId=${r.updateId}`);
  return r;
}

// Snapshot-diff to recover cids created by a submit (robust vs. stale devnet contracts).
async function createAndFind(templateSuffix: string, commandId: string, actAs: string[], commands: any[], predicate?: (a: any) => boolean): Promise<string[]> {
  const suffix = templateSuffix.split(':').slice(1).join(':'); // "Module:Entity"
  const before = new Set((await c.activeContracts(gp, { templateId: suffix })).map(a => a.contractId));
  await submit(commandId, actAs, commands);
  let after = (await c.activeContracts(gp, { templateId: suffix })).filter(a => !before.has(a.contractId));
  if (predicate) after = after.filter(predicate);
  return after.map(a => a.contractId);
}
const one = (xs: string[], what: string) => { if (xs.length !== 1) throw new Error(`expected 1 ${what}, got ${xs.length}`); return xs[0]; };

async function main() {
  console.log(`\n=== Continuum minimal atomic Close (run ${RUN}) ===`);
  console.log(`gp=${gp}\nbuyer=${buyer}\nlp=${lp}\n`);

  // ── locate the seeded RegistryAllocationFactory (admin = gp) ────────────────
  const facs = (await c.activeContracts(gp, { templateId: 'Registry:RegistryAllocationFactory' })).filter(a => a.args.admin === gp);
  if (facs.length === 0) throw new Error('no RegistryAllocationFactory — run seed.ts first');
  const factoryCid = facs[0].contractId; // any gp-admin factory works (seed may have created several)
  const facDisc = await c.fetchDisclosed(gp, factoryCid);
  console.log(`factory=${factoryCid}\n`);

  // ── STAGE MACHINE: create the deal, drive Setup → Electing ──────────────────
  console.log('--- drive deal Setup → Electing ---');
  let dealCid = one(await createAndFind(T.deal, 'create-deal', [gp], [{
    CreateCommand: {
      templateId: T.deal,
      createArguments: {
        gp, vehicle: gp, oldFund: gp, lpac, regulator, room: [buyer, lp],
        fund: 'Meridian Growth Fund III', cv: CV, asset: 'Project Atlas',
        refNav, electionDeadline: ELECTION_DEADLINE, clearingPrice: null,
        gpCommitment: '0.0', carryCrystallized: '0.0', stage: 'Setup',
      },
    },
  }], a => a.args.cv === CV), 'ContinuationDeal (Setup)');

  // consuming choices → re-fetch the successor cid by our unique cv each time
  const advance = async (choice: string, argument: any, label: string) => {
    await submit(`deal-${choice}`, [gp], [{ ExerciseCommand: { templateId: T.deal, contractId: dealCid, choice, choiceArgument: argument } }]);
    const hits = (await c.activeContracts(gp, { templateId: 'Continuum.Deal:ContinuationDeal' })).filter(a => a.args.cv === CV);
    dealCid = one(hits.map(a => a.contractId), `ContinuationDeal (${label})`);
    console.log(`       stage=${hits[0].args.stage}`);
  };
  await advance('SetClearing', { p: clearingPct }, 'clearing set');
  await advance('RecordConsent', {}, 'Consented');
  await advance('OpenElections', {}, 'Electing');

  // ── ANTECEDENT DAG + IssuanceBasis ──────────────────────────────────────────
  console.log('\n--- antecedent DAG + IssuanceBasis ---');
  const vrCid = one(await createAndFind(T.valuation, 'valuation-report', [lpac], [{
    CreateCommand: { templateId: T.valuation, createArguments: { agent: lpac, gp, dealId: DEAL_ID, navLow: '4000000.0', navHigh: '6000000.0', asOfDate: CLOSE_DATE, contentHash } },
  }], a => a.args.dealId === DEAL_ID && a.args.gp === gp), 'ValuationReport');

  const foCid = one(await createAndFind(T.opinion, 'fairness-opinion', [lpac], [{
    CreateCommand: { templateId: T.opinion, createArguments: { provider: lpac, gp, lpac, dealId: DEAL_ID, fairLow: '0.9', fairHigh: '1.0', opinionDate: CLOSE_DATE, contentHash } },
  }], a => a.args.dealId === DEAL_ID && a.args.gp === gp), 'FairnessOpinion');

  const acCid = one(await createAndFind(T.cert, 'auction-cert', [gp], [{
    CreateCommand: { templateId: T.cert, createArguments: { gp, lpac, dealId: DEAL_ID, clearingPct, leadBuyer: buyer, bidTabulationHash: contentHash } },
  }], a => a.args.dealId === DEAL_ID), 'AuctionCertificate');

  const lcCid = one(await createAndFind(T.consent, 'lpac-consent', [lpac], [{
    CreateCommand: { templateId: T.consent, createArguments: { gp, lpac, dealId: DEAL_ID, recusals: [], granted: true } },
  }], a => a.args.dealId === DEAL_ID && a.args.gp === gp), 'LPACConsent');

  const psaCid = one(await createAndFind(T.psa, 'purchase-agreement', [gp], [{
    CreateCommand: { templateId: T.psa, createArguments: { oldFund: gp, vehicle: gp, dealId: DEAL_ID, price: psaPrice, refNav, clearingPct, asOfDate: CLOSE_DATE } },
  }], a => a.args.dealId === DEAL_ID), 'PurchaseAgreement');

  const basisCid = one(await createAndFind(T.basis, 'issuance-basis', [gp], [{
    CreateCommand: {
      templateId: T.basis,
      createArguments: {
        gp, dealId: DEAL_ID, reconciledNav, clearingPct, psaPrice, reconciliation: 'InRangeOfAll',
        valuationCids: [vrCid], fairnessCid: foCid, auctionCertCid: acCid, lpacConsentCid: lcCid, psaCid,
        closeDate: CLOSE_DATE, maxAsOfDays: '120',
      },
    },
  }], a => a.args.dealId === DEAL_ID && a.args.gp === gp), 'IssuanceBasis');

  // ── PHASE 1: allocate the 2 legs against the disclosed factory ──────────────
  console.log('\n--- allocate legs (mint holding → AllocationFactory_Allocate) ---');
  const allocateLeg = async (sender: string, receiver: string, instId: string, amount: string, legId: string): Promise<string> => {
    // mint a dedicated sender-owned holding of exactly `amount`
    const holdingCid = one(await createAndFind(T.holding, `mint-${legId}`, [gp], [{
      CreateCommand: { templateId: T.holding, createArguments: { admin: gp, owner: sender, instId, amount, locked: false, meta_: {} } },
    }], a => a.args.owner === sender && a.args.instId === instId && Number(a.args.amount) === Number(amount)), `holding ${legId}`);
    const spec = {
      settlement: { executor: gp, settlementRef: { id: legId, cid: null }, requestedAt: NOW, allocateBefore: NOW, settleBefore: NOW, meta: { values: {} } },
      transferLegId: legId,
      transferLeg: { sender, receiver, amount, instrumentId: { admin: gp, id: instId }, meta: { values: {} } },
    };
    const allocCid = one(await createAndFind(T.alloc, `alloc-${legId}`, [sender], [{
      ExerciseCommand: {
        templateId: T.allocFactoryIface, contractId: factoryCid, choice: 'AllocationFactory_Allocate',
        choiceArgument: { expectedAdmin: gp, allocation: spec, requestedAt: NOW, inputHoldingCids: [holdingCid], extraArgs: { context: { values: {} }, meta: { values: {} } } },
      },
    }, ], a => a.args?.spec?.transferLegId === legId), `RegistryAllocation ${legId}`);
    return allocCid;
  };
  const allocUnitCid = await allocateLeg(gp, buyer, UNIT, unitAmt, 'unit-buyer');   // CV units → buyer
  const allocCashCid = await allocateLeg(gp, lp, USDC, cashAmt, 'cash-lp');         // USDC → exiting LP

  // ── co-signed authorities: ExecDelegations + burn (accepted participation + interest) ──
  console.log('\n--- co-signed authorities (multi-actAs) ---');
  const execBuyerCid = one(await createAndFind(T.execDeleg, 'exec-buyer', [gp, buyer], [{
    CreateCommand: { templateId: T.execDeleg, createArguments: { admin: gp, party: buyer } },
  }], a => a.args.party === buyer), 'ExecDelegation(buyer)');
  const execLpCid = one(await createAndFind(T.execDeleg, 'exec-lp', [gp, lp], [{
    CreateCommand: { templateId: T.execDeleg, createArguments: { admin: gp, party: lp } },
  }], a => a.args.party === lp), 'ExecDelegation(lp)');
  const accLpCid = one(await createAndFind(T.accPart, 'acc-part-lp', [gp, lp], [{
    CreateCommand: { templateId: T.accPart, createArguments: { gp, lp } },
  }], a => a.args.lp === lp), 'AcceptedParticipation(lp)');
  const interestLpCid = one(await createAndFind(T.interest, 'interest-lp', [gp, lp], [{
    CreateCommand: { templateId: T.interest, createArguments: { oldFund: gp, lp, nav: interestNav } },
  }], a => a.args.lp === lp), 'OldFundInterest(lp)');

  // ── balances BEFORE close ───────────────────────────────────────────────────
  const bal = async (owner: string, instId: string) =>
    (await c.activeContracts(gp, { templateId: 'Registry:RegistryHolding' }))
      .filter(a => a.args.owner === owner && a.args.instId === instId)
      .reduce((s, a) => s + Number(a.args.amount), 0);
  const buyerUnitsBefore = await bal(buyer, UNIT);
  const lpCashBefore = await bal(lp, USDC);
  const receiptsBefore = new Set((await c.activeContracts(gp, { templateId: 'Continuum.Deal:SettlementReceipt' })).map(a => a.contractId));

  // ── THE ATOMIC CLOSE — one transaction, all-or-nothing ──────────────────────
  console.log('\n--- exercise Deal.Close (single atomic tx) ---');
  const closeArg = {
    basisCid,
    legExecs: [ { _1: execBuyerCid, _2: allocUnitCid }, { _1: execLpCid, _2: allocCashCid } ],
    burns: [ { _1: accLpCid, _2: interestLpCid } ],
    fairnessHash,
  };
  const closeRes = await submit('CLOSE', [gp], [{ ExerciseCommand: { templateId: T.deal, contractId: dealCid, choice: 'Close', choiceArgument: closeArg } }]);
  console.log(`\n  >>> CLOSE updateId = ${closeRes.updateId}`);

  // ── assert atomicity: receipt exists + balances moved in that one tx ────────
  const receipts = (await c.activeContracts(gp, { templateId: 'Continuum.Deal:SettlementReceipt' })).filter(a => !receiptsBefore.has(a.contractId) && a.args.dealId === CV);
  const receiptCid = one(receipts.map(a => a.contractId), 'new SettlementReceipt');
  const buyerUnitsAfter = await bal(buyer, UNIT);
  const lpCashAfter = await bal(lp, USDC);
  const interestsLeft = (await c.activeContracts(gp, { templateId: 'Participation:OldFundInterest' })).filter(a => a.contractId === interestLpCid).length;

  console.log('\n=== RESULT ===');
  console.log(`Close updateId       : ${closeRes.updateId}`);
  console.log(`SettlementReceipt    : ${receiptCid}  (dealId=${receipts[0].args.dealId}, totalUnits=${receipts[0].args.totalUnits}, clearingPct=${receipts[0].args.clearingPct})`);
  console.log(`buyer CV units       : ${buyerUnitsBefore} → ${buyerUnitsAfter}  (Δ ${buyerUnitsAfter - buyerUnitsBefore})`);
  console.log(`lp   USDC            : ${lpCashBefore} → ${lpCashAfter}  (Δ ${lpCashAfter - lpCashBefore})`);
  console.log(`lp   OldFundInterest : ${interestsLeft === 0 ? 'BURNED' : 'STILL PRESENT'}`);

  const okUnits = buyerUnitsAfter - buyerUnitsBefore === Number(unitAmt);
  const okCash = lpCashAfter - lpCashBefore === Number(cashAmt);
  const okBurn = interestsLeft === 0;
  if (!okUnits || !okCash || !okBurn) throw new Error(`atomic movement assertion FAILED (units=${okUnits} cash=${okCash} burn=${okBurn})`);
  console.log('\n✅ ATOMIC CLOSE PROVEN: buyer holds CV units + exiting LP holds USDC + interest burned, all in ONE updateId.');

  // print the exact Close JSON for the RESULT.md recipe
  console.log('\n--- Close choiceArgument (for RESULT.md) ---');
  console.log(JSON.stringify(closeArg, null, 2));
}

main().catch(e => { console.error('\n❌ FAILED:', e.message ?? e); process.exit(1); });
