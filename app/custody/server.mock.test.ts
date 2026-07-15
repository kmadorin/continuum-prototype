import { describe, it, expect, beforeEach } from 'vitest';
import { assertMockEnv, createMockApp } from './server.mock';

const login = async (app: any, username: string, password: string): Promise<string> => {
  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
};

describe('assertMockEnv', () => {
  it('throws when CUSTODY_KEYS_JSON is present', () => {
    expect(() => assertMockEnv({ CUSTODY_KEYS_JSON: '[]' })).toThrow(/CUSTODY_KEYS_JSON/);
  });

  it('throws when FN_SECRET is present', () => {
    expect(() => assertMockEnv({ FN_SECRET: 'shh' })).toThrow(/FN_SECRET/);
  });

  it('passes on a clean env', () => {
    expect(() => assertMockEnv({ PORT: '8787' })).not.toThrow();
  });
});

describe('mock app', () => {
  let app: any;
  beforeEach(() => {
    app = createMockApp().app;
  });

  it('serves /registry with the canonical mock parties at epoch 1', async () => {
    const body = await (await app.request('/registry')).json();
    expect(body.deal.epoch).toBe(1);
    expect(body.deal.dealId).toBe('M1');
    expect(Object.keys(body.parties).length).toBeGreaterThan(0);
  });

  it('logs in with the documented demo credentials', async () => {
    const cookie = await login(app, 'gp', 'gp-demo');
    expect(cookie).toContain('continuum_session=');
  });

  it('rejects a bad password', async () => {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'gp', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  it('seeds the ACS so a role view has content', async () => {
    const cookie = await login(app, 'gp', 'gp-demo');
    const { offset } = await (await app.request('/api/v2/state/ledger-end', { headers: { Cookie: cookie } })).json();
    const acs = await (await app.request('/api/v2/state/active-contracts', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeAtOffset: offset, filter: {}, verbose: false }),
    })).json();
    expect(acs.length).toBeGreaterThan(0);
  });

  it('closes the read/write loop: /action creates a contract a later ACS read sees', async () => {
    const cookie = await login(app, 'gp', 'gp-demo');
    const reg = await (await app.request('/registry')).json();
    const before = await (await app.request('/api/v2/state/active-contracts', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeAtOffset: 0, filter: {}, verbose: false }),
    })).json();

    // /action takes `{commands}` ONLY — app.ts reads body.commands and derives the audit
    // label itself via summarize(commands). Mirrors useLedger.ts:199.
    const act = await app.request('/action', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [{
          CreateCommand: {
            templateId: '#continuum:Continuum.Registry:RegistryAllocationFactory',
            createArguments: { admin: reg.parties.gp },
          },
        }],
      }),
    });
    expect(act.status).toBe(200);
    expect((await act.json()).updateId).toMatch(/^1220/);

    const after = await (await app.request('/api/v2/state/active-contracts', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeAtOffset: 0, filter: {}, verbose: false }),
    })).json();
    expect(after.length).toBe(before.length + 1);
  });

  it('serves a seeded audit trail so AuditTrail/HoldingReceipt render', async () => {
    const cookie = await login(app, 'gp', 'gp-demo');
    const rows = await (await app.request('/audit', { headers: { Cookie: cookie } })).json();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('POST /demo/reset restores pristine state WITHOUT bumping the epoch', async () => {
    const cookie = await login(app, 'gp', 'gp-demo');
    const reg = await (await app.request('/registry')).json();
    await app.request('/action', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [{ CreateCommand: { templateId: '#continuum:Continuum.Registry:RegistryAllocationFactory', createArguments: { admin: reg.parties.gp } } }],
      }),
    });
    const grown = await (await app.request('/api/v2/state/ledger-end', { headers: { Cookie: cookie } })).json();

    const reset = await app.request('/demo/reset', { method: 'POST' });
    expect((await reset.json()).deal.epoch).toBe(1);

    const back = await (await app.request('/api/v2/state/ledger-end', { headers: { Cookie: cookie } })).json();
    expect(back.offset).toBeLessThan(grown.offset);
    expect((await (await app.request('/registry')).json()).deal.dealId).toBe('M1');
  });

  it('injects the PREVIEW banner into index.html', async () => {
    const { app: withSpa } = createMockApp({ indexHtml: '<html><body><div id="root"></div></body></html>' });
    const res = await withSpa.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('PREVIEW');
  });
});
