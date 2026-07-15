// app/scripts/generate-fixtures.ts
// Generate the preview's committed fixtures by AUTHORING the rich post-close state with
// close-wallets.ts's proven createArguments shapes, pinned to the epoch-1 deal keys.
//
// Run: cd app && npx tsx scripts/generate-fixtures.ts
//
// No network, no prod, no keys. Deterministic. Writes public demo data only.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { MOCK_PARTIES } from '../custody/mock/fixtures';
import { VALUATION_SHA256, FAIRNESS_SHA256 } from '../custody/docs/hashes';
import type { AuditEntry } from '../custody/app';
import { mockTenantRecords } from '../custody/mock/fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../custody/fixtures');

// Parties (canonical mock ids — the SAME strings the tenants use).
const { gp, buyer, lpExiting: lp, lpRolling: roller, lpac, valuer } = MOCK_PARTIES;

// Epoch-1 deal keys — MUST equal dealKeys(1) in custody/app.ts:311, or the SPA (which
// filters on /registry's deal block) renders empty.
const DEAL_ID = 'M1', CV = 'Meridian CV I', UNIT = 'MERIDIAN-CV-I', USDC = 'USDC';
// $500M institutional scale — matches the Kroll report + close-wallets constants.
const clearingPct = '0.96', refNav = '500000000.0', reconciledNav = '500000000.0';
const psaPrice = '480000000.0', unitAmt = '480000000.0', cashAmt = '460800000.0', interestNav = '100000000.0';
const contentHash = 'deadbeef', CLOSE_DATE = '2026-06-30', ELECTION_DEADLINE = '2026-12-31T00:00:00Z';

// Template ids — verbatim from close-wallets.ts's T map. The web filters by module:entity
// suffix (HttpLedgerClient.activeContracts uses endsWith), so these match by suffix.
const T = {
  deal: '#continuum-contracts:Continuum.Deal:ContinuationDeal',
  holding: '#continuum-contracts:Continuum.Registry:RegistryHolding',
  valuation: '#continuum-contracts:Continuum.Valuation:ValuationReport',
  opinion: '#continuum-contracts:Continuum.Valuation:FairnessOpinion',
  cert: '#continuum-contracts:Continuum.Auction:AuctionCertificate',
  sealedBid: '#continuum-contracts:Continuum.Auction:SealedBid',
  election: '#continuum-contracts:Continuum.Election:LPElection',
  consent: '#continuum-contracts:Continuum.Consent:LPACConsent',
  psa: '#continuum-contracts:Continuum.Issuance:PurchaseAgreement',
  basis: '#continuum-contracts:Continuum.Issuance:IssuanceBasis',
  dealPart: '#continuum-contracts:Continuum.Participation:AcceptedParticipation',
  receipt: '#continuum-contracts:Continuum.Deal:SettlementReceipt',
};

type Row = { contractId: string; templateId: string; args: Record<string, unknown>; stakeholders: string[] };
let seq = 0;
const id = (label: string) => `1220${bytesToHex(sha256(new TextEncoder().encode(`${label}-${++seq}`)))}`;
const acs: Row[] = [];
/** Author one contract with its explicit stakeholder set. */
const c = (templateId: string, args: Record<string, unknown>, stakeholders: string[]): Row => {
  const row = { contractId: id(templateId), templateId, args, stakeholders };
  acs.push(row);
  return row;
};

// ── the SETTLED post-close snapshot (rich state for every seat) ────────────────
// Deal: Electing stage, clearing set. Room includes lpRolling so its Sell-vs-Roll renders.
// IDENTITY MODEL (verified against the views): the ContinuationDeal is matched by
// `args.cv === DEMO.cv` (DealPage.tsx:178, FocusedPage.tsx:150), so cv MUST be the epoch-1
// 'Meridian CV I' — it carries NO dealId field (close-wallets' deal has none either). The
// antecedents below are matched by `args.dealId === 'M1'`; the SettlementReceipt by
// `args.dealId === <cv>` (Settlement.tsx:82) — hence receipt.dealId = CV, not 'M1'.
c(T.deal, {
  gp, vehicle: gp, oldFund: gp, lpac, regulator: lpac, room: [buyer, lp, roller],
  fund: 'Meridian Growth Fund III', cv: CV, asset: 'Project Atlas', refNav,
  electionDeadline: ELECTION_DEADLINE, clearingPrice: clearingPct, gpCommitment: '0.0',
  carryCrystallized: '0.0', stage: 'Electing',
}, [gp, buyer, lp, roller, lpac]);

// Peer-blind economic decisions.
c(T.sealedBid, { gp, buyer, dealId: DEAL_ID, pctOfNav: clearingPct, capacity: '600000000.0' }, [buyer]);
c(T.election, { lp, dealId: DEAL_ID, positionNav: interestNav, rollNav: '0.0', sellNav: interestNav, disclosureHash: contentHash }, [lp]);

