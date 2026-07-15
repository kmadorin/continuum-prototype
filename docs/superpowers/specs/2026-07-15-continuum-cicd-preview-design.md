# Continuum CI/CD + designer preview — design

Date: 2026-07-15
Status: approved (owner), pending implementation plan

## Goal

1. Push to `main` → auto-redeploy the live fly app `continuum-custody`.
2. A `ui-ux` branch, where an external designer iterates on a frontend redesign, gets its own
   preview deployment — **with no secrets and no devnet traffic**.
3. The designer's work merges back to `main` safely. **Merge safety is the priority**, ahead of
   elegance and ahead of preview fidelity.

## Decision

**Mock the ledger on the server, not the frontend.** A second entrypoint `app/custody/server.mock.ts`
wires the *same* `createApp()` with fake dependencies, and is deployed as a second fly app.

**Rejected: `VITE_MOCK=1` + `MockLedgerClient` in the SPA.** Rationale below — it is more work *and*
a worse outcome. This reverses the owner's initial instinct; the reversal is deliberate.

### Why the frontend mock loses

- The SPA has **two** data paths, and `MockLedgerClient` only covers one.
  Reads go through `reads = new HttpLedgerClient('/api')` (`web/src/lib/useLedger.ts:21`), which
  *is* a typed seam. But writes and everything else raw-`fetch` nine same-origin endpoints:
  `/action`, `/auth/login`, `/me`, `/registry`, `/audit`, `/demo/reset`, `/docs/manifest`,
  `/verify/:name`, `/ledger/update/:id`.
- Covering both means `MockLedgerClient` (reads) **plus** a promoted `web/src/test/mockBackend.ts`
  (writes) — **two disconnected stores**. The designer clicks a button, gets a toast with a fake
  `updateId`, and nothing on screen ever changes.
- `useLedger.ts`'s `pollForContract` polls the ACS after every submit. A signer that does not
  materialize creates makes every flow hang for the full poll timeout and look broken.
- `mockBackend.ts` imports `vi` from vitest; promoting it to runtime means de-vitest-ing it.
- `MockLedgerClient` is a **fossil** of the pre-custody ("Stream B") architecture. Nothing mounts it
  at runtime. Reviving it in the SPA means the designer builds against a code path that no longer
  exists in production — precisely the drift that makes a merge unsafe.

### Why the server mock wins

`createApp(deps: AppDeps)` (`app/custody/app.ts:158`) is **already fully dependency-injected**:

```ts
export type AppDeps = {
  tenants: TenantStore;        // tenantsFromRecords(records) — pure, exported
  signer: Signer;              // submitSigned(party, key, fingerprint, commands)
  sessionSecret: string;
  ledgerBase: string;
  token: () => Promise<string>;
  fetchImpl?: typeof fetch;    // used by the /api reads proxy
  reads?: Reader;              // server-initiated idempotency checks (auto-seed)
  audit?: AuditEntry[];
  staticRoot?: string;
  secureCookie?: boolean;
  docsRoot?: string;
  seedOnBoot?: boolean;
};
```

`app/custody/server.ts` is purely a composition root — it builds `TokenManager` →
`HttpLedgerClient` → `WalletClient`, then calls `createApp`. **Every devnet dependency enters
through that one file.** `app/custody/app.test.ts`'s `makeDeps()` already proves the fake-wiring
pattern (throwaway mnemonics via `tenantsFromRecords`, a stub `Signer`, an injected `token`).
`server.mock.ts` is that pattern scaled to six roles with a real in-memory store.

Consequences, mapped to the two priorities:

- **Merge safety.** The `ui-ux` branch contains **zero** mock-conditional frontend code. No
  `import.meta.env.VITE_MOCK` branches, no swapped clients, no divergent paths. The merge diff is
  pure UI — components, CSS, layout. The API contract the designer builds against **is** the
  production route code, byte for byte, because it is the same `app.ts`.
- **Credibility.** The prod bundle is identical whether or not the preview exists. No environment
  variable can make the live demo secretly fake; that failure mode requires editing `fly.toml` to
  point at a different entrypoint file.

## Components

### 1. `app/custody/server.mock.ts` (new, ~150 lines)

A sibling of `server.ts`. Wires `createApp` with:

