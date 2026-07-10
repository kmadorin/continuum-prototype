// app/scripts/lifecycle-check.ts — headless end-to-end smoke test.
// run: node --env-file=.env node_modules/.bin/tsx scripts/lifecycle-check.ts
//
// Drives one ContinuationDeal from creation "up to elections" against the REAL
// Canton 5N devnet, through the running reverse-proxy, using the SAME command
// builders the React UI uses (app/web/src/lib/ops.ts). This proves the wiring +
// field names are correct end-to-end before the browser demo run. It does NOT
// attempt the atomic Close (that's close-minimal.ts / Task 2).
//
// Stage choices (RecordConsent/SetClearing/OpenElections) are CONSUMING — each
// archives the deal and returns a new cid — so we re-query the ACS for the
// successor (filtered by our unique cv) after every transition.
import { readFileSync } from 'node:fs';
import { HttpLedgerClient } from '../ledger-client/src/client';
import { createDeal, sealedBid, setClearing, recordConsent, openElections, election } from '../web/src/lib/ops';

const BASE = 'http://localhost:8788';
const c = new HttpLedgerClient(BASE);
const registry = JSON.parse(readFileSync(new URL('../party-registry.json', import.meta.url), 'utf8'));
const P = registry.parties as Record<string, string>;

// unique per-run cv so we can find OUR deal among any stale devnet contracts
const CV = `Meridian CV I ${Date.now()}`;
const DEAL_DEFAULTS = {
  fund: 'Meridian Growth Fund III',
  cv: CV,
  asset: 'Project Atlas',
  refNav: '52000000.0',
  deadline: '2026-08-15T00:00:00Z',
};

function assertUpdate(label: string, res: { updateId?: string }) {
  const id = res?.updateId;
  if (!id || !id.startsWith('1220')) throw new Error(`${label}: expected a real updateId (1220…), got ${JSON.stringify(res)}`);
  console.log(`  ✅ ${label.padEnd(16)} updateId=${id}`);
}

async function findDeal(party: string): Promise<{ contractId: string; args: Record<string, unknown> }> {
  const deals = await c.activeContracts(party, { templateId: 'ContinuationDeal' });
  const mine = deals.filter((d) => d.args.cv === CV);
  const hit = mine[mine.length - 1];
  if (!hit) throw new Error(`no ContinuationDeal with cv="${CV}" visible to ${party}`);
  return hit;
}

async function main() {
  const gp = P.gp, buyer = P.buyer, lp = P.lp;
  const room = [P.buyer, P.buyer2, P.lp, P.lp2, P.lpac];

  console.log(`\nLifecycle check on devnet — cv="${CV}"\n`);

  // 1. GP opens the closing room (ContinuationDeal, stage=Bidding)
  assertUpdate('createDeal', await c.submit({
    commandId: `lc-deal-${Date.now()}`,
    actAs: [gp],
    commands: [createDeal({ gp, vehicle: P.vehicle, room, ...DEAL_DEFAULTS })],
  }));
  let deal = await findDeal(gp);
  console.log(`     deal cid ${deal.contractId} stage=${deal.args.stage}`);

  // 2. Buyer submits a sealed bid (peer-blind — sole signatory buyer)
  assertUpdate('sealedBid', await c.submit({
    commandId: `lc-bid-${Date.now()}`,
    actAs: [buyer],
    commands: [sealedBid({ gp, buyer, deal: CV, pctOfNav: '0.96', capacity: '20000000.0' })],
  }));

  // 3a. GP publishes the clearing price (SetClearing — consuming)
  assertUpdate('setClearing', await c.submit({
    commandId: `lc-price-${Date.now()}`,
    actAs: [gp],
    commands: [setClearing(deal.contractId, '0.96')],
  }));
  deal = await findDeal(gp);
  console.log(`     after SetClearing: cid ${deal.contractId} clearingPrice=${JSON.stringify(deal.args.clearingPrice)}`);

  // 3b. GP records LPAC consent (RecordConsent — consuming; gates OpenElections)
  assertUpdate('recordConsent', await c.submit({
    commandId: `lc-consent-${Date.now()}`,
    actAs: [gp],
    commands: [recordConsent(deal.contractId)],
  }));
  deal = await findDeal(gp);
  console.log(`     after RecordConsent: cid ${deal.contractId} stage=${deal.args.stage}`);

  // 3c. GP opens the election window (OpenElections — consuming; needs Consented + clearing)
  assertUpdate('openElections', await c.submit({
    commandId: `lc-open-${Date.now()}`,
    actAs: [gp],
    commands: [openElections(deal.contractId)],
  }));
  deal = await findDeal(gp);
  console.log(`     after OpenElections: cid ${deal.contractId} stage=${deal.args.stage}`);

  // 4. Exiting LP files an election (sell full position — peer-blind, sole signatory lp)
  assertUpdate('election(LP)', await c.submit({
    commandId: `lc-elect-${Date.now()}`,
    actAs: [lp],
    commands: [election({ lp, deal: CV, positionNav: '10000000.0', rollNav: '0.0', sellNav: '10000000.0', disclosureHash: 'demo-disclosure-hash' })],
  }));

  console.log(`\n✅ Full lifecycle up to elections is GREEN on devnet (stage=${deal.args.stage}).\n`);
}

main().catch((e) => { console.error('\n❌ lifecycle-check FAILED:\n', e); process.exit(1); });
