# Continuum CI/CD + Designer Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-deploy `main` → the live fly app `continuum-custody`, and deploy a `ui-ux` branch → a new **secretless** `continuum-custody-preview` fly app that runs the same backend against an in-memory mock ledger, so a designer can redesign the frontend with zero mock-conditional code in the SPA.

**Architecture:** A new entrypoint `app/custody/server.mock.ts` wires the **same** `createApp()` from `app/custody/app.ts` with fake deps (`tenants`/`signer`/`fetchImpl`/`reads`/`token`/`audit`). One in-memory store backs reads *and* writes. An **outer Hono app** wraps the inner one to own the two things `AppDeps` cannot inject: `POST /demo/reset` (so the closure-local `demoEpoch` never bumps) and `index.html` (so the PREVIEW banner can be injected server-side). The SPA is **never modified**.

**Tech Stack:** TypeScript (ESM, `tsx`), Hono, vitest, Docker, fly.io, GitHub Actions, `@noble/hashes`.

**Spec:** `docs/superpowers/specs/2026-07-15-continuum-cicd-preview-design.md` (commit `ec9a2d5`)

---

## Background the engineer needs

**Run TypeScript with `npx tsx <file>`.** `node --experimental-strip-types` fails on this repo's extensionless imports. Tests: `cd app && npx vitest run`.

**Working dir is `app/`** for everything below unless stated. Repo root is its parent.

**Key facts, already verified — do not re-litigate:**

