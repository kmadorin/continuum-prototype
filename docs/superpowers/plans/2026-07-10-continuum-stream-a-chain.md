# Continuum Stream A (chain/deploy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reverse-proxy + typed `LedgerClient` + a `seed` script that deploys/creates our contracts on the shared 5N devnet validator and emits `party-registry.json`, then prove the minimal atomic `Close` (1 buyer/1 LP) over JSON.

**Architecture:** Node/TS. A serverless reverse-proxy holds the M2M secret, does OIDC exchange + 8h refresh, injects `Authorization: Bearer`, forwards `/v2/*` (solves CORS + secret-hiding). A `LedgerClient` class (hand-written JSON payloads, incl. `disclosedContracts`) implements the interface Stream B mocks. A `seed` script replays `Seed.daml`'s setup as JSON and writes `party-registry.json` — the A/B handoff artifact.

**Tech Stack:** Node 22, TypeScript, Vitest, `undici`/`fetch`. Proxy as a Cloudflare Worker (repo already has `.wrangler/`) or a tiny Express server. All JSON shapes are VERIFIED — see `docs/devnet-deploy-test-RESULT.md`.

**Ground truth (do not re-derive):**
- Auth: `POST https://auth.sandbox.fivenorth.io/application/o/token/`, `grant_type=client_credentials`, `client_id=validator-devnet-m2m`, `audience=validator-devnet-m2m`, `scope=daml_ledger_api`, secret from env `FN_SECRET` (correct chars end `…<REDACTED-SECRET-FRAGMENT>…`, capital I). JWT `sub="6"`, TTL 28800s.
- Ledger base: `https://ledger-api.validator.devnet.sandbox.fivenorth.io`. Token has `ParticipantAdmin`.
- Namespace: `1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8`. Synchronizer: `global-domain::1220b…`.
- `templateId` form: `#continuum-contracts:Continuum.Registry:RegistryHolding`. `TextMap` → `{}` not `[]`.

---

## File Structure

- `app/proxy/` — reverse-proxy (secret + OIDC + `/v2/*` forward). `src/token.ts`, `src/proxy.ts`, `wrangler.jsonc` or `server.ts`.
- `app/ledger-client/` — `src/types.ts` (the shared `LedgerClient` interface + JSON types), `src/client.ts` (impl), `src/disclosure.ts` (createdEventBlob harvesting).
- `app/scripts/seed.ts` — devnet setup → writes `app/party-registry.json`.
- `app/scripts/close-minimal.ts` — the 1-buyer/1-LP atomic close proof.
- `.env.example`, `.gitignore` (add `.env`, `party-registry.json` optional).
- Tests: `app/ledger-client/test/*.test.ts` (unit, mocked fetch), `app/test/devnet.integration.test.ts` (live, gated by `FN_SECRET`).

---

## Task 1: Repo scaffold + secret hygiene

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/.env.example`, `app/vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Init the app package**

```bash
cd continuum-prototype && mkdir -p app/{proxy/src,ledger-client/src,ledger-client/test,scripts,test}
cd app && npm init -y && npm i -D typescript vitest @types/node tsx && npm i undici
npx tsc --init --module esnext --target es2022 --moduleResolution bundler --strict
```

- [ ] **Step 2: Add env template and gitignore the real secret**

Create `app/.env.example`:
```
FN_SECRET=<paste-shared-m2m-secret-here-NEVER-commit-the-real-one>
FN_AUTH_URL=https://auth.sandbox.fivenorth.io/application/o/token/
FN_LEDGER_URL=https://ledger-api.validator.devnet.sandbox.fivenorth.io
FN_NAMESPACE=1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8
```

Append to `continuum-prototype/.gitignore`:
```
app/.env
app/node_modules/
app/party-registry.json
```

- [ ] **Step 3: Verify secret is not tracked**

Run: `cd continuum-prototype && git check-ignore app/.env && echo OK`
Expected: `app/.env` then `OK`.

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/tsconfig.json app/.env.example app/vitest.config.ts .gitignore
git commit -m "chore(app): scaffold devnet app package + secret hygiene"
```

---

## Task 2: OIDC token manager (TDD)

**Files:**
- Create: `app/proxy/src/token.ts`
- Test: `app/ledger-client/test/token.test.ts`

- [ ] **Step 1: Write the failing test** (mock fetch; assert refresh logic, not the network)

```ts
import { describe, it, expect, vi } from 'vitest';
import { TokenManager } from '../../proxy/src/token';

