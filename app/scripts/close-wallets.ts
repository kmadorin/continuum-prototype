// app/scripts/close-wallets.ts — THE THESIS PROOF: a full continuation-fund close on
// LIVE devnet assembled ENTIRELY from single-party EXTERNAL-WALLET signatures.
// 4 real wallets (gp, buyer, lpExiting, lpac), each holds its own Ed25519 key and signs
// its OWN transactions via interactive submission. Multi-party authority is built via
// propose-accept (ExecDelegationProposal→EDP_Accept, OldFundInterestOffer→OFI_Accept,
// DealParticipation→Accept), NOT multi-actAs — because Canton 3.5 interactive submission
// is single-party-only. The gp-only Close consumes the pre-signed authority.
// Run: cd app && node --experimental-strip-types --env-file=.env scripts/close-wallets.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { HttpLedgerClient } from '../ledger-client/src/client';
import { WalletClient } from '../ledger-client/src/wallet';
import { keyFromMnemonic, generateMnemonic, type Ed25519Key } from '../ledger-client/src/ed25519';
import { VALUATION_SHA256, FAIRNESS_SHA256, PSA_SHA256 } from '../custody/docs/hashes';

const API = 'https://ledger-api.validator.devnet.sandbox.fivenorth.io';
const AUTH = 'https://auth.sandbox.fivenorth.io/application/o/token/';
const NS = '1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8';
const EXISTING_GP = `continuum-gp-demo::${NS}`; // only used to discover the synchronizer id
const SCRATCH = '/private/tmp/claude-501/-Users-kirillmadorin-Projects-hackathons-canton/0827f303-84e0-4d70-ad1e-817b0a1a48de/scratchpad';

