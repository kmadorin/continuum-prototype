// app/custody/app.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, type AuditEntry, type Signer } from './app';
import { tenantsFromRecords, type TenantRecord } from './tenants';
import { keyFromMnemonic } from '../ledger-client/src/ed25519';

// Two throwaway demo wallets: A (gp) and B (buyer). Deterministic mnemonics — TEST ONLY.
const MNEM_A = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const MNEM_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PARTY_A = `continuum-gp-test::${keyFromMnemonic(MNEM_A).derPubB64.slice(0, 8)}`;
const PARTY_B = `continuum-buyer-test::${keyFromMnemonic(MNEM_B).derPubB64.slice(0, 8)}`;
const FP_A = 'fingerprint-A';
const FP_B = 'fingerprint-B';

const RECORDS: TenantRecord[] = [
  { tenant: 'gp', custodianName: 'Fireblocks — GP Treasury', role: 'gp', party: PARTY_A, mnemonic: MNEM_A, fingerprint: FP_A, username: 'gp', password: 'gp-demo' },
  { tenant: 'buyer', custodianName: 'Copper — Northbeam Secondaries', role: 'buyer', party: PARTY_B, mnemonic: MNEM_B, fingerprint: FP_B, username: 'buyer', password: 'buyer-demo' },
];

const SECRET = 'test-session-secret';

function makeDeps(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  const audit: AuditEntry[] = [];
  const submitSigned = vi.fn(async () => ({ updateId: 'update-xyz' }));
  const signer: Signer = { submitSigned };
  const app = createApp({
    tenants: tenantsFromRecords(RECORDS),
    signer,
    sessionSecret: SECRET,
    ledgerBase: 'https://ledger.example',
    token: async () => 'M2M-TOKEN',
    audit,
    ...overrides,
  });
  return { app, audit, submitSigned };
}

async function login(app: any, username: string, password: string): Promise<string> {
  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0]; // "continuum_session=..."
}

const createCmd = { CreateCommand: { templateId: '#pkg:Continuum.Registry:RegistryAllocationFactory', createArguments: { admin: PARTY_A } } };

describe('login', () => {
  it('succeeds with valid creds and sets an httpOnly cookie', async () => {
    const { app } = makeDeps();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'gp', password: 'gp-demo' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ role: 'gp', party: PARTY_A, custodianName: 'Fireblocks — GP Treasury' });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('continuum_session=');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('rejects wrong password with 401', async () => {
    const { app } = makeDeps();
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'gp', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('session enforcement', () => {
  it('/action without a session → 401', async () => {
    const { app, submitSigned } = makeDeps();
    const res = await app.request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [createCmd] }),
    });
    expect(res.status).toBe(401);
    expect(submitSigned).not.toHaveBeenCalled();
  });

  it('/api without a session → 401', async () => {
    const { app } = makeDeps();
    const res = await app.request('/api/v2/state/ledger-end', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('rejects a forged/tampered session cookie', async () => {
    const { app } = makeDeps();
    const res = await app.request('/me', {
      method: 'GET',
      headers: { Cookie: 'continuum_session=eyJmb28iOiJiYXIifQ.deadbeef' },
    });
    expect(res.status).toBe(401);
  });
});

describe('per-party signing enforcement (the critical one)', () => {
  it('ALWAYS signs with the session party — never a client-supplied party', async () => {
    const { app, submitSigned } = makeDeps();
    const cookie = await login(app, 'gp', 'gp-demo'); // session = party A

    // Client tries to smuggle party B in the body; deal args also NAME party B as data.
    const res = await app.request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        party: PARTY_B, // <-- ignored for signing
        commands: [{ CreateCommand: { templateId: '#pkg:Continuum.Deal:ContinuationDeal', createArguments: { gp: PARTY_A, buyer: PARTY_B } } }],
      }),
    });

    // party smuggled as `party` triggers the refusal path (it names a foreign actAs).
    expect(res.status).toBe(403);
    expect(submitSigned).not.toHaveBeenCalled();
  });

  it('signs with session party A even when args legitimately reference other parties', async () => {
    const { app, submitSigned } = makeDeps();
    const cookie = await login(app, 'gp', 'gp-demo'); // session = party A
    const res = await app.request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      // legitimate: a deal that names buyer B as DATA (not as an acting party)
      body: JSON.stringify({ commands: [{ CreateCommand: { templateId: '#pkg:Continuum.Deal:ContinuationDeal', createArguments: { gp: PARTY_A, buyer: PARTY_B } } }] }),
    });
    expect(res.status).toBe(200);
    expect(submitSigned).toHaveBeenCalledTimes(1);
    // first arg is the acting party — MUST be the session party A, never B
    const [actingParty, key, fingerprint] = submitSigned.mock.calls[0]! as any[];
    expect(actingParty).toBe(PARTY_A);
    expect(actingParty).not.toBe(PARTY_B);
    expect(fingerprint).toBe(FP_A);
    // the key handed to the signer is party A's own Ed25519 key
    expect(key.derPubB64).toBe(keyFromMnemonic(MNEM_A).derPubB64);
  });

  it('refuses actAs naming another party → 403, does not sign', async () => {
    const { app, submitSigned } = makeDeps();
    const cookie = await login(app, 'gp', 'gp-demo'); // session = party A
    const res = await app.request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ actAs: [PARTY_B], commands: [createCmd] }),
    });
    expect(res.status).toBe(403);
    expect(submitSigned).not.toHaveBeenCalled();
  });
});

