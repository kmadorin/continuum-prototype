// app/scripts/seed.ts — run: npx tsx --env-file=.env scripts/seed.ts
import { writeFileSync } from 'node:fs';
import { HttpLedgerClient } from '../ledger-client/src/client';
const BASE = 'http://localhost:8788';
const NS = process.env.FN_NAMESPACE!;
const P = (hint: string) => `${hint}::${NS}`;
const personas = { gp: 'continuum-gp-demo', buyer: 'continuum-buyer-demo', buyer2: 'continuum-buyer2-demo',
  lp: 'continuum-lp-demo', lp2: 'continuum-lp2-demo', lpac: 'continuum-lpac-demo',
  vehicle: 'continuum-gp-demo' /* collapsed */ };

async function allocate(hint: string) {
  // party allocation goes through the proxy too; pass userId='6' to bind act-as (VERIFIED requirement)
  await fetch(`${BASE}/v2/parties`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partyIdHint: hint, userId: '6' }) }); // 200 or already-exists both fine
}
async function main() {
  const c = new HttpLedgerClient(BASE);
  for (const hint of new Set(Object.values(personas))) await allocate(hint);
  const gp = P(personas.gp), buyer = P(personas.buyer), lp = P(personas.lp);
  // mint mock-USDC to buyer, asset + CV treasury to gp (registry-admin authored → single actAs gp)
  const mint = (owner: string, instId: string, amount: string, id: string) => c.submit({ commandId: id,
    actAs: [gp], commands: [{ CreateCommand: { templateId: '#continuum-contracts:Continuum.Registry:RegistryHolding',
      createArguments: { admin: gp, owner, instId, amount, locked: false, meta_: {} } } }] });
  await mint(buyer, 'USDC', '20000000.0', `seed-usdc-${Date.now()}`);
  await mint(gp, 'MERIDIAN-CV-I', '50000000.0', `seed-cv-${Date.now()}`);
  await mint(gp, 'PROJECT-ATLAS', '1.0', `seed-asset-${Date.now()}`);
  await c.submit({ commandId: `seed-fac-${Date.now()}`, actAs: [gp], commands: [{ CreateCommand: {
    templateId: '#continuum-contracts:Continuum.Registry:RegistryAllocationFactory', createArguments: { admin: gp } } }] });
  const registry = { namespace: NS, synchronizerId: (await c.activeContracts(gp, { includeBlob: false }))[0]?.synchronizerId ?? 'global-domain',
    packageName: 'continuum-contracts', parties: Object.fromEntries(Object.entries(personas).map(([k, h]) => [k, P(h)])) };
  writeFileSync(new URL('../party-registry.json', import.meta.url), JSON.stringify(registry, null, 2));
  console.log('wrote party-registry.json', registry.parties);
}
main().catch(e => { console.error(e); process.exit(1); });