// ---- transport auth: shared M2M JWT (authorization comes from party signatures) ----
async function getToken(): Promise<string> {
  const secret = process.env.FN_SECRET || readFileSync(`${SCRATCH}/.fn_secret`, 'utf8').trim();
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: 'validator-devnet-m2m', client_secret: secret, audience: 'validator-devnet-m2m', scope: 'daml_ledger_api' });
  const r = await fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`);
  return (await r.json()).access_token;
}
// 20s-timeout fetch that injects the transport Bearer (anti-hang)
function authFetchFactory(token: string): typeof fetch {
  return (async (url: any, init: any = {}) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    try {
      return await fetch(url, { ...init, signal: ctl.signal, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    } finally { clearTimeout(t); }
  }) as unknown as typeof fetch;
}

const T = {
  deal: '#continuum-contracts:Continuum.Deal:ContinuationDeal',
  holding: '#continuum-contracts:Continuum.Registry:RegistryHolding',
  factory: '#continuum-contracts:Continuum.Registry:RegistryAllocationFactory',
  alloc: '#continuum-contracts:Continuum.Registry:RegistryAllocation',
  execDeleg: '#continuum-contracts:Continuum.Registry:ExecDelegation',
  execDelegProp: '#continuum-contracts:Continuum.Registry:ExecDelegationProposal',
  valuation: '#continuum-contracts:Continuum.Valuation:ValuationReport',
  opinion: '#continuum-contracts:Continuum.Valuation:FairnessOpinion',
  cert: '#continuum-contracts:Continuum.Auction:AuctionCertificate',
  sealedBid: '#continuum-contracts:Continuum.Auction:SealedBid',
  election: '#continuum-contracts:Continuum.Election:LPElection',
  consent: '#continuum-contracts:Continuum.Consent:LPACConsent',
  psa: '#continuum-contracts:Continuum.Issuance:PurchaseAgreement',
  basis: '#continuum-contracts:Continuum.Issuance:IssuanceBasis',
  interest: '#continuum-contracts:Continuum.Participation:OldFundInterest',
  interestOffer: '#continuum-contracts:Continuum.Participation:OldFundInterestOffer',
  dealPart: '#continuum-contracts:Continuum.Participation:DealParticipation',
  accPart: '#continuum-contracts:Continuum.Participation:AcceptedParticipation',
  receipt: '#continuum-contracts:Continuum.Deal:SettlementReceipt',
  allocFactoryIface: '#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory',
};

const RUN = Date.now();
const CV = `Meridian CV I ${RUN}`;
const DEAL_ID = 'M1';
// $500M institutional scale — matches the Kroll valuation report ($500M NAV, $480–520M range).
const clearingPct = '0.96', refNav = '500000000.0', reconciledNav = '500000000.0';
const psaPrice = '480000000.0', unitAmt = '480000000.0', cashAmt = '460800000.0', interestNav = '100000000.0';
const fairnessHash = 'continuum-fairness-v1', contentHash = 'deadbeef';
const NOW = new Date().toISOString(), CLOSE_DATE = '2026-06-30', ELECTION_DEADLINE = '2026-12-31T00:00:00Z';
const USDC = 'USDC', UNIT = 'MERIDIAN-CV-I';

type Wallet = { party: string; key: Ed25519Key; fp: string; mnemonic: string };
const suffix = (tid: string) => tid.split(':').slice(1).join(':');

async function main() {
  console.log(`\n=== Continuum FULL WALLET CLOSE (run ${RUN}) ===`);
  const token = await getToken();
  const authFetch = authFetchFactory(token);
  const reads = new HttpLedgerClient(API, authFetch);
  const wallet = new WalletClient(API, reads, authFetch);
  const sync = await wallet.discoverSynchronizer(EXISTING_GP);
  console.log('synchronizer:', sync, '\n');

  // ── onboard 4 external wallets, each its own key ────────────────────────────
  const W: Record<string, Wallet> = {};
  // 6 wallets now: the independent VALUER (Kroll) signs the ValuationReport (agent ≠ gp ≠ lpac).
  for (const role of ['gp', 'buyer', 'lpExiting', 'lpac', 'valuer']) {
    console.log(`onboarding ${role}...`);
    const mnemonic = generateMnemonic();
    const key = keyFromMnemonic(mnemonic);
    const { partyId, fingerprint } = await wallet.onboard(`continuum-${role}-${RUN.toString().slice(-6)}`, key);
    W[role] = { party: partyId, key, fp: fingerprint, mnemonic };
    console.log(`  ${role} = ${partyId}`);
  }
  const gp = W.gp.party, buyer = W.buyer.party, lp = W.lpExiting.party, lpac = W.lpac.party, valuer = W.valuer.party;

  // ── SECURITY: party ids → public registry; keys → gitignored file (never commit) ──
  writeFileSync(new URL('../party-registry.json', import.meta.url),
    JSON.stringify({ namespace: NS, synchronizerId: sync, packageName: 'continuum-contracts',
      parties: { gp, buyer, lpExiting: lp, lpac, valuer } }, null, 2));
  const keysPath = new URL('../wallet-keys.json', import.meta.url);
  const ignored = execSync('git check-ignore app/wallet-keys.json || true', { cwd: `${process.cwd()}/..` }).toString().trim();
  if (!ignored.endsWith('wallet-keys.json')) throw new Error('REFUSING to write keys: app/wallet-keys.json is NOT gitignored');
  writeFileSync(keysPath, JSON.stringify(Object.fromEntries(Object.entries(W).map(([r, w]) => [r, { mnemonic: w.mnemonic, fingerprint: w.fp, party: w.party }])), null, 2));
  console.log('\nwrote party-registry.json (public) + wallet-keys.json (gitignored)\n');

  let step = 0;
  // sign `cmds` with `role`'s wallet, then return the newest cid of `findTid` visible to `readAs` matching `pred`
  const act = async (role: string, label: string, cmds: any[], findTid?: string, readAs?: string, pred?: (a: any) => boolean): Promise<string> => {
    const w = W[role];
    const rp = readAs ?? w.party;
    const before = findTid ? new Set((await reads.activeContracts(rp, { templateId: suffix(findTid) })).map(a => a.contractId)) : new Set();
    const r = await wallet.submitSigned(w.party, w.key, w.fp, cmds);
    console.log(`  [${String(++step).padStart(2, '0')}] ${role.padEnd(9)} ${label.padEnd(26)} updateId=${r.updateId ?? '(async)'}`);
    if (!findTid) return '';
    // poll for the new cid (execute is async)
    for (let i = 0; i < 10; i++) {
      let after = (await reads.activeContracts(rp, { templateId: suffix(findTid) })).filter(a => !before.has(a.contractId));
      if (pred) after = after.filter(pred);
      if (after.length) return after[after.length - 1].contractId;
      await new Promise(res => setTimeout(res, 700));
    }
    throw new Error(`${label}: created contract of ${findTid} not found in ${role}'s view`);
  };

  // ── gp-wallet creates its OWN registry factory (seeded one has a different admin) ──
  console.log('--- gp registry factory + deal setup ---');
  const factoryCid = await act('gp', 'create factory', [{ CreateCommand: { templateId: T.factory, createArguments: { admin: gp } } }], T.factory, gp, (a: any) => a.args.admin === gp);

  // ── deal Setup → Electing (gp signs SetClearing/OpenElections; LPAC signs RecordConsent) ──
  let dealCid = await act('gp', 'create deal', [{ CreateCommand: { templateId: T.deal, createArguments: {
    gp, vehicle: gp, oldFund: gp, lpac, regulator: lpac, room: [buyer, lp],
    fund: 'Meridian Growth Fund III', cv: CV, asset: 'Project Atlas', refNav,
    electionDeadline: ELECTION_DEADLINE, clearingPrice: null, gpCommitment: '0.0', carryCrystallized: '0.0', stage: 'Setup' } } }],
    T.deal, gp, (a: any) => a.args.cv === CV);
  const advance = async (role: string, choice: string, arg: any) => {
    dealCid = await act(role, `deal.${choice}`, [{ ExerciseCommand: { templateId: T.deal, contractId: dealCid, choice, choiceArgument: arg } }], T.deal, gp, (a: any) => a.args.cv === CV);
  };
  await advance('gp', 'SetClearing', { p: clearingPct });
  await advance('lpac', 'RecordConsent', {});   // now lpac-controlled (1.1.0)
  await advance('gp', 'OpenElections', {});

  // ── visible per-role economic decisions: buyer signs a real SealedBid, lp a real LPElection ──
  console.log('\n--- per-role signed economic decisions ---');
  await act('buyer', 'SealedBid', [{ CreateCommand: { templateId: T.sealedBid, createArguments: { gp, buyer, dealId: DEAL_ID, pctOfNav: clearingPct, capacity: '600000000.0' } } }], T.sealedBid, buyer, (a: any) => a.args.buyer === buyer);
  await act('lpExiting', 'LPElection(sell)', [{ CreateCommand: { templateId: T.election, createArguments: { lp, dealId: DEAL_ID, positionNav: interestNav, rollNav: '0.0', sellNav: interestNav, disclosureHash: contentHash } } }], T.election, lp, (a: any) => a.args.lp === lp);

  // ── antecedent DAG (lpac signs valuation/fairness/consent; gp signs cert/psa/basis) ──
  console.log('\n--- antecedent DAG + IssuanceBasis ---');
  // The independent VALUER (Kroll) signs the ValuationReport — agent = valuer (≠ gp ≠ lpac);
  // contentHash = the REAL sha256 of the served valuation-report.html (the on-chain anchor).
  const vrCid = await act('valuer', 'ValuationReport', [{ CreateCommand: { templateId: T.valuation, createArguments: { agent: valuer, gp, dealId: DEAL_ID, navLow: '480000000.0', navHigh: '520000000.0', asOfDate: CLOSE_DATE, contentHash: VALUATION_SHA256 } } }], T.valuation, gp, (a: any) => a.args.dealId === DEAL_ID && a.args.gp === gp);
  const foCid = await act('lpac', 'FairnessOpinion', [{ CreateCommand: { templateId: T.opinion, createArguments: { provider: lpac, gp, lpac, dealId: DEAL_ID, fairLow: '0.9', fairHigh: '1.0', opinionDate: CLOSE_DATE, contentHash: FAIRNESS_SHA256 } } }], T.opinion, gp, (a: any) => a.args.dealId === DEAL_ID && a.args.gp === gp);
  const acCid = await act('gp', 'AuctionCertificate', [{ CreateCommand: { templateId: T.cert, createArguments: { gp, lpac, dealId: DEAL_ID, clearingPct, leadBuyer: buyer, bidTabulationHash: contentHash } } }], T.cert, gp, (a: any) => a.args.dealId === DEAL_ID);
  const lcCid = await act('lpac', 'LPACConsent', [{ CreateCommand: { templateId: T.consent, createArguments: { gp, lpac, dealId: DEAL_ID, recusals: [], granted: true } } }], T.consent, gp, (a: any) => a.args.dealId === DEAL_ID && a.args.gp === gp);
  const psaCid = await act('gp', 'PurchaseAgreement', [{ CreateCommand: { templateId: T.psa, createArguments: { oldFund: gp, vehicle: gp, dealId: DEAL_ID, price: psaPrice, refNav, clearingPct, asOfDate: CLOSE_DATE } } }], T.psa, gp, (a: any) => a.args.dealId === DEAL_ID);
  const basisCid = await act('gp', 'IssuanceBasis', [{ CreateCommand: { templateId: T.basis, createArguments: { gp, dealId: DEAL_ID, reconciledNav, clearingPct, psaPrice, reconciliation: 'InRangeOfAll', valuationCids: [vrCid], fairnessCid: foCid, auctionCertCid: acCid, lpacConsentCid: lcCid, psaCid, closeDate: CLOSE_DATE, maxAsOfDays: '120' } } }], T.basis, gp, (a: any) => a.args.dealId === DEAL_ID && a.args.gp === gp);

  // ── allocate 2 legs (gp mints + allocates against ITS OWN factory) ──────────
  console.log('\n--- allocate legs (gp signs) ---');
  const allocateLeg = async (receiver: string, instId: string, amount: string, legId: string, meta_: Record<string, string> = {}): Promise<string> => {
    const holdingCid = await act('gp', `mint ${legId}`, [{ CreateCommand: { templateId: T.holding, createArguments: { admin: gp, owner: gp, instId, amount, locked: false, meta_ } } }], T.holding, gp, (a: any) => a.args.owner === gp && a.args.instId === instId && Number(a.args.amount) === Number(amount));
    // The receiver's SETTLED holding takes meta_ from transferLeg.meta.values (Registry.daml),
    // so carry the provenance meta on the leg too — not only on the pre-settlement mint.
    const spec = { settlement: { executor: gp, settlementRef: { id: legId, cid: null }, requestedAt: NOW, allocateBefore: NOW, settleBefore: NOW, meta: { values: {} } }, transferLegId: legId, transferLeg: { sender: gp, receiver, amount, instrumentId: { admin: gp, id: instId }, meta: { values: meta_ } } };
    return act('gp', `alloc ${legId}`, [{ ExerciseCommand: { templateId: T.allocFactoryIface, contractId: factoryCid, choice: 'AllocationFactory_Allocate', choiceArgument: { expectedAdmin: gp, allocation: spec, requestedAt: NOW, inputHoldingCids: [holdingCid], extraArgs: { context: { values: {} }, meta: { values: {} } } } } }], T.alloc, gp, (a: any) => a.args?.spec?.transferLegId === legId);
  };
  // PROVENANCE: the CV-units mint carries the on-chain link Holding → valuation + issuance basis.
  const mintMeta = { 'continuum/valuation-sha256': VALUATION_SHA256, 'continuum/issuance-basis': basisCid };
  const allocUnitCid = await allocateLeg(buyer, UNIT, unitAmt, 'unit-buyer', mintMeta);
  const allocCashCid = await allocateLeg(lp, USDC, cashAmt, 'cash-lp');

  // ── authority via PROPOSE-ACCEPT (each acceptor signs with its OWN key) ─────
  console.log('\n--- authority: propose-accept (single-signer each) ---');
  // ExecDelegation(buyer): gp proposes, buyer accepts
  const edpBuyer = await act('gp', 'ExecDelegProp(buyer)', [{ CreateCommand: { templateId: T.execDelegProp, createArguments: { admin: gp, party: buyer } } }], T.execDelegProp, buyer, (a: any) => a.args.party === buyer);
  const execBuyerCid = await act('buyer', 'EDP_Accept(buyer)', [{ ExerciseCommand: { templateId: T.execDelegProp, contractId: edpBuyer, choice: 'EDP_Accept', choiceArgument: {} } }], T.execDeleg, buyer, (a: any) => a.args.party === buyer);
  // ExecDelegation(lp): gp proposes, lp accepts
  const edpLp = await act('gp', 'ExecDelegProp(lp)', [{ CreateCommand: { templateId: T.execDelegProp, createArguments: { admin: gp, party: lp } } }], T.execDelegProp, lp, (a: any) => a.args.party === lp);
  const execLpCid = await act('lpExiting', 'EDP_Accept(lp)', [{ ExerciseCommand: { templateId: T.execDelegProp, contractId: edpLp, choice: 'EDP_Accept', choiceArgument: {} } }], T.execDeleg, lp, (a: any) => a.args.party === lp);
  // OldFundInterest(lp): gp offers, lp accepts
  const oiOffer = await act('gp', 'OFI_Offer(lp)', [{ CreateCommand: { templateId: T.interestOffer, createArguments: { oldFund: gp, lp, nav: interestNav } } }], T.interestOffer, lp, (a: any) => a.args.lp === lp);
  const interestLpCid = await act('lpExiting', 'OFI_Accept(lp)', [{ ExerciseCommand: { templateId: T.interestOffer, contractId: oiOffer, choice: 'OFI_Accept', choiceArgument: {} } }], T.interest, lp, (a: any) => a.args.lp === lp);
  // AcceptedParticipation: lp proposes DealParticipation, gp accepts
  const dealPart = await act('lpExiting', 'DealParticipation', [{ CreateCommand: { templateId: T.dealPart, createArguments: { gp, lp } } }], T.dealPart, gp, (a: any) => a.args.lp === lp);
  const accLpCid = await act('gp', 'Accept participation', [{ ExerciseCommand: { templateId: T.dealPart, contractId: dealPart, choice: 'Accept', choiceArgument: {} } }], T.accPart, gp, (a: any) => a.args.lp === lp);

  // ── balances before ─────────────────────────────────────────────────────────
  const bal = async (owner: string, instId: string) => (await reads.activeContracts(gp, { templateId: 'Registry:RegistryHolding' })).filter(a => a.args.owner === owner && a.args.instId === instId).reduce((s, a) => s + Number(a.args.amount), 0);
  const buyerUnitsBefore = await bal(buyer, UNIT), lpCashBefore = await bal(lp, USDC);
  const receiptsBefore = new Set((await reads.activeContracts(gp, { templateId: 'Continuum.Deal:SettlementReceipt' })).map(a => a.contractId));

  // ── THE ATOMIC CLOSE — gp signs alone, consuming all pre-signed authority ────
  console.log('\n--- Deal.Close (gp signs alone; one atomic tx) ---');
  const closeArg = { basisCid, legExecs: [{ _1: execBuyerCid, _2: allocUnitCid }, { _1: execLpCid, _2: allocCashCid }], burns: [{ _1: accLpCid, _2: interestLpCid }], fairnessHash };
  const closeRes = await wallet.submitSigned(W.gp.party, W.gp.key, W.gp.fp, [{ ExerciseCommand: { templateId: T.deal, contractId: dealCid, choice: 'Close', choiceArgument: closeArg } }]);
  console.log(`  >>> CLOSE updateId = ${closeRes.updateId ?? '(async — polling)'}`);

  // ── assert ──────────────────────────────────────────────────────────────────
  let receiptCid = '', tries = 0;
  while (!receiptCid && tries++ < 12) {
    const rs = (await reads.activeContracts(gp, { templateId: 'Continuum.Deal:SettlementReceipt' })).filter(a => !receiptsBefore.has(a.contractId) && a.args.dealId === CV);
    if (rs.length) receiptCid = rs[0].contractId; else await new Promise(r => setTimeout(r, 700));
  }
  const buyerUnitsAfter = await bal(buyer, UNIT), lpCashAfter = await bal(lp, USDC);
  const interestsLeft = (await reads.activeContracts(gp, { templateId: 'Participation:OldFundInterest' })).filter(a => a.contractId === interestLpCid).length;

  // PROVENANCE proof: the buyer's settled CV-units holding carries the valuation link in meta_.
  const buyerUnitHolding = (await reads.activeContracts(gp, { templateId: 'Registry:RegistryHolding' }))
    .filter(a => a.args.owner === buyer && a.args.instId === UNIT).slice(-1)[0];
  const mintedMeta = buyerUnitHolding?.args?.meta_ ?? {};

  console.log('\n=== RESULT ===');
  console.log(`Close updateId    : ${closeRes.updateId}`);
  console.log(`SettlementReceipt : ${receiptCid || 'NOT FOUND'}`);
  console.log(`buyer CV units    : ${buyerUnitsBefore} → ${buyerUnitsAfter} (Δ ${buyerUnitsAfter - buyerUnitsBefore})`);
  console.log(`lp   USDC         : ${lpCashBefore} → ${lpCashAfter} (Δ ${lpCashAfter - lpCashBefore})`);
  console.log(`lp   OldFundInt   : ${interestsLeft === 0 ? 'BURNED' : 'STILL PRESENT'}`);
  console.log(`ValuationReport   : signed by VALUER ${valuer.split('::')[0]} · contentHash ${VALUATION_SHA256.slice(0, 12)}…`);
  console.log(`mint meta_        : ${JSON.stringify(mintedMeta)}`);
  const metaOk = mintedMeta['continuum/valuation-sha256'] === VALUATION_SHA256 && !!mintedMeta['continuum/issuance-basis'];
  const ok = receiptCid && (buyerUnitsAfter - buyerUnitsBefore === Number(unitAmt)) && (lpCashAfter - lpCashBefore === Number(cashAmt)) && interestsLeft === 0 && metaOk;
  if (!ok) throw new Error(`atomic movement assertion FAILED (metaOk=${metaOk})`);
  console.log('\n✅ FULL WALLET CLOSE PROVEN: every authority signed by its own party key; atomic close in ONE updateId.');
}
main().catch(e => { console.error('\n❌ FAILED:', e?.message ?? e); process.exit(1); });