| Dep | Real (`server.ts`) | Mock (`server.mock.ts`) |
|---|---|---|
| `tenants` | `loadTenants()` ← `CUSTODY_KEYS_JSON` | `tenantsFromRecords()` ← 6 **deterministic** throwaway mnemonics (stable party IDs — the fixture rewrite targets) |
| `signer` | `WalletClient` → devnet | in-memory store; materializes `CreateCommand`s, applies exercises |
| `fetchImpl` | authed fetch → devnet | emulates 3 ledger endpoints against the same store |
| `reads` | `HttpLedgerClient` → devnet | adapter over the same store |
| `token` | `TokenManager` (real M2M) | `async () => 'mock-token'` |
| `staticRoot` | `../web/dist` | `../web/dist` (identical) |

**One store backs reads and writes.** This is the whole point — it is what the two-disconnected-store
frontend approach cannot give us.

The store logic is promoted from `web/src/ledger/mock.ts` (`store`, `seq`, `observersFor`,
per-party stakeholder projection) into the server. The SPA copy stays where it is, still used by
`mock.test.ts` and `PrivacyProof.test.tsx`; it is not deleted and not mounted.

**Ledger endpoints to emulate** (only these three — `HttpLedgerClient` is 41 lines, the surface is small):

- `GET /v2/state/ledger-end` → `{ offset }`
- `POST /v2/state/active-contracts` → the real wire shape:
  `contractEntry.JsActiveContract.createdEvent.{contractId, templateId, createArgument, createdEventBlob}`
  plus `synchronizerId`. Must honour the party filter the `/api` proxy forces.
- `GET /v2/updates/update-by-id` → canned tree for the Ledger Inspector.

**Safety fences (both required):**

1. `server.mock.ts` **refuses to boot** if `CUSTODY_KEYS_JSON` or `FN_SECRET` is present in the
   environment. Mock mode and key material must never coexist in one process.
2. Server-side inject a `PREVIEW — simulated ledger` banner into the served `index.html`. The
   preview self-labels with **zero frontend awareness** — no component knows it exists.

### 2. Fixture seeding (~1h)

Curl the live `/api/v2/state/active-contracts` once per template through a logged-in session; save
the `createdEvent` JSONs as fixtures under `app/custody/fixtures/`; seed the mock store from them on
boot.

Two payoffs:
- Kills read drift at the root — real field names, real party-id formats, real decimal strings.
- The preview boots into a **rich** state where all six role views render content immediately,
  instead of an empty epoch requiring a six-role click ceremony before anything appears.

Capture from the **prod** deal: it is already populated, whereas a staging set would need a full
deal run first just to have contracts worth capturing. This is safe — fixtures hold public contract
data and party IDs only, no key material (`party-registry.json` is already documented public on the
same grounds). Review captured bytes before committing regardless.

**Party-ID rewriting is required, not optional.** The mock's tenants derive *fresh* party IDs from
generated mnemonics, but fixtures carry the captured ledger's party IDs. Because the `/api` proxy
forces a party filter and the store projects by stakeholder, un-rewritten fixtures would match
**nothing** and every view would render empty — the precise failure fixtures exist to prevent. So:

- Mock tenants use **deterministic** mnemonics (as `app.test.ts` already does), giving stable,
  known mock party IDs.
- On seed, rewrite every captured party ID to its corresponding mock party ID via an explicit
  role→party map, applied recursively across `createArgument` (party IDs appear in nested fields
  and in arrays such as observers/stakeholders, not only at the top level).
- Seeding **fails loudly** if any captured party ID has no mapping, rather than silently seeding
  contracts nobody can see.

`createdEventBlob` cannot be rewritten (it is signed, opaque devnet bytes). It is only consumed by
`fetchDisclosed`, which the mock does not need; drop the blob at capture rather than ship a blob
whose contents contradict the rewritten args.

### 3. Seam freeze (CI gate)

A `ui-ux` PR **fails** if its diff touches:

- `app/custody/**`
- `app/ledger-client/**`
- `app/web/src/lib/**`
- `app/web/src/ledger/**`

Views and components are fair game; the seams are frozen. This targets the **real** merge risk,
which is not mock drift — it is the designer restructuring components and breaking the ops wiring.

### 4. Pre-merge devnet smoke (human gate)

Not a hosted clone — a 10-minute manual check.

