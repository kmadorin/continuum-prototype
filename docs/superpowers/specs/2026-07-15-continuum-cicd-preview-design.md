# Continuum CI/CD + designer preview — design

Date: 2026-07-15
Status: approved (owner); revised after Fable review round 2

## Goal

1. Push to `main` → auto-redeploy the live fly app `continuum-custody`.
2. A `ui-ux` branch, where an external designer iterates on a frontend redesign, gets its own
   preview deployment — **with no secrets and no devnet traffic**.
3. The designer's work merges back to `main` safely. **Merge safety is the priority**, ahead of
   elegance and ahead of preview fidelity.

## Decision

**Mock the ledger on the server, not the frontend.** A second entrypoint `app/custody/server.mock.ts`
wires the *same* `createApp()` with fake dependencies, and is deployed as a second fly app.

**Rejected: `VITE_MOCK=1` + `MockLedgerClient` in the SPA.** It is more work *and* a worse outcome.

### Why the frontend mock loses

- The SPA has **two** data paths, and `MockLedgerClient` only covers one. Reads go through
  `reads = new HttpLedgerClient('/api')` (`web/src/lib/useLedger.ts:21`), a genuine typed seam. But
  writes and everything else raw-`fetch` nine same-origin endpoints: `/action`, `/auth/login`, `/me`,
  `/registry`, `/audit`, `/demo/reset`, `/docs/manifest`, `/verify/:name`, `/ledger/update/:id`.
- Covering both means `MockLedgerClient` (reads) **plus** a promoted `web/src/test/mockBackend.ts`
  (writes) — **two disconnected stores**. The designer clicks a button, gets a toast with a fake
  `updateId`, and nothing on screen ever changes.
- `useLedger.ts`'s `pollForContract` polls the ACS after every submit. A signer that does not
  materialize creates makes every flow hang for the poll timeout and look broken.
- `MockLedgerClient` is a **fossil** of the pre-custody ("Stream B") architecture; nothing mounts it
  at runtime. Reviving it means the designer builds against a code path that no longer exists in
  production — precisely the drift that makes a merge unsafe.

### Why the server mock wins

`createApp(deps: AppDeps)` (`app/custody/app.ts:158`) is **already fully dependency-injected**:
`tenants`, `signer`, `token`, `fetchImpl?`, `reads?`, `audit?`, `staticRoot?`, `secureCookie?`,
`docsRoot?`, `seedOnBoot?`. `app/custody/server.ts` is purely a composition root (`TokenManager` →
`HttpLedgerClient` → `WalletClient` → `createApp`) — **every devnet dependency enters through that one
file**. `app/custody/app.test.ts`'s `makeDeps()` already proves the fake-wiring pattern.

- **Merge safety.** The `ui-ux` branch contains **zero** mock-conditional frontend code. The merge
  diff is pure UI. The contract the designer builds against **is** the production route code, byte
  for byte.
- **Credibility.** The prod bundle is identical whether or not the preview exists. No environment
  variable can make the live demo fake.

## Components

### 1a. Outer wrapper (the piece with no injection point)

`server.mock.ts` builds an **outer Hono app** that handles three routes itself and delegates
everything else to the inner `createApp` instance. This exists because three needs have **no**
`AppDeps` hook, and an implementer who doesn't know that will try to add options to `AppDeps` and
silently forfeit the "same `app.ts`" guarantee.

1. **`POST /demo/reset`** — intercepted. Re-seeds the store from fixtures and returns
   `{ deal: <epoch-1 keys> }`. It **never reaches the inner app**, so `demoEpoch` stays 1 forever and
   `/registry` keeps returning `M1`. Bonus: Reset becomes "restore pristine designer state," which is
   what a designer actually wants from that button.
2. **Banner injection** — `app.ts:543` registers `app.get('/*')` and reads `index.html` off disk with
   no hook. The outer app registers `GET /` and `GET /index.html` **first**, reads the file,
   string-injects the `PREVIEW — simulated ledger` banner + `<style>`, returns it. This is the only
   way to self-label the preview with **zero frontend awareness**.
3. Route-order discipline generally (outer routes must be registered before delegation).

**Why not pin the epoch instead:** verified — `demoEpoch` is a closure-local `let` at `app.ts:309`,
inside `createApp`. It cannot be read, pinned, or reset from outside without editing `app.ts`.
Intercepting `/demo/reset` is the only way to neutralize it without touching production route code.

### 1b. `app/custody/server.mock.ts`

A sibling of `server.ts`, wiring `createApp` with:

