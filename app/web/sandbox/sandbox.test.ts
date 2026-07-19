// @vitest-environment node
//
// The sandbox is only useful if it lies about nothing that matters. This drives the spine
// in-process, exactly as the UI drives it over HTTP (log in per seat → POST /action → read
// the per-party ACS), and asserts the three properties a UI built against it depends on:
//
//   1. the privacy projection — a sealed bid is blind to the GP and to peers; an election is
//      blind to everyone but its LP; the fairness disclosure reaches the LPAC, not the room.
//   2. authority — a seat cannot exercise a choice it does not control.
//   3. the atomic close — the antecedent gate, unit conservation, and all-or-nothing.
//
// Mirrors app/scripts/close-wallets.ts, the sequence proven on devnet.
import { beforeAll, describe, expect, it } from 'vitest';
import { createSandbox } from './spine';

const P = '#continuum-contracts';
const T = {
  deal: `${P}:Continuum.Deal:ContinuationDeal`,
  holding: `${P}:Continuum.Registry:RegistryHolding`,
  factory: `${P}:Continuum.Registry:RegistryAllocationFactory`,
  opinion: `${P}:Continuum.Valuation:FairnessOpinion`,
  cert: `${P}:Continuum.Auction:AuctionCertificate`,
  sealedBid: `${P}:Continuum.Auction:SealedBid`,
  election: `${P}:Continuum.Election:LPElection`,
  consent: `${P}:Continuum.Consent:LPACConsent`,
  psa: `${P}:Continuum.Issuance:PurchaseAgreement`,
  basis: `${P}:Continuum.Issuance:IssuanceBasis`,
  interestOffer: `${P}:Continuum.Participation:OldFundInterestOffer`,
  dealPart: `${P}:Continuum.Participation:DealParticipation`,
  execDelegProp: `${P}:Continuum.Registry:ExecDelegationProposal`,
  allocFactoryIface: '#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory',
};

// Demo economics — verbatim from lib/useLedger.ts DEMO (and close-wallets.ts).
const CLEARING = '0.96';
const REF_NAV = '500000000.0';
const PSA_PRICE = '480000000.0';
const UNIT_AMT = '480000000.0';
const CASH_AMT = '460800000.0';
const INTEREST_NAV = '100000000.0';
const CLOSE_DATE = '2026-06-30';

type Ctr = { contractId: string; templateId: string; args: any };

const { app } = createSandbox();
const tokens: Record<string, string> = {};
let parties: Record<string, string>;
let deal: { dealId: string; cv: string; unit: string; usdc: string };

const req = (role: string, path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
  });

async function login(role: string): Promise<void> {
  const r = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: role, password: `${role}-demo` }),
  });
  expect(r.status).toBe(200);
  tokens[role] = (await r.json()).token;
}

/** POST /action — the backend signs as the session party. Throws on refusal, like the UI. */
async function act(role: string, commands: unknown[]): Promise<string> {
  const r = await req(role, '/action', { method: 'POST', body: JSON.stringify({ commands }) });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.error ?? `action failed (${r.status})`);
  return body.updateId;
}

/** The seat's OWN projection — the backend forces the party filter, so this cannot cheat. */
async function acs(role: string, suffix?: string): Promise<Ctr[]> {
  const { offset } = await (await req(role, '/api/v2/state/ledger-end')).json();
  const raw = await (
    await req(role, '/api/v2/state/active-contracts', {
      method: 'POST',
      body: JSON.stringify({ activeAtOffset: offset, filter: { filtersByParty: {} }, verbose: false }),
    })
  ).json();
  return (raw as any[])
    .map((e) => {
      const ce = e.contractEntry.JsActiveContract.createdEvent;
      return { contractId: ce.contractId, templateId: ce.templateId, args: ce.createArgument };
    })
    .filter((c) => !suffix || c.templateId.endsWith(suffix));
}

/** `pick` in views/parts.tsx takes the LAST match — newest wins. */
const pick = (list: Ctr[], pred: (c: Ctr) => boolean = () => true): Ctr => {
  const hit = list.filter(pred).slice(-1)[0];
  if (!hit) throw new Error('expected a contract, found none');
  return hit;
};
const balance = async (role: string, owner: string, instId: string): Promise<number> =>
  (await acs(role, 'Registry:RegistryHolding'))
    .filter((c) => c.args.owner === owner && c.args.instId === instId)
    .reduce((s, c) => s + Number(c.args.amount), 0);