- `createApp(deps: AppDeps)` (`custody/app.ts:158`) is fully DI'd. `custody/server.ts` is the only place devnet deps are constructed. Read both before starting.
- `tenantsFromRecords` (`custody/tenants.ts:38`) copies `r.party` **verbatim** and derives `key` from `r.mnemonic` **separately**. They are independent; nothing validates they correspond. This is why mock tenants can **adopt** real captured party IDs with dummy mnemonics.
- `demoEpoch` is a closure-local `let` at `custody/app.ts:309`. **It cannot be injected, read, or reset from outside.** Hence the outer wrapper intercepts `/demo/reset`.
- `custody/app.ts:543` registers `app.get('/*')` which reads `index.html` off disk. No hook. Hence the outer wrapper serves `/` and `/index.html` first.
- `deps.fetchImpl` is used by **two** routes: the `/api/*` reads proxy (`app.ts:271`) and `/ledger/update/:updateId` (`app.ts:406`). Both target `${deps.ledgerBase}...`. That is the single interception point for the fake ledger.
- `/ledger/update/:updateId` issues a **POST** to `${ledgerBase}/v2/updates/update-by-id` with body `{updateId, updateFormat}` — not a GET.
- `HttpLedgerClient.activeContracts` (`ledger-client/src/client.ts:23`) calls `ledgerEnd()` (GET) **then** POSTs `/v2/state/active-contracts`, and unwraps `contractEntry.JsActiveContract.createdEvent`. The mock must produce that exact shape.
- `forceParty` (`app.ts:133`) rewrites the ACS filter to the session party. The mock's ACS handler must read `filter.filtersByParty` to know whose projection to return.
- `fetchDisclosed` has **no caller in `web/src`**. Dropping `createdEventBlob` is safe.
- `fingerprint` in prod comes from **Canton** (`wallet.ts:115`, `topo.publicKeyFingerprint`) — there is no offline "normal code path". The mock synthesizes a real-shaped one: `'1220' + sha256(rawPub)` hex (Canton's format, visible in party IDs).

**Deviation from spec, deliberate:** the spec says derive the fingerprint "through the normal code path". That path requires a devnet round-trip, so it is impossible offline. Task 2 synthesizes it instead. Same intent (real shape, wrong value).

---

## File Structure

**Create:**
- `app/custody/mock/store.ts` — in-memory ledger store. Forked from `web/src/ledger/mock.ts`. Owns contracts, per-party projection, update trees. Single responsibility: *be the ledger*.
- `app/custody/mock/store.test.ts`
- `app/custody/mock/fixtures.ts` — fixture types + loader + tenant construction from a captured registry.
- `app/custody/mock/fixtures.test.ts`
- `app/custody/mock/ledger-fetch.ts` — `makeMockFetch(store)`: emulates the 3 ledger endpoints. Single responsibility: *speak the ledger's HTTP wire shape*.
- `app/custody/mock/ledger-fetch.test.ts`
- `app/custody/fixtures/registry.json` — captured `/registry` (party IDs + custodian names + deal keys).
- `app/custody/fixtures/acs.json` — captured contracts, blobs dropped, deal keys normalized to epoch 1.
- `app/custody/fixtures/audit.json` — seed rows for `/audit`.
- `app/custody/fixtures/updates.json` — updateId → tree map.
- `app/custody/server.mock.ts` — composition root + outer wrapper. Mirrors `server.ts`'s shape.
- `app/custody/server.mock.test.ts`
- `app/scripts/capture-fixtures.ts` — one-shot capture from prod.
- `app/fly.preview.toml`
- `.github/workflows/ci.yml`
- `.github/scripts/seam-freeze.sh`

**Modify:**
- `app/.dockerignore` — must not exclude `custody/fixtures/`.
- `docs/HOSTING.md` — preview app, credentials, redeploy.

**Never modify:** anything under `app/web/src/`. The zero-frontend-diff property is the point of this design. `app/custody/app.ts` is also untouched.

---

### Task 1: Mock ledger store

**Files:**
- Create: `app/custody/mock/store.ts`
- Test: `app/custody/mock/store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/custody/mock/store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MockLedgerStore } from './store';

const GP = 'gp::1220aaaa';
const BUYER = 'buyer::1220bbbb';

const createDeal = {
  CreateCommand: {
    templateId: '#continuum:Continuum.Deal:ContinuationDeal',
    createArguments: { dealId: 'M1', owner: GP, room: [BUYER], stage: 'Open' },
  },
};

describe('MockLedgerStore', () => {
  it('materializes a create and projects it to actAs', () => {
    const s = new MockLedgerStore();
    const { updateId } = s.submit([GP], [createDeal]);
    expect(updateId).toMatch(/^1220/);
    const acs = s.activeContracts(GP);
    expect(acs).toHaveLength(1);
    expect(acs[0].args.dealId).toBe('M1');
  });

  it('projects a ContinuationDeal to room observers', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    expect(s.activeContracts(BUYER)).toHaveLength(1);
  });

  it('keeps SealedBid peer-blind', () => {
    const s = new MockLedgerStore();
    s.submit([BUYER], [{
      CreateCommand: {
        templateId: '#continuum:Continuum.Auction:SealedBid',
        createArguments: { bidder: BUYER, owner: GP, price: '0.96' },
      },
    }]);
    expect(s.activeContracts(BUYER)).toHaveLength(1);
    expect(s.activeContracts(GP)).toHaveLength(0);
  });

  it('filters by templateId suffix', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    expect(s.activeContracts(GP, { templateId: 'Continuum.Deal:ContinuationDeal' })).toHaveLength(1);
    expect(s.activeContracts(GP, { templateId: 'Nope:Nope' })).toHaveLength(0);
  });

  it('applies SetClearing and OpenElections', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    const cid = s.activeContracts(GP)[0].contractId;
    s.submit([GP], [{ ExerciseCommand: { templateId: '#continuum:Continuum.Deal:ContinuationDeal', contractId: cid, choice: 'SetClearing', choiceArgument: { p: '0.96' } } }]);
    expect(s.activeContracts(GP)[0].args.clearingPrice).toBe('0.96');
    s.submit([GP], [{ ExerciseCommand: { templateId: '#continuum:Continuum.Deal:ContinuationDeal', contractId: cid, choice: 'OpenElections', choiceArgument: {} } }]);
    expect(s.activeContracts(GP)[0].args.stage).toBe('Electing');
  });

  it('ignores unknown choices without throwing', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    const cid = s.activeContracts(GP)[0].contractId;
    expect(() => s.submit([GP], [{ ExerciseCommand: { templateId: 'x', contractId: cid, choice: 'Close', choiceArgument: {} } }])).not.toThrow();
  });

  it('records an update tree per submit, keyed by updateId', () => {
    const s = new MockLedgerStore();
    const { updateId } = s.submit([GP], [createDeal]);
    const tree = s.updateTree(updateId);
    expect(tree).toBeDefined();
    expect((tree as any).updateId).toBe(updateId);
    expect((tree as any).events).toHaveLength(1);
  });

  it('ledgerEnd offset grows with the store', () => {
    const s = new MockLedgerStore();
    expect(s.ledgerEnd().offset).toBe(0);
    s.submit([GP], [createDeal]);
    expect(s.ledgerEnd().offset).toBe(1);
  });

  it('seed() replaces contents and reset() restores the seed', () => {
    const s = new MockLedgerStore();
    s.seed([{ contractId: 'c1', templateId: '#continuum:Continuum.Deal:ContinuationDeal', args: { dealId: 'M1', owner: GP, room: [BUYER] } }]);
    expect(s.activeContracts(GP)).toHaveLength(1);
    s.submit([GP], [createDeal]);
    expect(s.activeContracts(GP)).toHaveLength(2);
    s.reset();
    expect(s.activeContracts(GP)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run custody/mock/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Write the implementation**

Create `app/custody/mock/store.ts`:

```ts
// app/custody/mock/store.ts
// In-memory ledger for the designer preview. FORKED from web/src/ledger/mock.ts
// (that copy stays put — it is dead code kept only for mock.test.ts /
// PrivacyProof.test.tsx and should be deleted after the hackathon).
//
// This backs BOTH reads and writes so the preview's UI actually reacts to actions:
// useLedger.pollForContract polls the ACS after every submit, so a signer that does
// not materialize creates makes every flow hang and look broken.
// NOTE: the `.js` suffix is REQUIRED — @noble/hashes v2's exports map only exposes
// './sha2.js' / './utils.js' (see ledger-client/src/ed25519.ts:6 for the same import).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { ActiveContract, JsCommand } from '../../ledger-client/src/types';

/** A contract plus the parties allowed to see it (mock's privacy projection). */
type Stored = ActiveContract & { stakeholders: string[] };

/** A fixture row: the store computes stakeholders itself. */
export type SeedContract = { contractId: string; templateId: string; args: Record<string, unknown> };

/** Canton-shaped id: '1220' + sha256 hex. Deterministic, so tests can assert on it. */
const cantonId = (s: string): string => `1220${bytesToHex(sha256(new TextEncoder().encode(s)))}`;

export class MockLedgerStore {
  private store: Stored[] = [];
  private seeded: Stored[] = [];
  private seq = 0;
  private trees = new Map<string, unknown>();

  ledgerEnd(): { offset: number } {
    return { offset: this.store.length };
  }

  submit(actAs: string[], commands: JsCommand[]): { updateId: string; completionOffset: number } {
    const updateId = cantonId(`update-${++this.seq}`);
    const events: unknown[] = [];
    for (const c of commands) {
      if ('CreateCommand' in c) {
        const a = c.CreateCommand.createArguments;
        const contractId = cantonId(`contract-${++this.seq}`);
        this.store.push({
          contractId,
          templateId: c.CreateCommand.templateId,
          args: a,
          stakeholders: [...new Set([...actAs, ...observersFor(c.CreateCommand.templateId, a)])],
        });
        events.push({ CreatedTreeEvent: { value: { contractId, templateId: c.CreateCommand.templateId, createArgument: a, signatories: actAs, observers: observersFor(c.CreateCommand.templateId, a) } } });
      } else {
        // Only the choices the UI actually issues. Any other choice is a deliberate
        // no-op — the real Daml gating lives on the real ledger, and simulating it
        // is explicitly out of scope (see spec "Accepted tradeoffs").
        const { contractId, choice, choiceArgument } = c.ExerciseCommand;
        const item = this.store.find((s) => s.contractId === contractId);
        if (item) {
          if (choice === 'SetClearing') item.args = { ...item.args, clearingPrice: choiceArgument.p };
          else if (choice === 'OpenElections') item.args = { ...item.args, stage: 'Electing' };
        }
        events.push({ ExercisedTreeEvent: { value: { contractId, choice, choiceArgument, actingParties: actAs } } });
      }
    }
    this.trees.set(updateId, {
      updateId,
      commandId: `mock-${this.seq}`,
      offset: this.store.length,
      recordTime: MOCK_RECORD_TIME,
      effectiveAt: MOCK_RECORD_TIME,
      synchronizerId: MOCK_SYNCHRONIZER_ID,
      events,
    });
    return { updateId, completionOffset: this.store.length };
  }

  activeContracts(party: string, opts: { templateId?: string } = {}): ActiveContract[] {
    return this.store
      .filter((c) => c.stakeholders.includes(party))
      .filter((c) => !opts.templateId || c.templateId.endsWith(opts.templateId))
      .map(({ stakeholders, ...c }) => c);
  }

  updateTree(updateId: string): unknown | undefined {
    return this.trees.get(updateId);
  }

  /** Replace the store with fixture rows and remember them as the reset baseline. */
  seed(rows: SeedContract[]): void {
    this.seeded = rows.map((r) => ({ ...r, stakeholders: stakeholdersFor(r.templateId, r.args) }));
    this.store = this.seeded.map((c) => ({ ...c }));
  }

  /** Register a canned update tree (fixture audit rows must be inspectable). */
  seedTree(updateId: string, tree: unknown): void {
    this.trees.set(updateId, tree);
  }

  /** Restore the pristine seeded state — backs the preview's Reset button. */
  reset(): void {
    this.store = this.seeded.map((c) => ({ ...c }));
  }
}

export const MOCK_SYNCHRONIZER_ID = 'global-domain::1220mock';
export const MOCK_RECORD_TIME = '2026-07-15T09:00:00Z';

/** Peer-blindness rules, forked from web/src/ledger/mock.ts:62. */
function observersFor(tpl: string, a: Record<string, unknown>): string[] {
  if (tpl.endsWith('SealedBid') || tpl.endsWith('LPElection')) return []; // peer-blind
  if (tpl.endsWith('ContinuationDeal')) {
    const room = (a.room as string[] | undefined) ?? [];
    const owner = a.owner ? [a.owner as string] : [];
    return [...room, ...owner];
  }
  return a.owner ? [a.owner as string] : [];
}

/**
 * Stakeholders for a SEEDED contract. Unlike a live submit there is no actAs, so the
 * signatory must be inferred from the args. Every Continuum template carries the
 * submitting party in one of these fields.
 */
function stakeholdersFor(tpl: string, a: Record<string, unknown>): string[] {
  const signatory = (a.bidder ?? a.holder ?? a.agent ?? a.lp ?? a.owner ?? a.admin) as string | undefined;
  const base = signatory ? [signatory] : [];
  return [...new Set([...base, ...observersFor(tpl, a)])];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run custody/mock/store.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add app/custody/mock/store.ts app/custody/mock/store.test.ts
git commit -m "feat(mock): in-memory ledger store for the designer preview"
```

---

### Task 2: Fixture types, tenant adoption, fingerprint synthesis

**Files:**
- Create: `app/custody/mock/fixtures.ts`
- Test: `app/custody/mock/fixtures.test.ts`

**Why adoption:** `tenantsFromRecords` copies `party` verbatim and derives `key` from `mnemonic` separately — they are independent and nothing validates they correspond, and the mock signer never verifies a signature. So the mock adopts prod's real party IDs and the fixtures match **by construction**. No rewrite, no mapping, no unmapped-party failure mode.

- [ ] **Step 1: Write the failing test**

Create `app/custody/mock/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tenantRecordsFromRegistry, mockFingerprint, DEMO_PASSWORD } from './fixtures';

const REGISTRY = {
  parties: { gp: 'continuum-gp-123::1220aaaa', buyer: 'continuum-buyer-123::1220bbbb' },
  custodians: { gp: 'Fireblocks — GP Treasury', buyer: 'Copper — Northbeam Secondaries' },
  deal: { epoch: 1, dealId: 'M1', cv: 'Meridian CV I', unit: 'MERIDIAN-CV-I', usdc: 'USDC' },
};

describe('tenantRecordsFromRegistry', () => {
  it('adopts the captured party ids verbatim', () => {
    const recs = tenantRecordsFromRegistry(REGISTRY);
    expect(recs.find((r) => r.role === 'gp')!.party).toBe('continuum-gp-123::1220aaaa');
  });

  it('carries the captured custodian names', () => {
    const recs = tenantRecordsFromRegistry(REGISTRY);
    expect(recs.find((r) => r.role === 'gp')!.custodianName).toBe('Fireblocks — GP Treasury');
  });

  it('uses the documented demo credentials', () => {
    const recs = tenantRecordsFromRegistry(REGISTRY);
    const gp = recs.find((r) => r.role === 'gp')!;
    expect(gp.username).toBe('gp');
    expect(gp.password).toBe(DEMO_PASSWORD('gp'));
  });

  it('gives every tenant a distinct mnemonic', () => {
    const recs = tenantRecordsFromRegistry(REGISTRY);
    expect(new Set(recs.map((r) => r.mnemonic)).size).toBe(recs.length);
  });

  it('synthesizes a Canton-shaped fingerprint (1220 + 64 hex)', () => {
    const recs = tenantRecordsFromRegistry(REGISTRY);
    for (const r of recs) expect(r.fingerprint).toMatch(/^1220[0-9a-f]{64}$/);
  });

  it('fingerprint is deterministic and key-derived', () => {
    expect(mockFingerprint(new Uint8Array([1, 2, 3]))).toBe(mockFingerprint(new Uint8Array([1, 2, 3])));
    expect(mockFingerprint(new Uint8Array([1, 2, 3]))).not.toBe(mockFingerprint(new Uint8Array([4, 5, 6])));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run custody/mock/fixtures.test.ts`
Expected: FAIL — `Cannot find module './fixtures'`.

- [ ] **Step 3: Write the implementation**

Create `app/custody/mock/fixtures.ts`:

```ts
// app/custody/mock/fixtures.ts
// Fixture shapes + the tenant-ADOPTION rule for the preview.
//
// Mock tenants adopt prod's REAL party ids with throwaway mnemonics. This is sound
// because tenants.ts:38 copies `party` verbatim and derives `key` from `mnemonic`
// SEPARATELY — the two are independent, nothing validates they correspond, and the
// mock signer never verifies a signature. Fixtures therefore match by construction.
// The `.js` suffix is REQUIRED — see the note in mock/store.ts.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { keyFromMnemonic } from '../../ledger-client/src/ed25519';
import type { TenantRecord } from '../tenants';
import type { AuditEntry } from '../app';
import type { SeedContract } from './store';

/** Captured `GET /registry` from prod. Party ids + custodian names are public. */
export type RegistryFixture = {
  parties: Record<string, string>;
  custodians: Record<string, string>;
  deal: { epoch: number; dealId: string; cv: string; unit: string; usdc: string };
};

export type AcsFixture = SeedContract[];
export type AuditFixture = AuditEntry[];
export type UpdatesFixture = Record<string, unknown>;

/** Documented preview credentials — the designer cannot guess these. */
export const DEMO_PASSWORD = (role: string): string => `${role}-demo`;

/**
 * Canton computes fingerprints server-side (wallet.ts:115 reads
 * topo.publicKeyFingerprint), so there is no offline "real" path. Synthesize one in
 * Canton's shape — '1220' + sha256 hex — so it is real-SHAPED but wrong-valued. The
 * audit trail displays it; a designer will size a column to it.
 */
export const mockFingerprint = (rawPub: Uint8Array): string => `1220${bytesToHex(sha256(rawPub))}`;

/**
 * BIP-39 test vectors — VALID mnemonics, PUBLIC, and worthless. One per role so each
 * tenant gets a distinct key. These never control a real party: the party id comes
 * from the captured registry, not from the key.
 */
const MNEMONICS: string[] = [
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  'legal winner thank year wave sausage worth useful legal winner thank yellow',
  'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
  'all hour make first leader extend hole alien behind guard gospel lava',
  'vessel ladder alter error federal sibling chat ability sun glass valve picture',
];

/** Build the mock tenant records from a captured registry. */
export function tenantRecordsFromRegistry(reg: RegistryFixture): TenantRecord[] {
  return Object.entries(reg.parties).map(([role, party], i) => {
    const mnemonic = MNEMONICS[i % MNEMONICS.length]!;
    return {
      tenant: role,
      custodianName: reg.custodians[role] ?? role,
      role,
      party,
      mnemonic,
      fingerprint: mockFingerprint(keyFromMnemonic(mnemonic).rawPub),
      username: role,
      password: DEMO_PASSWORD(role),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run custody/mock/fixtures.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add app/custody/mock/fixtures.ts app/custody/mock/fixtures.test.ts
git commit -m "feat(mock): fixture types + tenant adoption of captured party ids"
```

---

### Task 3: Fake ledger fetch (the 3 endpoints)

**Files:**
- Create: `app/custody/mock/ledger-fetch.ts`
- Test: `app/custody/mock/ledger-fetch.test.ts`

**Why:** `deps.fetchImpl` is the single point where both `/api/*` and `/ledger/update/:id` reach the ledger. Intercept it and the whole backend runs offline with `app.ts` untouched.

`MOCK_LEDGER_BASE` uses the reserved `.invalid` TLD (RFC 2606): if the fake fetch ever fails to intercept, the request cannot resolve to a real host — it fails loudly instead of leaking.

- [ ] **Step 1: Write the failing test**

Create `app/custody/mock/ledger-fetch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MockLedgerStore } from './store';
import { makeMockFetch, MOCK_LEDGER_BASE } from './ledger-fetch';

const GP = 'gp::1220aaaa';
const BUYER = 'buyer::1220bbbb';
const createDeal = {
  CreateCommand: {
    templateId: '#continuum:Continuum.Deal:ContinuationDeal',
    createArguments: { dealId: 'M1', owner: GP, room: [BUYER], stage: 'Open' },
  },
};

const acsBody = (party: string) => JSON.stringify({
  activeAtOffset: 1,
  filter: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] } } },
  verbose: false,
});

describe('makeMockFetch', () => {
  it('serves ledger-end', async () => {
    const store = new MockLedgerStore();
    store.submit([GP], [createDeal]);
    const f = makeMockFetch(store);
    const r = await f(`${MOCK_LEDGER_BASE}/v2/state/ledger-end`);
    expect(await r.json()).toEqual({ offset: 1 });
  });

  it('serves active-contracts in the real wire shape', async () => {
    const store = new MockLedgerStore();
    store.submit([GP], [createDeal]);
    const f = makeMockFetch(store);
    const r = await f(`${MOCK_LEDGER_BASE}/v2/state/active-contracts`, { method: 'POST', body: acsBody(GP) });
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    const ce = body[0].contractEntry.JsActiveContract.createdEvent;
    expect(ce.createArgument.dealId).toBe('M1');
    expect(ce.createdEventBlob).toBeUndefined();
  });

  it('honours the party filter (privacy projection)', async () => {
    const store = new MockLedgerStore();
    store.submit([BUYER], [{ CreateCommand: { templateId: '#continuum:Continuum.Auction:SealedBid', createArguments: { bidder: BUYER, price: '0.96' } } }]);
    const f = makeMockFetch(store);
    const asGp = await (await f(`${MOCK_LEDGER_BASE}/v2/state/active-contracts`, { method: 'POST', body: acsBody(GP) })).json();
    expect(asGp).toHaveLength(0);
    const asBuyer = await (await f(`${MOCK_LEDGER_BASE}/v2/state/active-contracts`, { method: 'POST', body: acsBody(BUYER) })).json();
    expect(asBuyer).toHaveLength(1);
  });

  it('serves update-by-id from the tree map', async () => {
    const store = new MockLedgerStore();
    const { updateId } = store.submit([GP], [createDeal]);
    const f = makeMockFetch(store);
    const r = await f(`${MOCK_LEDGER_BASE}/v2/updates/update-by-id`, { method: 'POST', body: JSON.stringify({ updateId, updateFormat: {} }) });
    expect((await r.json()).updateId).toBe(updateId);
  });

  it('404s an unknown updateId', async () => {
    const f = makeMockFetch(new MockLedgerStore());
    const r = await f(`${MOCK_LEDGER_BASE}/v2/updates/update-by-id`, { method: 'POST', body: JSON.stringify({ updateId: 'nope', updateFormat: {} }) });
    expect(r.status).toBe(404);
  });

  it('throws on an unhandled ledger path rather than leaking', async () => {
    const f = makeMockFetch(new MockLedgerStore());
    await expect(f(`${MOCK_LEDGER_BASE}/v2/commands/submit-and-wait`, { method: 'POST', body: '{}' })).rejects.toThrow(/unhandled/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run custody/mock/ledger-fetch.test.ts`
Expected: FAIL — `Cannot find module './ledger-fetch'`.

- [ ] **Step 3: Write the implementation**

Create `app/custody/mock/ledger-fetch.ts`:

```ts
// app/custody/mock/ledger-fetch.ts
// A `fetch` that speaks the Canton JSON Ledger API v2 wire shape against MockLedgerStore.
// This is the SINGLE interception point for the whole backend: deps.fetchImpl is used by
// both the /api/* reads proxy (app.ts:271) and /ledger/update/:updateId (app.ts:406).
//
// The `.invalid` TLD is reserved (RFC 2606) and cannot resolve — so a request that
// slips past this interceptor fails loudly instead of reaching a real host.
import { MOCK_SYNCHRONIZER_ID, type MockLedgerStore } from './store';

export const MOCK_LEDGER_BASE = 'https://mock-ledger.invalid';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Read the party the /api proxy forced into the ACS filter (app.ts:133 forceParty). */
function partyFromFilter(body: any): string | undefined {
  return Object.keys(body?.filter?.filtersByParty ?? {})[0];
}

export function makeMockFetch(store: MockLedgerStore): typeof fetch {
  return (async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = url.replace(MOCK_LEDGER_BASE, '').split('?')[0];
    const body = init.body ? JSON.parse(init.body as string) : undefined;

    if (path === '/v2/state/ledger-end') return json(store.ledgerEnd());

    if (path === '/v2/state/active-contracts') {
      const party = partyFromFilter(body);
      if (!party) return json([]);
      // HttpLedgerClient.activeContracts (client.ts:23) unwraps exactly this shape.
      // createdEventBlob is deliberately absent: nothing in web/src calls
      // fetchDisclosed, and the blob is signed devnet bytes we cannot synthesize.
      return json(
        store.activeContracts(party).map((c) => ({
          contractEntry: {
            JsActiveContract: {
              createdEvent: { contractId: c.contractId, templateId: c.templateId, createArgument: c.args },
              synchronizerId: MOCK_SYNCHRONIZER_ID,
            },
          },
        })),
      );
    }

    if (path === '/v2/updates/update-by-id') {
      const tree = store.updateTree(body?.updateId);
      return tree ? json(tree) : json({ error: 'update not found' }, 404);
    }

    throw new Error(`mock ledger: unhandled path ${path}`);
  }) as unknown as typeof fetch;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run custody/mock/ledger-fetch.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add app/custody/mock/ledger-fetch.ts app/custody/mock/ledger-fetch.test.ts
git commit -m "feat(mock): fake ledger fetch emulating the 3 JSON API endpoints"
```

---

### Task 4: Capture script + committed fixtures

**Files:**
- Create: `app/scripts/capture-fixtures.ts`
- Create (generated, committed): `app/custody/fixtures/{registry,acs,audit,updates}.json`
- Modify: `app/.dockerignore`

**Why normalization:** fixtures carry whatever `demoEpoch` prod was in when captured, but the mock always starts at epoch 1. If prod had been Reset, fixtures say `dealId: "M3"` while `/registry` says `M1` → the SPA filters on `M1` → **every view renders empty**. Normalizing at capture makes this epoch-independent instead of silently timing-dependent.

- [ ] **Step 1: Write the capture script**

Create `app/scripts/capture-fixtures.ts`:

```ts
// app/scripts/capture-fixtures.ts
// One-shot capture of prod's public demo state into the preview's fixtures.
//
// Run: cd app && CAPTURE_BASE=https://continuum-custody.fly.dev npx tsx scripts/capture-fixtures.ts
//
// SAFETY: writes ONLY public data — party ids, synthetic Meridian CV I demo contracts,
// and audit rows (which carry key FINGERPRINTS, never key material). Fixtures are
// committed and public forever: read the diff before committing.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../custody/fixtures');
const BASE = process.env.CAPTURE_BASE ?? 'https://continuum-custody.fly.dev';
const ROLES = ['gp', 'buyer', 'lpExiting', 'lpRolling', 'lpac', 'valuer'];

/** Epoch-1 keys — must match dealKeys(1) in custody/app.ts:311. */
const EPOCH1 = { dealId: 'M1', cv: 'Meridian CV I', unit: 'MERIDIAN-CV-I', usdc: 'USDC' };

async function login(role: string): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: role, password: `${role}-demo` }),
  });
  if (!r.ok) throw new Error(`login ${role} → ${r.status}`);
  return (r.headers.get('set-cookie') ?? '').split(';')[0]!;
}

/** Recursively replace this epoch's deal-key STRINGS with the epoch-1 constants. */
function normalize(value: unknown, subs: Array<[string, string]>): unknown {
  if (typeof value === 'string') {
    const hit = subs.find(([from]) => from === value);
    return hit ? hit[1] : value;
  }
  if (Array.isArray(value)) return value.map((v) => normalize(v, subs));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, subs)]));
  }
  return value;
}