| Dep | Real (`server.ts`) | Mock (`server.mock.ts`) |
|---|---|---|
| `tenants` | `loadTenants()` ← `CUSTODY_KEYS_JSON` | `tenantsFromRecords()` ← **captured party IDs** + dummy mnemonics |
| `signer` | `WalletClient` → devnet | in-memory store; materializes `CreateCommand`s, applies exercises |
| `fetchImpl` | authed fetch → devnet | emulates 3 ledger endpoints against the same store |
| `reads` | `HttpLedgerClient` → devnet | adapter over the same store |
| `token` | `TokenManager` (real M2M) | `async () => 'mock-token'` |
| `audit` | fresh `[]` | **pre-seeded** rows (see §2c) |
| `seedOnBoot` | `true` | **`false`** — fixtures already contain the ValuationReport |
| `staticRoot` | `../web/dist` | `../web/dist` (identical) |
| `secureCookie` | `NODE_ENV === 'production'` | same expression (Dockerfile sets production → `true` behind fly HTTPS) |

**One store backs reads and writes.** This is the whole point, and what the two-disconnected-store
frontend approach cannot give us.

**Structure it for testability** — mirror `server.ts`: export a pure `assertMockEnv(env)` and a
`createMockApp(deps)`, with `main()` at the bottom. A top-level `if (process.env.FN_SECRET) throw`
cannot be imported by a test without crashing the runner. Tests save/restore `process.env`.

**Ledger endpoints to emulate** (only these three — `HttpLedgerClient` is 41 lines):

- `GET /v2/state/ledger-end` → `{ offset }`
- `POST /v2/state/active-contracts` → real wire shape
  `contractEntry.JsActiveContract.createdEvent.{contractId, templateId, createArgument}` plus
  `synchronizerId`. Must honour the party filter the `/api` proxy forces.
- `GET /v2/updates/update-by-id` → **a map keyed by updateId**, not one canned tree. Seeded audit
  rows are clickable and open the LedgerInspector; a single canned tree makes every row open the same
  transaction, and a 404 shows an error state. The store records a tree per live submit too.
  `parseUpdateTree` wants `updateId`, `commandId`, `offset`, `recordTime`/`effectiveAt`,
  `synchronizerId`, `events[]` — capture one real tree from prod to get the shape.

**Store logic is FORKED from `web/src/ledger/mock.ts`** (`store`, `seq`, `observersFor`, per-party
stakeholder projection), not moved. The SPA copy stays where it is — dead code retained only for
`mock.test.ts` and `PrivacyProof.test.tsx`. Delete it after the hackathon.

**Boot fence:** `assertMockEnv` **refuses to boot** if `CUSTODY_KEYS_JSON` or `FN_SECRET` is present.
Mock mode and key material must never coexist in one process. Refuse, don't warn: the only ways key
material reaches this process are someone running `fly secrets set` on the preview app (exactly the
mistake worth hard-stopping) or a dev running locally with `--env-file=.env` (where a clear crash is
correct). Neither is a designer's environment mysteriously going down.

**Be honest about what this fence covers:** it stops keys leaking *into* the mock. It does **nothing**
about the inverse and more damaging failure — the mock being served *from the prod app*. The defenses
there are the **deploy-scoped tokens** (§4: the preview token literally cannot deploy to prod, so this
is impossible via CI) and the **banner** (catches the manual-laptop case). Token scoping is doing more
credibility work than the boot check.

### 2. Fixtures

#### 2a. Tenants: adopt, don't rewrite

Verified at `tenants.ts:38-52`: `tenantsFromRecords` copies `r.party` **verbatim** and separately
derives `key` from the mnemonic. **`party` and `mnemonic` are independent — nothing derives one from
the other and nothing validates they correspond.** The mock signer never verifies a signature.

So mock tenants **adopt the captured party IDs** with dummy mnemonics. Prod `/registry`
(`app.ts:319-327`) already returns `{parties: {role → partyId}, custodians, deal}` — one public curl,
no session needed. Build six `TenantRecord`s from it: captured `party`, `app.test.ts`-style dummy
mnemonic, our own username/password. Fixtures then match **by construction**.

This deletes the party-ID rewrite entirely: no mapping, no recursion, no unmapped-party failure mode,
no tenant/fixture drift (both come from the same capture). The rewrite was not merely extra work — it
was a bug farm: party IDs can appear as **map keys**, not only values, which a recursive
value-rewriter silently misses and a fail-loud scan would not catch.

`fingerprint` is displayed in the audit trail — derive it from the dummy key through the normal code
path so it is real-shaped (right length/charset, wrong value). Do not hand-write `"mock-fp-gp"`; that
is exactly the field-shape drift fixtures exist to kill, and a designer would size a column to it.

#### 2b. ACS capture + deal-key normalization

Curl the live `/api/v2/state/active-contracts` once per template through a logged-in session; save
`createdEvent` JSONs under `app/custody/fixtures/`; seed the store on boot.