beforeAll(async () => {
  const r = await app.request('/registry');
  ({ parties, deal } = await r.json());
  for (const role of ['gp', 'buyer', 'lpExiting', 'lpRolling', 'lpac', 'valuer']) await login(role);
});

describe('sandbox ledger', () => {
  it('runs the full close the way the UI drives it', async () => {
    const { gp, buyer, lpExiting: lp, lpac, valuer } = parties;
    const NOW = new Date().toISOString();

    // ── the GP opens the room ────────────────────────────────────────────────
    await act('gp', [{ CreateCommand: { templateId: T.factory, createArguments: { admin: gp } } }]);
    const factoryCid = pick(await acs('gp', 'Registry:RegistryAllocationFactory')).contractId;

    await act('gp', [
      {
        CreateCommand: {
          templateId: T.deal,
          createArguments: {
            gp, vehicle: gp, oldFund: gp, lpac, regulator: lpac,
            room: [buyer, lp, parties.lpRolling],
            fund: 'Meridian Growth Fund III', cv: deal.cv, asset: 'Project Atlas', refNav: REF_NAV,
            electionDeadline: '2026-12-31T00:00:00Z', clearingPrice: null,
            gpCommitment: '0.0', carryCrystallized: '0.0', stage: 'Setup',
          },
        },
      },
    ]);
    /** Deal choices are consuming — always re-read the current cid, as the UI does. */
    const dealCid = async (): Promise<string> => pick(await acs('gp', 'Deal:ContinuationDeal')).contractId;
    const advance = async (role: string, choice: string, choiceArgument: unknown = {}) => {
      await act(role, [{ ExerciseCommand: { templateId: T.deal, contractId: await dealCid(), choice, choiceArgument } }]);
    };

    await advance('gp', 'SetClearing', { p: CLEARING });

    // AUTHORITY: consent is the LPAC's to give. The GP holding the pen would be the whole
    // conflict of interest, so the ledger must refuse it.
    await expect(advance('gp', 'RecordConsent')).rejects.toThrow(/controller/i);

    await advance('lpac', 'RecordConsent');
    await advance('gp', 'OpenElections');
    expect(pick(await acs('gp', 'Deal:ContinuationDeal')).args.stage).toBe('Electing');

    // ── PRIVACY: the sealed auction and the elections ────────────────────────
    await act('buyer', [
      {
        CreateCommand: {
          templateId: T.sealedBid,
          createArguments: { gp, buyer, dealId: deal.dealId, pctOfNav: CLEARING, capacity: '600000000.0' },
        },
      },
    ]);
    await act('lpExiting', [
      {
        CreateCommand: {
          templateId: T.election,
          createArguments: { lp, dealId: deal.dealId, positionNav: INTEREST_NAV, rollNav: '0.0', sellNav: INTEREST_NAV, disclosureHash: 'deadbeef' },
        },
      },
    ]);

    expect(await acs('buyer', 'Auction:SealedBid')).toHaveLength(1); // the bidder sees its own bid
    expect(await acs('gp', 'Auction:SealedBid')).toHaveLength(0); // …the GP never does
    expect(await acs('lpac', 'Auction:SealedBid')).toHaveLength(0);
    expect(await acs('gp', 'Election:LPElection')).toHaveLength(0); // …nor an LP's election
    expect(await acs('lpRolling', 'Election:LPElection')).toHaveLength(0); // …nor a peer LP

    // ── the antecedent DAG ───────────────────────────────────────────────────
    // The independent valuation is auto-seeded by the valuer at boot, as in production.
    const valuation = pick(await acs('gp', 'Valuation:ValuationReport'), (c) => c.args.dealId === deal.dealId);
    expect(valuation.args.agent).toBe(valuer);

    await act('lpac', [
      {
        CreateCommand: {
          templateId: T.opinion,
          createArguments: { provider: lpac, gp, lpac, dealId: deal.dealId, fairLow: '0.9', fairHigh: '1.0', opinionDate: CLOSE_DATE, contentHash: 'beef' },
        },
      },
    ]);
    await act('gp', [
      {
        CreateCommand: {
          templateId: T.cert,
          createArguments: { gp, lpac, dealId: deal.dealId, clearingPct: CLEARING, leadBuyer: buyer, bidTabulationHash: 'beef' },
        },
      },
    ]);
    await act('lpac', [
      { CreateCommand: { templateId: T.consent, createArguments: { gp, lpac, dealId: deal.dealId, recusals: [], granted: true } } },
    ]);
    await act('gp', [
      {
        CreateCommand: {
          templateId: T.psa,
          createArguments: { oldFund: gp, vehicle: gp, dealId: deal.dealId, price: PSA_PRICE, refNav: REF_NAV, clearingPct: CLEARING, asOfDate: CLOSE_DATE },
        },
      },
    ]);
    await act('gp', [
      {
        CreateCommand: {
          templateId: T.basis,
          createArguments: {
            gp, dealId: deal.dealId, reconciledNav: REF_NAV, clearingPct: CLEARING, psaPrice: PSA_PRICE,
            reconciliation: 'InRangeOfAll',
            valuationCids: [valuation.contractId],
            fairnessCid: pick(await acs('gp', 'Valuation:FairnessOpinion')).contractId,
            auctionCertCid: pick(await acs('gp', 'Auction:AuctionCertificate')).contractId,
            lpacConsentCid: pick(await acs('gp', 'Consent:LPACConsent')).contractId,
            psaCid: pick(await acs('gp', 'Issuance:PurchaseAgreement')).contractId,
            closeDate: CLOSE_DATE, maxAsOfDays: '120',
          },
        },
      },
    ]);
    const basisCid = pick(await acs('gp', 'Issuance:IssuanceBasis')).contractId;

    // ── the settlement legs ──────────────────────────────────────────────────
    const allocateLeg = async (receiver: string, instId: string, amount: string, legId: string): Promise<string> => {
      await act('gp', [
        { CreateCommand: { templateId: T.holding, createArguments: { admin: gp, owner: gp, instId, amount, locked: false, meta_: {} } } },
      ]);
      const holdingCid = pick(
        await acs('gp', 'Registry:RegistryHolding'),
        (c) => c.args.owner === gp && c.args.instId === instId,
      ).contractId;
      await act('gp', [
        {
          ExerciseCommand: {
            templateId: T.allocFactoryIface,
            contractId: factoryCid,
            choice: 'AllocationFactory_Allocate',
            choiceArgument: {
              expectedAdmin: gp,
              allocation: {
                settlement: { executor: gp, settlementRef: { id: legId, cid: null }, requestedAt: NOW, allocateBefore: NOW, settleBefore: NOW, meta: { values: {} } },
                transferLegId: legId,
                transferLeg: { sender: gp, receiver, amount, instrumentId: { admin: gp, id: instId }, meta: { values: {} } },
              },
              requestedAt: NOW,
              inputHoldingCids: [holdingCid],
              extraArgs: { context: { values: {} }, meta: { values: {} } },
            },
          },
        },
      ]);
      return pick(await acs('gp', 'Registry:RegistryAllocation'), (c) => c.args.spec.transferLegId === legId).contractId;
    };
    const allocUnitCid = await allocateLeg(buyer, deal.unit, UNIT_AMT, 'unit-buyer');
    const allocCashCid = await allocateLeg(lp, deal.usdc, CASH_AMT, 'cash-lp');

    // the allocation is scoped to its counterparties — a peer LP sees nothing
    expect(await acs('buyer', 'Registry:RegistryAllocation')).toHaveLength(1);
    expect(await acs('lpRolling', 'Registry:RegistryAllocation')).toHaveLength(0);

    // ── pre-signed authority: propose → accept, each seat signing for itself ──
    const delegate = async (role: string, party: string): Promise<string> => {
      await act('gp', [{ CreateCommand: { templateId: T.execDelegProp, createArguments: { admin: gp, party } } }]);
      const prop = pick(await acs(role, 'Registry:ExecDelegationProposal'), (c) => c.args.party === party);
      await act(role, [{ ExerciseCommand: { templateId: T.execDelegProp, contractId: prop.contractId, choice: 'EDP_Accept', choiceArgument: {} } }]);
      return pick(await acs('gp', 'Registry:ExecDelegation'), (c) => c.args.party === party).contractId;
    };
    const execBuyerCid = await delegate('buyer', buyer);
    const execLpCid = await delegate('lpExiting', lp);

    await act('gp', [{ CreateCommand: { templateId: T.interestOffer, createArguments: { oldFund: gp, lp, nav: INTEREST_NAV } } }]);
    const offerCid = pick(await acs('lpExiting', 'Participation:OldFundInterestOffer')).contractId;
    await act('lpExiting', [{ ExerciseCommand: { templateId: T.interestOffer, contractId: offerCid, choice: 'OFI_Accept', choiceArgument: {} } }]);
    const interestCid = pick(await acs('gp', 'Participation:OldFundInterest')).contractId;

    await act('lpExiting', [{ CreateCommand: { templateId: T.dealPart, createArguments: { gp, lp } } }]);
    const dpCid = pick(await acs('gp', 'Participation:DealParticipation')).contractId;
    await act('gp', [{ ExerciseCommand: { templateId: T.dealPart, contractId: dpCid, choice: 'Accept', choiceArgument: {} } }]);
    const accCid = pick(await acs('gp', 'Participation:AcceptedParticipation')).contractId;

    // ── ATOMICITY: a close that breaks conservation must change nothing ───────
    const close = async (legExecs: unknown[], burns: unknown[]): Promise<string> =>
      act('gp', [
        {
          ExerciseCommand: {
            templateId: T.deal,
            contractId: await dealCid(),
            choice: 'Close',
            choiceArgument: { basisCid, legExecs, burns, fairnessHash: 'continuum-fairness-v1' },
          },
        },
      ]);

    // the cash leg alone: the buyer's units never move, so units issued ≠ the PSA price
    await expect(close([{ _1: execLpCid, _2: allocCashCid }], [])).rejects.toThrow(/units issued must equal the PSA price/);
    // …and the aborted close spent nothing: the basis is unconsumed, the deal still open.
    expect(await acs('gp', 'Issuance:IssuanceBasis')).toHaveLength(1);
    expect(pick(await acs('gp', 'Deal:ContinuationDeal')).args.stage).toBe('Electing');

    // ── the close ────────────────────────────────────────────────────────────
    const updateId = await close(
      [
        { _1: execBuyerCid, _2: allocUnitCid },
        { _1: execLpCid, _2: allocCashCid },
      ],
      [{ _1: accCid, _2: interestCid }],
    );

    // cash out, units in, old interest burned — all of it, in one transaction
    expect(await balance('buyer', buyer, deal.unit)).toBe(Number(UNIT_AMT));
    expect(await balance('lpExiting', lp, deal.usdc)).toBe(Number(CASH_AMT));
    expect(await acs('lpExiting', 'Participation:OldFundInterest')).toHaveLength(0);
    expect(pick(await acs('gp', 'Deal:ContinuationDeal')).args.stage).toBe('Closed');

    // the room gets a receipt; only the LPAC/regulator get the fairness aggregates
    expect(await acs('buyer', 'Deal:SettlementReceipt')).toHaveLength(1);
    expect(await acs('lpac', 'Deal:FairnessDisclosure')).toHaveLength(1);
    expect(await acs('buyer', 'Deal:FairnessDisclosure')).toHaveLength(0);

    // …and it is ONE transaction, which is what the Ledger Inspector shows
    const tree = await (await req('gp', `/ledger/update/${updateId}`)).json();
    expect(tree.update.Transaction.value.events.length).toBeGreaterThan(1);
  });

  it('anchors documents by their real sha256', async () => {
    const verify = await (await req('valuer', '/verify/valuation-report')).json();
    expect(verify.matches).toBe(true);
  });

  it('records every signature in the audit trail', async () => {
    const audit = await (await req('gp', '/audit')).json();
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((e: any) => e.party === parties.gp && e.keyFingerprint)).toBe(true);
  });
});