// Antecedent DAG — the ValuationReport MUST reach gp (NAV tile) and lpac (fairness).
c(T.valuation, { agent: valuer, gp, dealId: DEAL_ID, navLow: '480000000.0', navHigh: '520000000.0', asOfDate: CLOSE_DATE, contentHash: VALUATION_SHA256 }, [valuer, gp, lpac]);
c(T.opinion, { provider: lpac, gp, lpac, dealId: DEAL_ID, fairLow: '0.9', fairHigh: '1.0', opinionDate: CLOSE_DATE, contentHash: FAIRNESS_SHA256 }, [lpac, gp]);
c(T.cert, { gp, lpac, dealId: DEAL_ID, clearingPct, leadBuyer: buyer, bidTabulationHash: contentHash }, [gp, lpac]);
c(T.consent, { gp, lpac, dealId: DEAL_ID, recusals: [], granted: true }, [gp, lpac]);
c(T.psa, { oldFund: gp, vehicle: gp, dealId: DEAL_ID, price: psaPrice, refNav, clearingPct, asOfDate: CLOSE_DATE }, [gp, lpac]);
const basis = c(T.basis, { gp, dealId: DEAL_ID, reconciledNav, clearingPct, psaPrice, reconciliation: 'InRangeOfAll', closeDate: CLOSE_DATE, maxAsOfDays: '120' }, [gp]);

// Settled holdings — the money shot. Buyer's CV units carry the provenance meta_.
c(T.holding, {
  admin: gp, owner: buyer, instId: UNIT, amount: unitAmt, locked: false,
  meta_: { 'continuum/valuation-sha256': VALUATION_SHA256, 'continuum/issuance-basis': basis.contractId },
}, [buyer, gp]);
c(T.holding, { admin: gp, owner: lp, instId: USDC, amount: cashAmt, locked: false, meta_: {} }, [lp, gp]);

// Participation + receipt.
c(T.dealPart, { gp, lp }, [gp, lp]);
c(T.receipt, { gp, dealId: CV, buyer, lp, unitAmount: unitAmt, cashAmount: cashAmt, closeDate: CLOSE_DATE }, [gp, buyer, lp]);

// ── audit trail + matching update trees (so AuditTrail/HoldingReceipt/Inspector render) ──
const tenantByRole = Object.fromEntries(mockTenantRecords().map((t) => [t.role, t]));
const RECORD_TIME = '2026-07-15T09:00:00Z';
const audit: AuditEntry[] = [];
const updates: Record<string, unknown> = {};
/** One audit row + one inspectable update tree. `outcome` defaults to signed. */
const logged = (role: string, action: string, outcome: 'signed' | 'failed' = 'signed') => {
  const t = tenantByRole[role]!;
  const updateId = id(`audit-${role}-${action}`);
  audit.push({
    ts: RECORD_TIME, username: t.username, custodianName: t.custodianName, party: t.party,
    keyFingerprint: t.fingerprint, updateId, action, outcome,
    ...(outcome === 'failed' ? { error: `refused: session party ${t.party} cannot act as another party` } : {}),
  });
  updates[updateId] = {
    updateId, commandId: `mock-${updateId.slice(4, 12)}`, offset: audit.length,
    recordTime: RECORD_TIME, effectiveAt: RECORD_TIME, synchronizerId: 'global-domain::1220mock',
    events: [{ CreatedTreeEvent: { value: { contractId: id('tree'), templateId: T.deal, createArgument: { dealId: DEAL_ID }, signatories: [t.party], observers: [] } } }],
  };
};
logged('valuer', 'create ValuationReport');
logged('lpac', 'create FairnessOpinion');
logged('lpac', 'RecordConsent');
logged('gp', 'SetClearing');
logged('buyer', 'create SealedBid');
logged('lpExiting', 'create LPElection');
logged('gp', 'AllocationFactory_Allocate (unit-buyer)');
logged('buyer', 'refused cross-party sign', 'failed'); // a specimen for the error styling
logged('gp', 'Close');

function main() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/acs.json`, JSON.stringify(acs, null, 2));
  writeFileSync(`${OUT}/audit.json`, JSON.stringify(audit, null, 2));
  writeFileSync(`${OUT}/updates.json`, JSON.stringify(updates, null, 2));
  console.log(`wrote ${acs.length} contracts, ${audit.length} audit rows, ${Object.keys(updates).length} update trees → ${OUT}`);
}

// Export the built fixtures so the test can assert without reading disk.
export { acs, audit, updates };
if (process.argv[1] && process.argv[1].endsWith('generate-fixtures.ts')) main();