**Drop `createdEventBlob` at capture.** Verified: nothing in `web/src` calls `fetchDisclosed` (only
`scripts/close-minimal.ts:89`, headless, never in the preview); `Signer.submitSigned` (`app.ts:25-32`)
has **no** disclosed-contracts parameter so `/action` structurally cannot pass disclosure;
LedgerInspector (`app.ts:416`) and `/verify` (`app.ts:498`) both set `includeCreatedEventBlob: false`.
`ActiveContract.createdEventBlob` is optional (`types.ts:7`), so dropping it typechecks. It is signed
opaque bytes that cannot be rewritten anyway.

**Normalize deal keys to epoch 1 at capture — this is a capture-time landmine, not a reset-only bug.**
`demoEpoch` starts at 1 in the mock, but fixtures carry whatever epoch prod was in when curled. If
anyone clicked Reset on prod since its last restart, fixtures say `dealId: "M3"` while the mock's
`/registry` returns `M1` → the SPA sets `DEAL_ID='M1'` → **every view filters on M1 and renders
empty**. The preview's correctness would silently depend on prod's in-memory counter at capture time.

So the capture script records `/registry`'s `deal` block alongside the ACS and rewrites
`dealId`/`cv`/`unit`/`usdc` in `createArgument` from the captured epoch's keys to the epoch-1
constants (`M1`, `Meridian CV I`, `MERIDIAN-CV-I`, `USDC` — from `dealKeys(1)` at `app.ts:311`). Note
the irony: we delete a party rewrite and gain a deal-key rewrite — but this one is a four-entry
string→string substitution over **known** key names, not recursion over unknown party positions. ~10
lines, and it makes capture epoch-independent instead of silently timing-dependent.

**Capture from prod is correct.** The test is not "is this public" but "is any of this real about a
real counterparty" — it is synthetic Meridian CV I demo data at a made-up $500M. Party IDs are already
public (`party-registry.json` is documented so on the same grounds). Fixtures are committed and public
forever: review the bytes before committing.

#### 2c. Seed the audit log too

`audit` is an injectable `AuditEntry[]`, and fixtures only seed the ACS — so `/audit` would return
`[]` and **`views/AuditTrail.tsx` and `components/HoldingReceipt.tsx` (fetches `/audit`, line 54)
render empty for the designer.** That is the exact failure fixtures exist to prevent, one endpoint
over. Pass a pre-populated array into `createApp({audit})` with a handful of real-shaped rows,
including at least one `outcome: 'failed'` so the error styling has a specimen to design against.
Their `updateId`s must exist in the update-by-id map (§1b).

### 3. Seam freeze (CI gate) — two tiers

One tier is wrong: `web/src/lib` is `useLedger.ts`/`ops.ts`/`docs.ts` — logic, zero styling, so a pure
restyle has no business there. **But** `useLedger.ts` also exports `shortParty`, `DEMO`, `T`, `R` —
display-adjacent constants a redesign may legitimately touch. A hard fail *will* fire, the owner *will*
override, and after the second override the gate is noise.

- **Hard fail, no override:** `app/custody/**`, `app/ledger-client/**`. A UI redesign touching the
  backend is always wrong.
- **Soft gate:** `app/web/src/lib/**`, `app/web/src/ledger/**`. Fails by default; a `seam-change` PR
  label makes it pass. The label is not an escape hatch — it is a **signal to the owner to actually
  read that hunk**, which is the point of the gate.

This targets the **real** merge risk, which is not mock drift — it is the designer restructuring
components and breaking the ops wiring.

### 4. Pre-merge devnet smoke (human gate)

Not a hosted clone — a 10-minute manual check. Run `provision.ts` once to mint a second, fully
separate party set (it namespaces every run via `RUN = Date.now().toString().slice(-6)`), save as
gitignored `app/custody-keys.staging.json`. Before merging a `ui-ux` PR, run the branch locally
against real devnet with those staging keys and click through.

**Never smoke-test locally with the prod keys.** Two servers sharing parties with independent
in-memory epoch counters is exactly the `dealId` collision this design exists to avoid.

## Topology

| App | Entrypoint | Secrets | Machines |
|---|---|---|---|
| `continuum-custody` (exists) | `custody/server.ts` | FN_SECRET, CUSTODY_KEYS_JSON, CUSTODY_SESSION_SECRET, SYNCHRONIZER_ID | `min_machines_running = 1` (in-memory audit/sessions/epoch) |
| `continuum-custody-preview` (new) | `custody/server.mock.ts` | **none** | `min_machines_running = 0`, auto-start |

