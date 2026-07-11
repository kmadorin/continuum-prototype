// app/custody/provision.ts
// Pre-provision 5 external-party custodian wallets (one per role/tenant), each with its
// OWN Ed25519 key. Writes:
//   - app/custody-keys.json  (GITIGNORED — mnemonics + demo creds; NEVER commit)
//   - app/party-registry.json (PUBLIC — party ids only)
// SECURITY: mnemonics/keys are NEVER logged. We verify custody-keys.json is gitignored
// before writing and refuse otherwise.
//
// Run once: cd app && node --experimental-strip-types --env-file=.env custody/provision.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { HttpLedgerClient } from '../ledger-client/src/client';
import { WalletClient } from '../ledger-client/src/wallet';
import { generateMnemonic } from '../ledger-client/src/ed25519';
import { TokenManager } from '../proxy/src/token';
import type { TenantRecord } from './tenants';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const REPO_DIR = resolve(APP_DIR, '..');
const SCRATCH =
  '/private/tmp/claude-501/-Users-kirillmadorin-Projects-hackathons-canton/0827f303-84e0-4d70-ad1e-817b0a1a48de/scratchpad';

const LEDGER = process.env.FN_LEDGER_URL ?? 'https://ledger-api.validator.devnet.sandbox.fivenorth.io';
const AUTH = process.env.FN_AUTH_URL ?? 'https://auth.sandbox.fivenorth.io/application/o/token/';
const NAMESPACE = process.env.FN_NAMESPACE ?? '';

const RUN = Date.now().toString().slice(-6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// role → {custodianName, username, password} for the story (see spec §3).
const ROLES: Array<{ role: string; tenant: string; custodianName: string }> = [
  { role: 'gp', tenant: 'gp', custodianName: 'Fireblocks — GP Treasury' },
  { role: 'buyer', tenant: 'buyer', custodianName: 'Copper — Northbeam Secondaries' },
  { role: 'lpExiting', tenant: 'lpExiting', custodianName: 'Northgate Trust — Calder Family Office' },
  { role: 'lpRolling', tenant: 'lpRolling', custodianName: 'BNY Digital — Hawthorn Pension' },
  { role: 'lpac', tenant: 'lpac', custodianName: 'State Street Digital — LPAC' },
  { role: 'valuer', tenant: 'valuer', custodianName: 'Kroll Valuation Services' },
];

function m2mSecret(): string {
  if (process.env.FN_SECRET) return process.env.FN_SECRET;
  return readFileSync(`${SCRATCH}/.fn_secret`, 'utf8').trim();
}

async function main() {
  console.log(`\n=== Continuum custody provisioning (run ${RUN}) ===`);
  const tokenManager = new TokenManager({ authUrl: AUTH, secret: m2mSecret() });
  const authFetch: typeof fetch = (async (url: any, init: any = {}) => {
    const token = await tokenManager.get();
    return fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  }) as unknown as typeof fetch;

  const reads = new HttpLedgerClient(LEDGER, authFetch);
  const wallet = new WalletClient(LEDGER, reads, authFetch);

  // Discover the synchronizer from an existing party in the public registry.
  const existingRegistry = JSON.parse(readFileSync(resolve(APP_DIR, 'party-registry.json'), 'utf8'));
  const seedParty: string = existingRegistry.parties?.gp;
  const sync = await wallet.discoverSynchronizer(seedParty);
  console.log(`synchronizer: ${sync}\n`);

  const records: TenantRecord[] = [];
  for (const { role, tenant, custodianName } of ROLES) {
    const mnemonic = generateMnemonic(); // secret — never logged
    const { partyId, fingerprint } = await wallet.onboard(`continuum-${role}-${RUN}`, mnemonic);
    records.push({
      tenant,
      custodianName,
      role,
      party: partyId,
      mnemonic,
      fingerprint,
      username: role,
      password: `${role}-demo`,
    });
    // Log identity ONLY (party + fingerprint are public) — never the mnemonic/key.
    console.log(`  onboarded ${role.padEnd(10)} → ${partyId}`);
    await sleep(1500); // space onboards to respect the shared sequencer rate limit
  }

  // ── write PUBLIC registry (party ids only) ────────────────────────────────────
  const parties = Object.fromEntries(records.map((r) => [r.role, r.party]));
  writeFileSync(
    resolve(APP_DIR, 'party-registry.json'),
    JSON.stringify(
      { namespace: NAMESPACE, synchronizerId: sync, packageName: 'continuum-contracts', parties },
      null,
      2,
    ),
  );

  // ── write GITIGNORED keys file — verify it's ignored FIRST, else refuse ────────
  const ignored = execSync('git check-ignore app/custody-keys.json || true', { cwd: REPO_DIR })
    .toString()
    .trim();
  if (!ignored.endsWith('custody-keys.json')) {
    throw new Error('REFUSING to write keys: app/custody-keys.json is NOT gitignored');
  }
  writeFileSync(resolve(APP_DIR, 'custody-keys.json'), JSON.stringify(records, null, 2));

  console.log('\nwrote party-registry.json (public) + custody-keys.json (gitignored)');
  console.log('demo logins (username / password):');
  for (const r of records) console.log(`  ${r.username.padEnd(10)} / ${r.password.padEnd(16)} — ${r.custodianName}`);
  console.log('\n✅ provisioning complete.');
}

main().catch((e) => {
  console.error('\n❌ provisioning FAILED:', e?.message ?? e);
  process.exit(1);
});