describe('audit', () => {
  it('appends a signed entry (fingerprint, updateId) on a successful action', async () => {
    const { app, audit } = makeDeps();
    const cookie = await login(app, 'gp', 'gp-demo');
    const res = await app.request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ commands: [createCmd] }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).updateId).toBe('update-xyz');
    expect(audit).toHaveLength(1);
    expect(audit[0]!).toMatchObject({
      username: 'gp',
      custodianName: 'Fireblocks — GP Treasury',
      party: PARTY_A,
      keyFingerprint: FP_A,
      updateId: 'update-xyz',
      outcome: 'signed',
    });
    expect(audit[0]!.action).toContain('create Continuum.Registry:RegistryAllocationFactory');
    // never leak key material
    expect(JSON.stringify(audit[0])).not.toContain(MNEM_A);
  });

  it('records a failed entry when signing throws', async () => {
    const submitSigned = vi.fn(async () => {
      throw new Error('ledger rejected: boom');
    });
    const { app, audit } = makeDeps({ signer: { submitSigned } });
    const cookie = await login(app, 'gp', 'gp-demo');
    const res = await app.request('/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ commands: [createCmd] }),
    });
    expect(res.status).toBe(502);
    expect(audit[0]!).toMatchObject({ outcome: 'failed', error: 'ledger rejected: boom' });
  });

  it('/audit only returns the session tenant’s entries', async () => {
    const { app } = makeDeps();
    const gpCookie = await login(app, 'gp', 'gp-demo');
    await app.request('/action', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: gpCookie }, body: JSON.stringify({ commands: [createCmd] }) });
    const buyerCookie = await login(app, 'buyer', 'buyer-demo');
    const res = await app.request('/audit', { method: 'GET', headers: { Cookie: buyerCookie } });
    expect(await res.json()).toEqual([]); // buyer sees none of gp's entries
    const gpRes = await app.request('/audit', { method: 'GET', headers: { Cookie: gpCookie } });
    expect((await gpRes.json())).toHaveLength(1);
  });
});

describe('reads proxy', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('forces filtersByParty to the session party and injects the M2M bearer', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const { app } = makeDeps({ fetchImpl: fetchImpl as any });
    const cookie = await login(app, 'gp', 'gp-demo'); // party A
    const res = await app.request('/api/v2/state/active-contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      // client tries to read party B's ACS
      body: JSON.stringify({ activeAtOffset: 5, filter: { filtersByParty: { [PARTY_B]: { cumulative: [] } } } }),
    });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]! as any[];
    expect(url).toBe('https://ledger.example/v2/state/active-contracts');
    expect(init.headers.Authorization).toBe('Bearer M2M-TOKEN');
    const forwarded = JSON.parse(init.body);
    // party B was stripped; only party A remains
    expect(Object.keys(forwarded.filter.filtersByParty)).toEqual([PARTY_A]);
    expect(forwarded.filter.filtersByParty[PARTY_B]).toBeUndefined();
  });
});
