// app/custody/server.mock.ts
// The DESIGNER PREVIEW entrypoint. Boots the SAME createApp() as server.ts against an
// in-memory mock ledger — no keys, no devnet, no secrets.
//
// Run: cd app && npx tsx custody/server.mock.ts
//
// WHY AN OUTER APP: two things have no AppDeps hook and must be handled outside the
// inner app, which is why this file is not just a deps swap:
//   1. demoEpoch is a closure-local `let` (app.ts:309) — uninjectable. If /demo/reset
//      reached the inner app the epoch would bump, rotating dealId to M2 and orphaning
//      every fixture. We intercept it and re-seed the store instead.
//   2. app.get('/*') (app.ts:543) reads index.html off disk with no hook, so the
//      PREVIEW banner is injected by serving index.html from the outer app FIRST.
// Neither requires touching app.ts — that is what keeps the ui-ux merge diff pure UI.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { tenantsFromRecords } from './tenants';
import { createApp, type AuditEntry, type Signer } from './app';
import { MockLedgerStore } from './mock/store';
import { makeMockFetch, MOCK_LEDGER_BASE } from './mock/ledger-fetch';
import { mockTenantRecords, type AcsFixture, type AuditFixture, type UpdatesFixture } from './mock/fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const FIXTURES = resolve(__dirname, 'fixtures');
const PORT = Number(process.env.PORT ?? 8787);

// NB: the PREVIEW disclaimer is rendered by the SPA itself (App.tsx, host-gated to
// preview/localhost) as an in-flow strip that pushes the layout down — the server no
// longer injects a fixed overlay on top of it.

// The epoch-1 deal block, identical to dealKeys(1) in app.ts:311. The inner app serves
// this at /registry; /demo/reset echoes it so the SPA re-adopts the SAME keys (the mock
// is pinned to epoch 1 — see the demoEpoch note below).
const EPOCH1_DEAL = { epoch: 1, dealId: 'M1', cv: 'Meridian CV I', unit: 'MERIDIAN-CV-I', usdc: 'USDC' };

/**
 * Refuse to boot if key material is in the environment. Mock mode and real keys must
 * never coexist in one process.
 *
 * SCOPE, honestly: this stops keys leaking INTO the mock. It does nothing about the
 * inverse (the mock served FROM prod) — that is prevented by the deploy-scoped fly
 * tokens (the preview token cannot deploy to prod) and caught by the banner.
 */
export function assertMockEnv(env: Record<string, string | undefined>): void {
  for (const k of ['CUSTODY_KEYS_JSON', 'FN_SECRET']) {
    if (env[k]) throw new Error(`${k} is set — refusing to boot the MOCK server with real key material present.`);
  }
}

const readFixture = <T>(name: string): T => JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as T;

export function createMockApp(opts: { indexHtml?: string } = {}) {
  const acs = readFixture<AcsFixture>('acs.json');
  const audit = readFixture<AuditFixture>('audit.json');
  const updates = readFixture<UpdatesFixture>('updates.json');

  const store = new MockLedgerStore();
  const seedStore = () => {
    store.seed(acs);
    for (const [updateId, tree] of Object.entries(updates)) store.seedTree(updateId, tree);
  };
  seedStore();

  // Tenants come from the canonical MOCK_PARTIES map — the SAME party strings the fixtures
  // reference (see mock/fixtures.ts). The inner app derives /registry from these + dealKeys(1).
  const tenants = tenantsFromRecords(mockTenantRecords());

  // The signer ignores key/fingerprint — nothing verifies a signature here. It MUST
  // materialize creates: useLedger.pollForContract polls the ACS after every submit.
  const signer: Signer = {
    async submitSigned(party, _key, _fingerprint, commands) {
      return { updateId: store.submit([party], commands).updateId };
    },
  };
  // NB: no `reads` port is wired. createApp only uses deps.reads for the auto-seed
  // idempotency check, and we set seedOnBoot:false + intercept /demo/reset, so that path
  // never runs. Omitting it keeps the mock honest about what it actually exercises.

  const auditLog: AuditEntry[] = [...audit];
  const staticRoot = resolve(APP_DIR, 'web/dist');

  const inner = createApp({
    tenants,
    signer,
    sessionSecret: process.env.CUSTODY_SESSION_SECRET ?? 'preview-session-secret',
    ledgerBase: MOCK_LEDGER_BASE,
    token: async () => 'mock-token',
    fetchImpl: makeMockFetch(store),
    audit: auditLog,
    staticRoot,
    secureCookie: process.env.NODE_ENV === 'production',
    // Fixtures already contain the ValuationReport; let them own it rather than
    // depending on the seed path's dedup behaviour against a mock store.
    seedOnBoot: false,
  });

  const app = new Hono();

  // Intercepted: never reaches the inner app, so demoEpoch stays 1 forever. For the
  // designer this is strictly better — Reset means "restore pristine state".
  app.post('/demo/reset', (c) => {
    seedStore();
    auditLog.length = 0;
    auditLog.push(...audit);
    return c.json({ deal: EPOCH1_DEAL });
  });

  const indexHtml = (): string | null => {
    if (opts.indexHtml !== undefined) return opts.indexHtml;
    const index = resolve(staticRoot, 'index.html');
    if (!existsSync(index)) return null;
    return readFileSync(index, 'utf8');
  };
  const serveIndex = (c: any) => {
    const html = indexHtml();
    return html === null
      ? c.text('frontend build not found — run the Vite build (web/dist)', 404)
      : c.html(html);
  };
  app.get('/', serveIndex);
  app.get('/index.html', serveIndex);

  app.route('/', inner);
  return { app, store };
}

function main() {
  assertMockEnv(process.env);
  const { app } = createMockApp();
  console.log('MOCK custody backend — simulated ledger, no keys, no devnet.');
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`mock custody backend listening on http://localhost:${info.port}`);
  });
}

// Only run when executed directly, so tests can import the exports above.
if (process.argv[1] && process.argv[1].endsWith('server.mock.ts')) main();