Run `app/custody/provision.ts` **once** to mint a second, fully separate party set (it namespaces
every run via `RUN = Date.now().toString().slice(-6)`), save it as a gitignored
`app/custody-keys.staging.json`. Before merging a `ui-ux` PR, run the branch locally against real
devnet with those staging keys and click through the demo.

**Never smoke-test locally with the prod keys.** Two servers sharing parties with independent
in-memory epoch counters is exactly the `dealId` collision this design exists to avoid.

## Topology

**Fly apps**

| App | Entrypoint | Secrets | Machines |
|---|---|---|---|
| `continuum-custody` (exists) | `custody/server.ts` | FN_SECRET, CUSTODY_KEYS_JSON, CUSTODY_SESSION_SECRET, SYNCHRONIZER_ID | `min_machines_running = 1` (in-memory audit/sessions/epoch) |
| `continuum-custody-preview` (new) | `custody/server.mock.ts` | **none** | `min_machines_running = 0`, auto-start |

Preview `min_machines_running = 0` is safe: the store is fixture-seeded on boot, so idle state loss
is a feature, not a bug — and it costs nothing while the designer sleeps.

**Configs:** existing `app/fly.toml` unchanged; new `app/fly.preview.toml` — same `Dockerfile`,
`[processes] app = "npx tsx custody/server.mock.ts"`.

**One workflow, `.github/workflows/ci.yml`**

- Triggers: `pull_request`, and `push` to `main` and `ui-ux`.
- Job `test`:
  - `app/`: `npm ci && npx vitest run` (22 custody tests)
  - `app/web/`: `npm ci && npm run lint && npm run build && npx vitest run` (66 web tests).
    `npm run build` runs `tsc -b` — **that is the type gate**.
- Job `seam-freeze`: on PRs targeting `main` from `ui-ux`, fail on frozen-path diffs (§3).
- Job `deploy-prod`: `needs: test`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`
  → `flyctl deploy --config fly.toml --remote-only`.
- Job `deploy-preview`: `needs: test`, on `push` to `ui-ux` → `flyctl deploy --config fly.preview.toml --remote-only`.
- Each deploy job uses a **deploy-scoped** token (`fly tokens create deploy -a <app>`), stored as
  separate repo secrets — not a personal org-wide token.
- `concurrency` group per app so pushes do not race.

**Branch protection on `main`:** require PR + the `test` check. The human gate is the staging-keys
smoke (§4); CI does not replace it.

## Testing

- `server.mock.ts` gets tests in the existing `app/` vitest suite:
  - boots and serves `/registry`;
  - login → `/action` → the created contract appears in a subsequent ACS read (proves the single
    store closes the read/write loop — the failure the frontend-mock approach could not avoid);
  - **refuses to boot when `FN_SECRET` or `CUSTODY_KEYS_JSON` is set** (security-critical fence);
  - fixture seeding rewrites party IDs so a seeded contract is actually **visible** to the mock
    tenant that should see it, and **throws** on an unmapped party ID.
- Existing 22 custody + 66 web tests must stay green; the SPA is untouched by this work.

## Accepted tradeoffs

- **The preview will not replay full lifecycle transitions.** `MockLedgerClient`'s exercise
  semantics only cover `SetClearing`/`OpenElections`. We deliberately do **not** simulate Daml.
  Fixtures make every view render rich, real-shaped data; exercise handling is extended only if the
  designer specifically needs to walk a given transition. *A designer restyling views needs state,
  not state machines.*
- Read drift is killed by fixtures; write-path drift is bounded by the seam freeze plus the
  pre-merge devnet smoke.
- The mock store is not persisted. Restart = reseed from fixtures. Fine for a design preview.

## Estimate

≈ half a day: `server.mock.ts` ~150 lines, fixtures ~1h, two workflow files, one fly app, one
`fly.preview.toml`.

## Provenance

Design advised by Fable (`claude-fable-5`), which verified the DI claim and the two-seam split
against the source before recommending. The server-mock direction and the two-disconnected-stores
landmine are its findings; the owner's original `VITE_MOCK=1` instinct was explicitly overruled and
the owner approved the reversal.

Related: `docs/HOSTING.md`, `docs/custody-live-proof.md`, `docs/devnet-deploy-test-RESULT.md`.
</content>
