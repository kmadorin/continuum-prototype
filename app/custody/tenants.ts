// app/custody/tenants.ts
// Load the gitignored custody-keys.json into in-memory tenants. Each tenant's mnemonic
// is derived into an Ed25519Key ONCE at boot and held only in memory. The mnemonic and
// key bytes are NEVER logged and NEVER leave the process.
import { readFileSync } from 'node:fs';
import { keyFromMnemonic, type Ed25519Key } from '../ledger-client/src/ed25519';

/** On-disk shape in custody-keys.json (contains secret mnemonics — gitignored). */
export type TenantRecord = {
  tenant: string;
  custodianName: string;
  role: string;
  party: string;
  mnemonic: string;
  fingerprint: string;
  username: string;
  password: string;
};

/** In-memory runtime tenant. `password` kept for login check; `key` never serialized. */
export type TenantRuntime = {
  tenant: string;
  custodianName: string;
  role: string;
  party: string;
  fingerprint: string;
  username: string;
  password: string;
  key: Ed25519Key;
};

export type TenantStore = {
  all: TenantRuntime[];
  byUsername: Map<string, TenantRuntime>;
  byParty: Map<string, TenantRuntime>;
};

export function tenantsFromRecords(records: TenantRecord[]): TenantStore {
  const all: TenantRuntime[] = records.map((r) => ({
    tenant: r.tenant,
    custodianName: r.custodianName,
    role: r.role,
    party: r.party,
    fingerprint: r.fingerprint,
    username: r.username,
    password: r.password,
    key: keyFromMnemonic(r.mnemonic),
  }));
  const byUsername = new Map(all.map((t) => [t.username, t]));
  const byParty = new Map(all.map((t) => [t.party, t]));
  return { all, byUsername, byParty };
}

export function loadTenants(path: string): TenantStore {
  const records = JSON.parse(readFileSync(path, 'utf8')) as TenantRecord[];
  return tenantsFromRecords(records);
}