async function main() {
  const registry = await (await fetch(`${BASE}/registry`)).json();
  const subs: Array<[string, string]> = [
    [registry.deal.dealId, EPOCH1.dealId],
    [registry.deal.cv, EPOCH1.cv],
    [registry.deal.unit, EPOCH1.unit],
    [registry.deal.usdc, EPOCH1.usdc],
  ].filter(([from, to]) => from !== to) as Array<[string, string]>;
  console.log(`captured epoch ${registry.deal.epoch}; normalizing ${subs.length} key(s) → epoch 1`);

  const acs: unknown[] = [];
  const audit: unknown[] = [];
  const updates: Record<string, unknown> = {};
  const seenCids = new Set<string>();

  for (const role of ROLES) {
    const cookie = await login(role);
    const h = { Cookie: cookie, 'Content-Type': 'application/json' };

    const { offset } = await (await fetch(`${BASE}/api/v2/state/ledger-end`, { headers: h })).json();
    const raw = await (await fetch(`${BASE}/api/v2/state/active-contracts`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ activeAtOffset: offset, filter: {}, verbose: false }),
    })).json();

    for (const e of Array.isArray(raw) ? raw : [raw]) {
      const ce = e?.contractEntry?.JsActiveContract?.createdEvent;
      if (!ce?.contractId || seenCids.has(ce.contractId)) continue;
      seenCids.add(ce.contractId);
      // Drop createdEventBlob: signed devnet bytes we cannot rewrite, and nothing in
      // web/src consumes it (only scripts/close-minimal.ts, which never runs here).
      acs.push({
        contractId: ce.contractId,
        templateId: ce.templateId,
        args: normalize(ce.createArgument ?? {}, subs),
      });
    }

    const rows = await (await fetch(`${BASE}/audit`, { headers: h })).json();
    for (const row of rows as any[]) {
      audit.push(row);
      if (!row.updateId || updates[row.updateId]) continue;
      const t = await fetch(`${BASE}/ledger/update/${encodeURIComponent(row.updateId)}`, { headers: h });
      if (t.ok) updates[row.updateId] = normalize(await t.json(), subs);
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/registry.json`, JSON.stringify({ ...registry, deal: { epoch: 1, ...EPOCH1 } }, null, 2));
  writeFileSync(`${OUT}/acs.json`, JSON.stringify(acs, null, 2));
  writeFileSync(`${OUT}/audit.json`, JSON.stringify(audit, null, 2));
  writeFileSync(`${OUT}/updates.json`, JSON.stringify(updates, null, 2));
  console.log(`wrote ${acs.length} contracts, ${audit.length} audit rows, ${Object.keys(updates).length} update trees → ${OUT}`);
}

main();
```

- [ ] **Step 2: Run the capture against prod**

Run: `cd app && npx tsx scripts/capture-fixtures.ts`
Expected: prints the captured epoch and e.g. `wrote 14 contracts, 9 audit rows, 6 update trees`.

If it prints `wrote 0 contracts`, prod's demo state is empty — click through a deal at
https://continuum-custody.fly.dev first, then re-run.

- [ ] **Step 3: Verify no key material leaked, and that normalization worked**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
grep -ril "mnemonic\|FN_SECRET\|private" app/custody/fixtures/ || echo "CLEAN"
grep -o '"dealId": *"[^"]*"' app/custody/fixtures/acs.json | sort -u
```

Expected: `CLEAN`, and every `dealId` is `"M1"` (never `M2`/`M3`). If a non-M1 dealId
survives, the `subs` list missed a key — fix before continuing.

Then read `app/custody/fixtures/registry.json` in full. It is about to be public forever.

- [ ] **Step 4: Ensure fixtures ship in the image**

Read `app/.dockerignore`. If any pattern excludes `custody/fixtures/` (e.g. `*.json`,
`fixtures`), add a negation so the fixtures are included:

```
!custody/fixtures/
```

Verify:

```bash
cd app && docker build -t continuum-fixcheck . >/dev/null \
  && docker run --rm --entrypoint ls continuum-fixcheck custody/fixtures
```

Expected: lists `acs.json  audit.json  registry.json  updates.json`.

- [ ] **Step 5: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add app/scripts/capture-fixtures.ts app/custody/fixtures app/.dockerignore
git commit -m "feat(mock): capture prod fixtures (blobs dropped, deal keys normalized to epoch 1)"
```

---

### Task 5: `server.mock.ts` — composition root, boot fence, outer wrapper

**Files:**
- Create: `app/custody/server.mock.ts`
- Test: `app/custody/server.mock.test.ts`

**Structure it like `server.ts`:** exported pure `assertMockEnv(env)` + `createMockApp(deps)`, with `main()` at the bottom. A top-level `if (process.env.FN_SECRET) throw` cannot be imported by a test without crashing the runner.

**The outer wrapper carries the two things `AppDeps` cannot inject** — see the Background section.

- [ ] **Step 1: Write the failing test**

Create `app/custody/server.mock.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  it('serves /registry with the fixture parties at epoch 1', async () => {
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

    // /action takes `{commands}` ONLY — app.ts:207 reads body.commands and derives the
    // audit label itself via summarize(commands). Mirrors useLedger.ts:199.
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
    // The epoch must NEVER bump — the inner app's demoEpoch is closure-local and
    // would rotate dealId to M2, orphaning every fixture.
    expect((await (await app.request('/registry')).json()).deal.dealId).toBe('M1');
  });

  it('injects the PREVIEW banner into index.html', async () => {
    const { app: withSpa } = createMockApp({ indexHtml: '<html><body><div id="root"></div></body></html>' });
    const res = await withSpa.request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('PREVIEW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run custody/server.mock.test.ts`
Expected: FAIL — `Cannot find module './server.mock'`.

- [ ] **Step 3: Write the implementation**

Create `app/custody/server.mock.ts`:

```ts
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
import { createApp, type AuditEntry, type Signer, type Reader } from './app';
import { MockLedgerStore } from './mock/store';
import { makeMockFetch, MOCK_LEDGER_BASE } from './mock/ledger-fetch';
import { tenantRecordsFromRegistry, type RegistryFixture, type AcsFixture, type AuditFixture, type UpdatesFixture } from './mock/fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const FIXTURES = resolve(__dirname, 'fixtures');
const PORT = Number(process.env.PORT ?? 8787);

const BANNER = `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#7c2d12;color:#fff;font:600 12px/1.6 system-ui,sans-serif;text-align:center;letter-spacing:.04em">PREVIEW — simulated ledger. Not on-chain.</div>`;

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
  const registry = readFixture<RegistryFixture>('registry.json');
  const acs = readFixture<AcsFixture>('acs.json');
  const audit = readFixture<AuditFixture>('audit.json');
  const updates = readFixture<UpdatesFixture>('updates.json');

  const store = new MockLedgerStore();
  const seedStore = () => {
    store.seed(acs);
    for (const [updateId, tree] of Object.entries(updates)) store.seedTree(updateId, tree);
  };
  seedStore();

  // Tenants ADOPT the captured party ids (see mock/fixtures.ts for why that is sound).
  const tenants = tenantsFromRecords(tenantRecordsFromRegistry(registry));

  // The signer ignores key/fingerprint — nothing verifies a signature here. It MUST
  // materialize creates: useLedger.pollForContract polls the ACS after every submit.
  const signer: Signer = {
    async submitSigned(party, _key, _fingerprint, commands) {
      return { updateId: store.submit([party], commands).updateId };
    },
  };
  const reads: Reader = {
    async activeContracts(party, o) {
      return store.activeContracts(party, o).map((c) => ({ contractId: c.contractId, args: c.args }));
    },
  };

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
    return c.json({ deal: registry.deal });
  });

  const indexWithBanner = (): string | null => {
    if (opts.indexHtml !== undefined) return opts.indexHtml.replace(/<body([^>]*)>/i, `<body$1>${BANNER}`);
    const index = resolve(staticRoot, 'index.html');
    if (!existsSync(index)) return null;
    return readFileSync(index, 'utf8').replace(/<body([^>]*)>/i, `<body$1>${BANNER}`);
  };
  const serveIndex = (c: any) => {
    const html = indexWithBanner();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run custody/server.mock.test.ts`
Expected: PASS, 11 tests.

If `seeds the ACS` fails with 0 contracts, `stakeholdersFor` in `store.ts` did not infer a
signatory for the fixture templates. Print `app/custody/fixtures/acs.json`'s arg keys and add
the missing field to the `signatory` chain — do **not** widen it to "visible to everyone".

- [ ] **Step 5: Run the whole suite — nothing regressed**

Run: `cd app && npx vitest run`
Expected: PASS. Previously 22 custody tests; now 22 + 9 + 6 + 6 + 11 = 54.

- [ ] **Step 6: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add app/custody/server.mock.ts app/custody/server.mock.test.ts
git commit -m "feat(mock): server.mock.ts — keyless preview entrypoint + outer wrapper

Outer Hono app owns /demo/reset (demoEpoch is closure-local at app.ts:309,
so an un-intercepted reset would rotate dealId to M2 and orphan every
fixture) and index.html (app.ts:543 has no hook) for the PREVIEW banner.
Inner app is the unmodified createApp()."
```

---

### Task 6: Verify the preview end-to-end locally

**Files:** none — this is a manual gate before wiring CI.

- [ ] **Step 1: Build the SPA**

Run: `cd app/web && npm ci && npm run build`
Expected: `web/dist/index.html` exists.

- [ ] **Step 2: Boot the mock and click through**

```bash
cd app && npx tsx custody/server.mock.ts
```

Open http://localhost:8787. Verify, and do not proceed until all hold:
- the **PREVIEW — simulated ledger** banner is visible;
- login `gp` / `gp-demo` works;
- the GP deal page shows **NAV $500M · Kroll ✓** and a non-empty stepper (fixtures loaded);
- the **Audit** trail has rows;
- clicking an audit row opens the **Ledger Inspector** with a real tree (not an error);
- **Reset demo** on the landing page restores state and the deal is still **M1**;
- log in as `buyer` / `buyer-demo` in a separate tab — buyer sees its own view, not GP's.

- [ ] **Step 3: Verify the boot fence actually refuses**

```bash
cd app && FN_SECRET=xyz npx tsx custody/server.mock.ts
```

Expected: exits with `FN_SECRET is set — refusing to boot the MOCK server with real key material present.`

- [ ] **Step 4: Verify no devnet traffic**

With the mock running, confirm the process makes no outbound ledger calls: the fake fetch
throws on any unhandled path and `MOCK_LEDGER_BASE` uses the unresolvable `.invalid` TLD.
Any real network attempt surfaces as a loud error in the terminal, not a silent success.
Click through a full role view and confirm the terminal shows **no** `mock ledger: unhandled path` errors.

If one appears, the SPA hit a ledger endpoint the mock does not emulate — add it to
`makeMockFetch` rather than falling back to real fetch.

---

### Task 7: `fly.preview.toml` + first preview deploy

**Files:**
- Create: `app/fly.preview.toml`

- [ ] **Step 1: Write the config**

Create `app/fly.preview.toml`:

```toml
# Designer preview — runs custody/server.mock.ts (simulated ledger).
# NEVER set FN_SECRET or CUSTODY_KEYS_JSON on this app: server.mock.ts refuses to boot
# with key material present, by design.
app = "continuum-custody-preview"
primary_region = "lhr"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8787"

[processes]
  app = "npx tsx custody/server.mock.ts"

[http_service]
  internal_port = 8787
  force_https = true
  # suspend, not stop: the store is in-memory, so a stopped machine loses the
  # designer's in-session clicks and looks like a bug. Fixtures reseed on boot anyway.
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  grace_period = "20s"
  method = "GET"
  path = "/registry"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
  processes = ["app"]
```

- [ ] **Step 2: Create the app and deploy**

```bash
cd app
fly apps create continuum-custody-preview
fly deploy --config fly.preview.toml --app continuum-custody-preview
```

Expected: deploy succeeds and the `/registry` health check passes.

**If it fails with a process-group error** (`http_service` not bound / no machines match):
that is the known first-deploy time sink. `[http_service].processes` and `[[vm]].processes`
must both name the `app` group exactly as defined in `[processes]`.

- [ ] **Step 3: Confirm the deployed preview carries no secrets**

```bash
fly secrets list --app continuum-custody-preview
```

Expected: empty. If anything is listed, `fly secrets unset` it — the boot fence will refuse
to start with `FN_SECRET`/`CUSTODY_KEYS_JSON` set, and that refusal is correct behaviour.

- [ ] **Step 4: Smoke the live preview**

```bash
curl -s https://continuum-custody-preview.fly.dev/registry | head -c 200
curl -s https://continuum-custody-preview.fly.dev/ | grep -o PREVIEW
```

Expected: JSON with `"deal":{"epoch":1,"dealId":"M1"...`, and `PREVIEW`.

- [ ] **Step 5: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add app/fly.preview.toml
git commit -m "feat(deploy): fly.preview.toml — secretless designer preview app"
```

---

### Task 8: Seam-freeze gate

**Files:**
- Create: `.github/scripts/seam-freeze.sh`

**Two tiers, deliberately.** `web/src/lib` is logic (`useLedger.ts`, `ops.ts`, `docs.ts`) so a
restyle has no business there — but `useLedger.ts` also exports `shortParty`, `DEMO`, `T`, `R`,
which a redesign might legitimately touch. A hard fail there would fire, get overridden, and
become noise. The soft tier's `seam-change` label is not an escape hatch: it is a signal to
actually read that hunk.

- [ ] **Step 1: Write the script**

Create `.github/scripts/seam-freeze.sh`:

```bash
#!/usr/bin/env bash
# Two-tier seam freeze for ui-ux PRs.
#   HARD: backend/ledger paths. A UI redesign touching these is always wrong. No override.
#   SOFT: frontend seam paths. Overridable with the `seam-change` PR label — which exists
#         to make the owner READ the hunk, not to wave it through.
# Usage: seam-freeze.sh <base-sha> <head-sha> <labels-json>
set -euo pipefail

BASE="$1"; HEAD="$2"; LABELS="${3:-[]}"

CHANGED="$(git diff --name-only "$BASE" "$HEAD")"
[ -z "$CHANGED" ] && { echo "no changes"; exit 0; }

hard="$(echo "$CHANGED" | grep -E '^app/(custody|ledger-client)/' || true)"
soft="$(echo "$CHANGED" | grep -E '^app/web/src/(lib|ledger)/' || true)"

fail=0
if [ -n "$hard" ]; then
  echo "::error::FROZEN SEAM (hard, no override) — a UI redesign must not touch the backend:"
  echo "$hard" | sed 's/^/  /'
  fail=1
fi

if [ -n "$soft" ]; then
  if echo "$LABELS" | grep -q '"seam-change"'; then
    echo "::warning::Frontend seam touched; allowed by the 'seam-change' label. REVIEW THESE HUNKS:"
    echo "$soft" | sed 's/^/  /'
  else
    echo "::error::FROZEN SEAM (soft) — add the 'seam-change' label if this is intentional:"
    echo "$soft" | sed 's/^/  /'
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && echo "seam freeze: OK"
exit "$fail"
```

- [ ] **Step 2: Make it executable and test it locally**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
chmod +x .github/scripts/seam-freeze.sh
# A commit touching only docs must pass:
.github/scripts/seam-freeze.sh HEAD~1 HEAD '[]'
```

Expected: `seam freeze: OK`, exit 0.

- [ ] **Step 3: Verify the hard tier actually fails**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git stash list >/dev/null
# Task 5 added files under app/custody/, so that commit must trip the hard tier:
.github/scripts/seam-freeze.sh "$(git log --format=%H -n1 --skip=1 -- app/custody/server.mock.ts)~1" \
  "$(git log --format=%H -n1 -- app/custody/server.mock.ts)" '[]' || echo "correctly failed"
```

Expected: prints the frozen `app/custody/...` paths and `correctly failed`.

- [ ] **Step 4: Commit**

```bash
git add .github/scripts/seam-freeze.sh
git commit -m "ci: two-tier seam-freeze gate for ui-ux PRs"
```

---

### Task 9: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Mint deploy-scoped tokens and add them as repo secrets**

These are a **credibility control**, not CI hygiene: a token scoped to the preview app
literally cannot deploy the mock to prod.

```bash
fly tokens create deploy -a continuum-custody          # → FLY_API_TOKEN_PROD
fly tokens create deploy -a continuum-custody-preview  # → FLY_API_TOKEN_PREVIEW
gh secret set FLY_API_TOKEN_PROD --repo kmadorin/continuum-prototype
gh secret set FLY_API_TOKEN_PREVIEW --repo kmadorin/continuum-prototype
```

Verify: `gh secret list --repo kmadorin/continuum-prototype` lists both.

Do **not** use a personal org-wide token — that would delete the guarantee.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main, ui-ux]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: custody tests
        working-directory: app
        run: |
          npm ci
          npx vitest run
      - name: web lint, typecheck (tsc -b via build), tests
        working-directory: app/web
        run: |
          npm ci
          npm run lint
          npm run build
          npx vitest run

  seam-freeze:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: check frozen seams
        run: |
          chmod +x .github/scripts/seam-freeze.sh
          .github/scripts/seam-freeze.sh \
            "${{ github.event.pull_request.base.sha }}" \
            "${{ github.event.pull_request.head.sha }}" \
            '${{ toJson(github.event.pull_request.labels.*.name) }}'

  deploy-prod:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-continuum-custody
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: deploy prod
        working-directory: app
        run: flyctl deploy --config fly.toml --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}

  deploy-preview:
    needs: test
    if: github.ref == 'refs/heads/ui-ux' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-continuum-custody-preview
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: deploy preview
        working-directory: app
        run: flyctl deploy --config fly.preview.toml --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PREVIEW }}
```

- [ ] **Step 3: Commit and push to a branch, confirm `test` goes green**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add .github/workflows/ci.yml
git commit -m "ci: test + seam-freeze gates, deploy main->prod and ui-ux->preview"
git push -u origin integration
gh run watch
```

Expected: `test` passes. `deploy-*` are skipped (branch is `integration`).

- [ ] **Step 4: Create the `ui-ux` branch and confirm the preview deploys**

```bash
git checkout -b ui-ux && git push -u origin ui-ux
gh run watch
```

Expected: `test` → `deploy-preview` runs; https://continuum-custody-preview.fly.dev/ serves
the banner. `deploy-prod` is skipped.

- [ ] **Step 5: Enable branch protection on `main`**

```bash
gh api -X PUT repos/kmadorin/continuum-prototype/branches/main/protection \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=test' \
  -f 'enforce_admins=false' \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -f 'restrictions=null'
```

Verify: `gh api repos/kmadorin/continuum-prototype/branches/main/protection --jq '.required_status_checks.contexts'`
Expected: `["test"]`.

- [ ] **Step 6: Verify prod auto-deploy — the whole point of Task 9**

```bash
git checkout integration
git push origin integration:main
gh run watch
```

Expected: `test` → `deploy-prod` → https://continuum-custody.fly.dev/ still serves
`/registry` and has **no** PREVIEW banner.

---

### Task 10: Staging keys for the pre-merge devnet smoke

**Files:** none tracked — `custody-keys.staging.json` is gitignored.

**Why:** this is the human gate that actually protects the pitch. CI does not replace it.

- [ ] **Step 1: Confirm the staging keys file will be gitignored**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git check-ignore -v app/custody-keys.staging.json
```

Expected: a match on the `custody-keys*.json` rule. **If it prints nothing, STOP** and add
`app/custody-keys*.json` to `.gitignore` before the next step — `provision.ts` writes real
mnemonics.

- [ ] **Step 2: Mint a separate party set**

```bash
cd app && npx tsx --env-file=.env custody/provision.ts
mv custody-keys.json custody-keys.staging.json
```

`provision.ts` namespaces every run (`RUN = Date.now().toString().slice(-6)`), so these are
six brand-new devnet parties with **zero** overlap with prod.

- [ ] **Step 3: Document the smoke procedure in HOSTING.md**

Covered by Task 11.

---

### Task 11: Documentation

**Files:**
- Modify: `docs/HOSTING.md`

- [ ] **Step 1: Append the preview + CI section**

Add to `docs/HOSTING.md`:

```markdown
## CI/CD

- Push to `main` → GitHub Actions deploys **https://continuum-custody.fly.dev** (prod).
- Push to `ui-ux` → deploys **https://continuum-custody-preview.fly.dev** (designer preview).
- Both gated on the `test` job (22+ custody tests, web lint + `tsc -b` + 66 web tests).
- Deploy tokens are **app-scoped** (`fly tokens create deploy -a <app>`), stored as
  `FLY_API_TOKEN_PROD` / `FLY_API_TOKEN_PREVIEW`. The preview token cannot deploy to prod —
  this is what makes "the mock can never be served as the live demo" a guarantee rather than
  a promise. Never replace them with a personal org-wide token.
- Design: `docs/superpowers/specs/2026-07-15-continuum-cicd-preview-design.md`.

## The designer preview (continuum-custody-preview)

Runs `custody/server.mock.ts`: the **same** `createApp()` as prod, wired to an in-memory
mock ledger seeded from `app/custody/fixtures/`. **No secrets, no devnet, no key material.**
The SPA is byte-for-byte identical to prod's — there is no mock-conditional frontend code,
which is what keeps a `ui-ux` → `main` merge diff pure UI.

Logins are the same as prod (`gp`/`gp-demo`, `buyer`/`buyer-demo`, `lpExiting`, `lpRolling`,
`lpac`, `valuer` — password is always `<role>-demo`).

- **Reset demo** in the preview restores pristine fixture state (it does *not* bump the demo
  epoch — the preview is pinned to `M1` so fixtures always match).
- Never run `fly secrets set` on the preview app. `server.mock.ts` refuses to boot when
  `FN_SECRET` or `CUSTODY_KEYS_JSON` is present, by design.
- Re-capture fixtures after a demo-data change:
  `cd app && npx tsx scripts/capture-fixtures.ts` (reads prod's public state, drops
  `createdEventBlob`, normalizes deal keys to epoch 1). Read the diff before committing —
  fixtures are public forever.
- Known limit: the mock does **not** replay the full lifecycle (only `SetClearing` /
  `OpenElections` exercise semantics). It is for designing views, not walking state machines.

### Seam freeze on `ui-ux` PRs

- **Hard fail, no override:** `app/custody/**`, `app/ledger-client/**`.
- **Soft gate:** `app/web/src/lib/**`, `app/web/src/ledger/**` — add the `seam-change` PR
  label to pass. The label is a prompt to *read those hunks*, not a rubber stamp.

### Before merging `ui-ux` → `main` (REQUIRED — CI does not cover this)

CI proves it compiles and the mock is happy; it cannot prove the UI still drives the real
ledger. So run the branch against real devnet with the **staging** party set:

```
cd app && npx tsx --env-file=.env custody/provision.ts   # once; mv custody-keys.json custody-keys.staging.json
CUSTODY_KEYS_JSON="$(cat custody-keys.staging.json)" npx tsx custody/server.ts
```

Click through a full deal. **Never smoke-test with the prod keys** — two servers sharing
parties with independent in-memory epoch counters collide on `dealId` and can corrupt the
live demo mid-pitch.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype
git add docs/HOSTING.md
git commit -m "docs: CI/CD, designer preview, seam freeze, pre-merge devnet smoke"
```

---

## Done criteria

- [ ] Push to `main` auto-deploys prod; https://continuum-custody.fly.dev has **no** banner and still signs real devnet txs.
- [ ] Push to `ui-ux` auto-deploys https://continuum-custody-preview.fly.dev, banner visible, `fly secrets list` empty.
- [ ] All six roles log into the preview and render **rich** views (no empty states, no Pending-forever).
- [ ] Preview Reset restores pristine state and the deal is still `M1`.
- [ ] `git diff main...ui-ux -- app/web/src` on a designer PR shows **only** UI changes; nothing under `app/custody/`.
- [ ] `cd app && npx vitest run` and `cd app/web && npx vitest run` both green.
- [ ] `grep -ril "mnemonic\|FN_SECRET" app/custody/fixtures/` returns nothing.

## Degradation path (only if time runs out)

**Cut fixtures (Task 4), keep the wrapper (Task 5).** Boot with an empty store and seed by
replaying `scripts/close-wallets.ts`'s command shapes through `store.submit(...)`. Those
shapes are proven against the real 1.1.0 contracts, so real *arg* shapes survive and only
real devnet *response* shapes are lost. You get creates but not derived state. Every
structural merge-safety property survives intact.

Do **not** improvise a different shortcut — cutting the wrapper instead breaks the epoch
guarantee and the zero-frontend-diff property, which are the reasons this design exists.
</content>