Preview idling is safe (fixture-seeded on boot) but the designer's in-session mock writes vanish when
fly stops the machine mid-coffee — harmless, but it *looks* like a bug. Use
`auto_stop_machines = "suspend"` or document it.

**Configs:** `app/fly.toml` unchanged; new `app/fly.preview.toml` — same `Dockerfile`,
`[processes] app = "npx tsx custody/server.mock.ts"`. **Once `[processes]` is defined, fly needs the
http_service bound to a group** — likely `processes = ["app"]` inside `[http_service]`, or nothing
binds. Budget a deploy iteration; this is the classic first-deploy time sink.

**`.dockerignore` must not exclude `app/custody/fixtures/`**, and fixtures must be committed. Trivial,
and a 20-minute debug if wrong.

**Preview credentials must be documented** — the designer cannot guess the mock tenants'
usernames/passwords.

**One workflow, `.github/workflows/ci.yml`**

- Triggers: `pull_request`, and `push` to `main` and `ui-ux`.
- Job `test`: `app/`: `npm ci && npx vitest run`; `app/web/`: `npm ci && npm run lint && npm run build
  && npx vitest run`. `npm run build` runs `tsc -b` — **that is the type gate**.
- Job `seam-freeze`: on PRs targeting `main`, the two-tier check (§3).
- Job `deploy-prod`: `needs: test`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`
  → `flyctl deploy --config fly.toml --remote-only`.
- Job `deploy-preview`: `needs: test`, on `push` to `ui-ux` → `flyctl deploy --config fly.preview.toml
  --remote-only`.
- **Deploy-scoped tokens** (`fly tokens create deploy -a <app>`), stored as separate repo secrets — not
  a personal org-wide token. This is a **credibility control**, not CI hygiene: it makes deploying the
  mock to prod impossible via CI.
- `concurrency` group per app so pushes do not race.

**Branch protection on `main`:** require PR + the `test` check. The human gate is the staging-keys
smoke (§4); CI does not replace it.

## Testing

- `server.mock.ts` tests in the existing `app/` vitest suite:
  - boots and serves `/registry`;
  - login → `/action` → the created contract appears in a subsequent ACS read (proves the single store
    closes the read/write loop);
  - `assertMockEnv` **throws when `FN_SECRET` or `CUSTODY_KEYS_JSON` is set** (security-critical);
  - fixture seeding makes a seeded contract **visible** to the tenant that should see it;
  - `POST /demo/reset` restores pristine state and `/registry` still reports epoch 1 (proves the
    intercept holds and `demoEpoch` never bumps).
- Existing 22 custody + 66 web tests stay green; the SPA is untouched.

## Accepted tradeoffs

- **The preview will not replay full lifecycle transitions.** `MockLedgerClient`'s exercise semantics
  cover only `SetClearing`/`OpenElections`. We deliberately do **not** simulate Daml. Fixtures make
  every view render rich, real-shaped data; exercise handling is extended only if the designer needs
  to walk a specific transition. *A designer restyling views needs state, not state machines.*
- Read drift is killed by fixtures; write-path drift is bounded by the seam freeze plus the pre-merge
  devnet smoke.
- The mock store is not persisted. Restart = reseed from fixtures.

## Degradation path (if time compresses)

**Cut fixtures first, not the wrapper.** Fallback: boot with an empty store and seed by replaying
`scripts/close-wallets.ts`'s command shapes through the store's own submit path. Those shapes are
proven against the real 1.1.0 contracts, so real *arg* shapes survive and only real *devnet response*
shapes are lost. You get creates but not derived state (exercises cover only
`SetClearing`/`OpenElections`). Partial richness, zero capture work, and **every structural
merge-safety property survives intact**.

Named here explicitly so nobody improvises a worse degradation under pressure.

## Estimate

**1 to 1.5 days** for someone who knows this code. The earlier "half a day / ~150 lines" was not
honest: `server.mock.ts` is realistically 250–350 lines once the store and three endpoint emulations
land, and the scope now includes the outer wrapper, reset intercept, banner injection, deal-key
normalization, audit seeding, the update-by-id map, a capture script, four tests, and fly
process-group debugging. Still the right trade.

## Provenance

Design advised by Fable (`claude-fable-5`) across two rounds, which verified every claim against
source. Round 1: the server-mock direction and the two-disconnected-stores landmine. Round 2: replaced
party-ID rewriting with adoption, found the closure-local `demoEpoch` (no injection point → outer
wrapper), the epoch capture-time landmine, the empty audit log, and the two-tier seam freeze. The
owner's original `VITE_MOCK=1` instinct was overruled with his approval.

Related: `docs/HOSTING.md`, `docs/custody-live-proof.md`, `docs/devnet-deploy-test-RESULT.md`.
</content>