const fakeJwt = 'h.e.s';
function fetchStub(expiresIn = 28800) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ access_token: fakeJwt, expires_in: expiresIn }) })) as any;
}

describe('TokenManager', () => {
  it('fetches once and caches until near expiry', async () => {
    const f = fetchStub();
    const tm = new TokenManager({ authUrl: 'x', secret: 's' }, f);
    expect(await tm.get()).toBe(fakeJwt);
    expect(await tm.get()).toBe(fakeJwt);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('refreshes when forced', async () => {
    const f = fetchStub();
    const tm = new TokenManager({ authUrl: 'x', secret: 's' }, f);
    await tm.get(); await tm.get(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('sends the correct client_credentials body', async () => {
    const f = fetchStub();
    const tm = new TokenManager({ authUrl: 'A', secret: 'SEK' }, f);
    await tm.get();
    const body = (f.mock.calls[0][1] as any).body as string;
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=validator-devnet-m2m');
    expect(body).toContain('audience=validator-devnet-m2m');
    expect(body).toContain('scope=daml_ledger_api');
    expect(body).toContain('SEK');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run ledger-client/test/token.test.ts`
Expected: FAIL — `Cannot find module '../../proxy/src/token'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/proxy/src/token.ts
type Cfg = { authUrl: string; secret: string };
export class TokenManager {
  private token?: string;
  private expiresAt = 0;
  constructor(private cfg: Cfg, private fetchImpl: typeof fetch = fetch) {}
  async get(force = false): Promise<string> {
    const now = Date.now();
    if (!force && this.token && now < this.expiresAt - 60_000) return this.token;
    const body = new URLSearchParams({
      grant_type: 'client_credentials', client_id: 'validator-devnet-m2m',
      client_secret: this.cfg.secret, audience: 'validator-devnet-m2m', scope: 'daml_ledger_api',
    }).toString();
    const res = await this.fetchImpl(this.cfg.authUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
    const j: any = await res.json();
    this.token = j.access_token;
    this.expiresAt = Date.now() + (j.expires_in ?? 28800) * 1000;
    return this.token!;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run ledger-client/test/token.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/proxy/src/token.ts app/ledger-client/test/token.test.ts
git commit -m "feat(proxy): OIDC token manager with 8h refresh"
```

---

## Task 3: Reverse-proxy forwarding `/v2/*` (TDD + live smoke)

**Files:**
- Create: `app/proxy/src/proxy.ts`, `app/proxy/src/server.ts`
- Test: `app/ledger-client/test/proxy.test.ts`

- [ ] **Step 1: Write the failing test** (proxy injects Bearer, forwards path + body, adds permissive CORS)

```ts
import { describe, it, expect, vi } from 'vitest';
import { handleProxy } from '../../proxy/src/proxy';

describe('handleProxy', () => {
  it('injects bearer, forwards path/body to ledger, returns response', async () => {
    const upstream = vi.fn(async () => ({ status: 200, headers: new Map(),
      text: async () => '{"offset":42}' })) as any;
    const tm = { get: async () => 'TOK' } as any;
    const req = { method: 'POST', path: '/v2/state/active-contracts', body: '{"x":1}' };
    const res = await handleProxy(req, { ledgerUrl: 'https://L', tm, fetchImpl: upstream });
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"offset":42}');
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://L/v2/state/active-contracts');
    expect((init.headers as any).Authorization).toBe('Bearer TOK');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
  it('refreshes token once on 401 then retries', async () => {
    let n = 0;
    const upstream = vi.fn(async () => (++n === 1
      ? { status: 401, headers: new Map(), text: async () => 'expired' }
      : { status: 200, headers: new Map(), text: async () => 'ok' })) as any;
    const tm = { get: vi.fn(async () => 'TOK') } as any;
    const res = await handleProxy({ method: 'GET', path: '/v2/state/ledger-end', body: '' },
      { ledgerUrl: 'https://L', tm, fetchImpl: upstream });
    expect(res.status).toBe(200);
    expect(tm.get).toHaveBeenCalledWith(true); // forced refresh
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run ledger-client/test/proxy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/proxy/src/proxy.ts
type Req = { method: string; path: string; body: string };
type Opts = { ledgerUrl: string; tm: { get(f?: boolean): Promise<string> }; fetchImpl?: any };
const CORS = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
export async function handleProxy(req: Req, o: Opts) {
  const f = o.fetchImpl ?? fetch;
  const call = async (tok: string) => f(`${o.ledgerUrl}${req.path}`, {
    method: req.method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: req.method === 'GET' ? undefined : req.body });
  let up = await call(await o.tm.get());
  if (up.status === 401) up = await call(await o.tm.get(true));
  return { status: up.status, body: await up.text(), headers: { ...CORS } };
}
```

```ts
// app/proxy/src/server.ts  (Node dev server; the Worker variant reuses handleProxy)
import { createServer } from 'node:http';
import { TokenManager } from './token';
import { handleProxy } from './proxy';
const tm = new TokenManager({ authUrl: process.env.FN_AUTH_URL!, secret: process.env.FN_SECRET! });
const ledgerUrl = process.env.FN_LEDGER_URL!;
createServer(async (r, w) => {
  if (r.method === 'OPTIONS') { w.writeHead(204, { 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); return w.end(); }
  const chunks: Buffer[] = []; for await (const c of r) chunks.push(c as Buffer);
  const res = await handleProxy({ method: r.method!, path: r.url!, body: Buffer.concat(chunks).toString() }, { ledgerUrl, tm });
  w.writeHead(res.status, { 'Content-Type': 'application/json', ...res.headers }); w.end(res.body);
}).listen(8788, () => console.log('proxy on :8788'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run ledger-client/test/proxy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Live smoke through the proxy**

Run: `cd app && node --env-file=.env --experimental-strip-types proxy/src/server.ts &` then
`curl -s http://localhost:8788/v2/state/ledger-end`
Expected: `{"offset":<number>}` — proves secret injection + forwarding + CORS end-to-end.

- [ ] **Step 6: Commit**

```bash
git add app/proxy/src/proxy.ts app/proxy/src/server.ts app/ledger-client/test/proxy.test.ts
git commit -m "feat(proxy): forward /v2/* with bearer injection + 401 refresh + CORS"
```

---

## Task 4: LedgerClient types + core methods (TDD)

**Files:**
- Create: `app/ledger-client/src/types.ts`, `app/ledger-client/src/client.ts`
- Test: `app/ledger-client/test/client.test.ts`

- [ ] **Step 1: Write the failing test** (mock fetch; assert exact JSON body shapes proven on devnet)

```ts
import { describe, it, expect, vi } from 'vitest';
import { HttpLedgerClient } from '../src/client';

const okJson = (obj: any) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });

describe('HttpLedgerClient', () => {
  it('ledgerEnd GETs /v2/state/ledger-end', async () => {
    const f = vi.fn(async () => okJson({ offset: 7 })) as any;
    const c = new HttpLedgerClient('http://p', f);
    expect(await c.ledgerEnd()).toEqual({ offset: 7 });
    expect(f.mock.calls[0][0]).toBe('http://p/v2/state/ledger-end');
  });
  it('submit posts submit-and-wait with actAs array + disclosedContracts', async () => {
    const f = vi.fn(async () => okJson({ updateId: 'u1', completionOffset: 9 })) as any;
    const c = new HttpLedgerClient('http://p', f);
    const r = await c.submit({ commandId: 'c1', actAs: ['A', 'B'],
      commands: [{ CreateCommand: { templateId: '#pkg:M:T', createArguments: { meta_: {} } } }],
      disclosedContracts: [{ contractId: 'x', createdEventBlob: 'b', templateId: '#pkg:M:T', synchronizerId: 's' }] });
    expect(r.updateId).toBe('u1');
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(body.actAs).toEqual(['A', 'B']);
    expect(body.disclosedContracts).toHaveLength(1);
    expect(f.mock.calls[0][0]).toBe('http://p/v2/commands/submit-and-wait');
  });
  it('activeContracts posts with activeAtOffset + party filter and includeBlob flag', async () => {
    let call = 0;
    const f = vi.fn(async () => (call++ === 0 ? okJson({ offset: 100 })
      : okJson([{ contractEntry: { JsActiveContract: { createdEvent: { contractId: 'k', templateId: '#pkg:M:T', createArgument: {} } } } }]))) as any;
    const c = new HttpLedgerClient('http://p', f);
    const out = await c.activeContracts('P', { includeBlob: true });
    const body = JSON.parse((f.mock.calls[1][1] as any).body);
    expect(body.activeAtOffset).toBe(100);
    expect(body.filter.filtersByParty.P.cumulative[0].identifierFilter.WildcardFilter.value.includeCreatedEventBlob).toBe(true);
    expect(out[0].contractId).toBe('k');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run ledger-client/test/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types**

```ts
// app/ledger-client/src/types.ts
export type JsCommand =
  | { CreateCommand: { templateId: string; createArguments: Record<string, unknown> } }
  | { ExerciseCommand: { templateId: string; contractId: string; choice: string; choiceArgument: Record<string, unknown> } };
export type Disclosed = { contractId: string; createdEventBlob: string; templateId: string; synchronizerId: string };
export type SubmitReq = { commandId: string; actAs: string[]; readAs?: string[]; commands: JsCommand[]; disclosedContracts?: Disclosed[] };
export type ActiveContract = { contractId: string; templateId: string; args: Record<string, unknown>; createdEventBlob?: string; synchronizerId?: string };
export interface LedgerClient {
  ledgerEnd(): Promise<{ offset: number }>;
  submit(cmd: SubmitReq): Promise<{ updateId: string; completionOffset: number }>;
  activeContracts(party: string, opts?: { templateId?: string; includeBlob?: boolean }): Promise<ActiveContract[]>;
  fetchDisclosed(party: string, contractId: string): Promise<Disclosed>;
}
```

- [ ] **Step 4: Write the client implementation**

```ts
// app/ledger-client/src/client.ts
import type { LedgerClient, SubmitReq, ActiveContract, Disclosed } from './types';
export class HttpLedgerClient implements LedgerClient {
  constructor(private base: string, private fetchImpl: typeof fetch = fetch) {}
  private async post(path: string, body: unknown) {
    const r = await this.fetchImpl(`${this.base}${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new Error(`${path} → ${r.status}: ${txt}`);
    return JSON.parse(txt);
  }
  async ledgerEnd() {
    const r = await this.fetchImpl(`${this.base}/v2/state/ledger-end`);
    return JSON.parse(await r.text());
  }
  async submit(cmd: SubmitReq) { return this.post('/v2/commands/submit-and-wait', cmd); }
  async activeContracts(party: string, opts: { templateId?: string; includeBlob?: boolean } = {}) {
    const { offset } = await this.ledgerEnd();
    const wildcard = { WildcardFilter: { value: { includeCreatedEventBlob: !!opts.includeBlob } } };
    const filter = { filtersByParty: { [party]: { cumulative: [{ identifierFilter: wildcard }] } } };
    const raw = await this.post('/v2/state/active-contracts', { activeAtOffset: offset, filter, verbose: false });
    const items = Array.isArray(raw) ? raw : [raw];
    return items.map((e: any) => {
      const c = e.contractEntry?.JsActiveContract; const ce = c?.createdEvent ?? {};
      return { contractId: ce.contractId, templateId: ce.templateId, args: ce.createArgument ?? {},
        createdEventBlob: ce.createdEventBlob, synchronizerId: c?.synchronizerId } as ActiveContract;
    }).filter(a => a.contractId && (!opts.templateId || a.templateId?.endsWith(opts.templateId)));
  }
  async fetchDisclosed(party: string, contractId: string): Promise<Disclosed> {
    const acs = await this.activeContracts(party, { includeBlob: true });
    const hit = acs.find(a => a.contractId === contractId);
    if (!hit?.createdEventBlob) throw new Error(`no blob for ${contractId}`);
    return { contractId, createdEventBlob: hit.createdEventBlob, templateId: hit.templateId, synchronizerId: hit.synchronizerId! };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app && npx vitest run ledger-client/test/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add app/ledger-client/src app/ledger-client/test/client.test.ts
git commit -m "feat(ledger-client): typed JSON client (submit/acs/disclosure)"
```

---

## Task 5: Live integration — one command + one query through the client (gated)

**Files:**
- Create: `app/test/devnet.integration.test.ts`

- [ ] **Step 1: Write the live test** (skips unless `FN_SECRET` present; hits the proxy on :8788)

```ts
import { describe, it, expect } from 'vitest';
import { HttpLedgerClient } from '../ledger-client/src/client';
const NS = process.env.FN_NAMESPACE!;
const run = process.env.FN_SECRET ? describe : describe.skip; // requires proxy running on :8788
run('devnet integration', () => {
  const c = new HttpLedgerClient('http://localhost:8788');
  it('ledgerEnd returns an offset', async () => {
    const e = await c.ledgerEnd(); expect(typeof e.offset).toBe('number');
  });
  it('creates a RegistryHolding and reads it back', async () => {
    const gp = `continuum-gp-demo::${NS}`, buyer = `continuum-buyer-demo::${NS}`;
    const id = `it-${Date.now()}`;
    const r = await c.submit({ commandId: id, actAs: [gp], commands: [{ CreateCommand: {
      templateId: '#continuum-contracts:Continuum.Registry:RegistryHolding',
      createArguments: { admin: gp, owner: buyer, instId: 'IT-USD', amount: '1.0', locked: false, meta_: {} } } }] });
    expect(r.updateId).toBeTruthy();
    const acs = await c.activeContracts(gp, { templateId: 'RegistryHolding' });
    expect(acs.some(a => (a.args as any).instId === 'IT-USD')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it live** (proxy must be running; parties `continuum-gp-demo`/`continuum-buyer-demo` already allocated on devnet)

Run: `cd app && node --env-file=.env --experimental-strip-types proxy/src/server.ts & sleep 1 && node --env-file=.env node_modules/.bin/vitest run test/devnet.integration.test.ts`
Expected: PASS — 2 tests; a new `RegistryHolding IT-USD` visible in gp's ACS.

- [ ] **Step 3: Commit**

```bash
git add app/test/devnet.integration.test.ts
git commit -m "test(app): live devnet integration through the proxy (gated on FN_SECRET)"
```

---

## Task 6: `seed` script → emits `party-registry.json` (the A/B artifact)

**Files:**
- Create: `app/scripts/seed.ts`
- Output: `app/party-registry.json`

- [ ] **Step 1: Write the seed script** (idempotent: allocate parties if absent, mint holdings, create factory + deal, write registry)

```ts
// app/scripts/seed.ts — run: node --env-file=.env --experimental-strip-types scripts/seed.ts
import { writeFileSync } from 'node:fs';
import { HttpLedgerClient } from '../ledger-client/src/client';
const BASE = 'http://localhost:8788';
const NS = process.env.FN_NAMESPACE!;
const P = (hint: string) => `${hint}::${NS}`;
const personas = { gp: 'continuum-gp-demo', buyer: 'continuum-buyer-demo', lp: 'continuum-lp-demo',
  lpac: 'continuum-lpac-demo', vehicle: 'continuum-gp-demo' /* collapsed */ };

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
```

- [ ] **Step 2: Run the seed live** (proxy up)

Run: `cd app && node --env-file=.env --experimental-strip-types scripts/seed.ts`
Expected: logs `wrote party-registry.json` with 5 persona party IDs; file exists with real `::1220a14c…` IDs.

- [ ] **Step 3: Verify the artifact shape**

Run: `cd app && node -e "const r=require('./party-registry.json'); if(!r.parties.gp.includes('::1220'))throw 0; console.log('OK',Object.keys(r.parties))"`
Expected: `OK [ 'gp', 'buyer', 'lp', 'lpac', 'vehicle' ]`.

- [ ] **Step 4: Commit** (registry.json is gitignored; commit only the script)

```bash
git add app/scripts/seed.ts
git commit -m "feat(app): devnet seed script emits party-registry.json (A/B seam)"
```

---

## Task 7: Minimal atomic Close (1 buyer / 1 LP) — the floor money-shot

**Files:**
- Create: `app/scripts/close-minimal.ts`
- Reference: `continuum-daml/scripts/daml/Continuum/Settle.daml` (the leg-allocation orchestration to mirror as JSON), `Deal.daml:69` (`Close` choice signature).

> This is the highest-risk task; mechanism is PROVEN (multi-`actAs` + `disclosedContracts` spikes GREEN). Build it as: (1) drive the deal to `Electing` via `SetClearing`/`RecordConsent`/`OpenElections`; (2) create the antecedent docs + `IssuanceBasis`; (3) for each of the 2 legs, allocate via the disclosed `RegistryAllocationFactory` (`AllocationFactory_Allocate` WITH `extraArgs`), harvest the resulting `Allocation` cid; (4) create the co-signed `ExecDelegation`s (multi-`actAs`); (5) exercise `Close` with `{basisCid, legExecs, burns, fairnessHash}`, passing every referenced contract in `disclosedContracts`; assert one `updateId`, then query `SettlementReceipt` + post-close `RegistryHolding` balances.

- [ ] **Step 1: Encode the exact `Close` argument shape from the Daml** — read `Deal.daml:69-90` and the `Settle.daml` `allocateForMeta` helper; write the JSON `choiceArgument` mirroring `{basisCid, legExecs:[{_1,_2}...], burns:[...], fairnessHash}`. (Tuples serialize as `{"_1":…,"_2":…}`.)

- [ ] **Step 2: Build the allocation-leg helper**

```ts
// harvest factory blob, allocate a leg as `sender`, return the Allocation cid
async function allocateLeg(c, gp, sender, receiver, instId, amount, holdingCid, factory, legId) {
  const disc = await c.fetchDisclosed(gp, factory);
  const spec = { settlement: { executor: gp, settlementRef: { id: legId, cid: null },
      requestedAt: NOW, allocateBefore: NOW, settleBefore: NOW, meta: { values: {} } },
    transferLegId: legId, transferLeg: { sender, receiver, amount,
      instrumentId: { admin: gp, id: instId }, meta: { values: {} } } };
  const r = await c.submit({ commandId: `alloc-${legId}`, actAs: [sender], disclosedContracts: [disc],
    commands: [{ ExerciseCommand: { templateId: '#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory',
      contractId: factory, choice: 'AllocationFactory_Allocate',
      choiceArgument: { expectedAdmin: gp, allocation: spec, requestedAt: NOW, inputHoldingCids: [holdingCid],
        extraArgs: { context: { values: {} }, meta: { values: {} } } } } }] });
  // read back the created Allocation cid from the update / ACS
  return (await c.activeContracts(sender, { templateId: 'Allocation' })).slice(-1)[0].contractId;
}
```

- [ ] **Step 3: Run the minimal close live** and assert atomicity

Run: `cd app && node --env-file=.env --experimental-strip-types scripts/close-minimal.ts`
Expected: single `updateId` for the `Close`; afterwards a `SettlementReceipt` exists and buyer holds CV units + exiting LP holds USDC (balances moved in ONE tx). If any leg is malformed the whole `Close` aborts (all-or-nothing) — that is the demoable clincher.

- [ ] **Step 4: Record the working close recipe** in `docs/devnet-deploy-test-RESULT.md` (append the exact `Close` JSON that worked).

- [ ] **Step 5: Commit**

```bash
git add app/scripts/close-minimal.ts docs/devnet-deploy-test-RESULT.md
git commit -m "feat(app): minimal atomic Close (1 buyer/1 LP) proven on devnet"
```

---

## Self-review notes
- Spec §2/§4 covered: proxy (T2–3), LedgerClient interface+impl (T4), party-registry (T6), minimal Close (T7).
- Types consistent: `LedgerClient`/`SubmitReq`/`Disclosed`/`ActiveContract` defined once in T4 `types.ts`, reused T5–7.
- Risks: R1 proxy (T3 step 5 live smoke), R2 Close assembly (T7, mechanism pre-proven), R3 refresh (T3 401 path).
- **Handoff to Stream B:** `app/ledger-client/src/types.ts` (the interface to mock) + `app/party-registry.json` (real IDs). B imports the type, never the impl, until convergence.
