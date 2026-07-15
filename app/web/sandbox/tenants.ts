// Sandbox tenants — the six custody seats, with THROWAWAY but DETERMINISTIC keys.
//
// The real spine loads custody-keys.json (gitignored mnemonics for parties that exist
// on devnet). The sandbox has no devnet and no secrets: it derives each seat's mnemonic
// from the role name, so a dev-server restart yields the SAME party ids — a signed-in
// browser tab survives the restart instead of silently pointing at a party that no
// longer exists (which read as "metrics never load": every query returned empty).
// The ledger itself is in-memory and resets with the process — a pristine deal, same
// seats. Nothing here is a credential: these keys sign an in-memory ledger only.
//
// Party ids carry the `-sbx` marker so a screenshot can never be mistaken for devnet.
import { createHash } from 'node:crypto';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { keyFromMnemonic } from '../../ledger-client/src/ed25519';
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
    // Deterministic 128-bit entropy from the role name → a stable, valid mnemonic.
    const entropy = createHash('sha256').update(`continuum-sandbox-${role}`).digest().subarray(0, 16);
    const mnemonic = entropyToMnemonic(entropy, wordlist);
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
