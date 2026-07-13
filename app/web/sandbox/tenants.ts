// Sandbox tenants — the six custody seats, with THROWAWAY keys.
//
// The real spine loads custody-keys.json (gitignored mnemonics for parties that exist
// on devnet). The sandbox has no devnet and no secrets: it mints a fresh mnemonic per
// seat at boot, derives a real Ed25519 key from it (so the audit trail shows a real
// fingerprint and the signing code path is the real one), and synthesizes party ids in
// Canton's `name::namespace` shape. Nothing here is a credential — the keys sign against
// an in-memory ledger that lives and dies with the dev server.
//
// Party ids carry the `-sbx` marker so a screenshot can never be mistaken for devnet.
import { createHash } from 'node:crypto';
import { generateMnemonic, keyFromMnemonic } from '../../ledger-client/src/ed25519';
import { tenantsFromRecords, type TenantRecord, type TenantStore } from '../../custody/tenants';

/** Role → custodian display name. Verbatim from the deployed registry (institutional chrome). */
const SEATS: Array<{ role: string; custodianName: string }> = [
  { role: 'gp', custodianName: 'Fireblocks — GP Treasury' },
  { role: 'buyer', custodianName: 'Copper — Northbeam Secondaries' },
  { role: 'lpExiting', custodianName: 'Northgate Trust — Calder Family Office' },
  { role: 'lpRolling', custodianName: 'BNY Digital — Hawthorn Pension' },
  { role: 'lpac', custodianName: 'State Street Digital — LPAC' },
  { role: 'valuer', custodianName: 'Kroll Valuation Services' },
];

/** Canton-style fingerprint: `1220` (multihash sha256/32) ++ sha256(pubkey) hex. */
const fingerprintOf = (derPubB64: string): string =>
  `1220${createHash('sha256').update(Buffer.from(derPubB64, 'base64')).digest('hex')}`;

/**
 * Six tenants with fresh keys. Login is `<role>` / `<role>-demo` — the same demo
 * credentials as the deployed backend, so muscle memory carries over.
 */
export function sandboxTenants(): TenantStore {
  const records: TenantRecord[] = SEATS.map(({ role, custodianName }) => {
    const mnemonic = generateMnemonic();
    const fingerprint = fingerprintOf(keyFromMnemonic(mnemonic).derPubB64);
    return {
      tenant: role,
      custodianName,
      role,
      party: `continuum-${role}-sbx::${fingerprint}`,
      mnemonic,
      fingerprint,
      username: role,
      password: `${role}-demo`,
    };
  });
  return tenantsFromRecords(records);
}
