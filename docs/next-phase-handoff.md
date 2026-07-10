# Handoff prompt — Continuum: prototype → working devnet app (context + deploy test + specs/plans)

> Paste the block below into a FRESH chat. It gathers context, runs the devnet deploy test,
> then produces superpowers specs + plans carved for parallel execution.

---

You are picking up the **Continuum** hackathon project mid-stream. Goal: **turn the static HTML
prototype into a working web app that connects to Canton devnet and drives our already-tested
Daml contracts (deploy them on-ledger + wire the UI operations to them).** Hard deadline:
**Mon 13 July 2026, 12:59 BST** (~3 days). Move fast; get the qualifying floor green first.

Work on git branch off the repo at `/Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype`
(it's a git repo). Don't push unless asked.

## Step 1 — Gather context (read these first, in order)

1. **`continuum-prototype/docs/next-phase-brainstorm-prompt.md`** — the full context dump:
   what exists (HTML prototype + tested Daml), hackathon HARD requirements (on-ledger devnet
   mandatory, live-product link, repo/deck/3-min-video, tracks, judging), the 5N Seaport /
   loop-sdk / id-sdk findings, and the **DEVNET WIRING (resolved)** section. READ THIS FULLY —
   it has the endpoints, auth flow, and architecture decision. This handoff assumes it.
2. **`Seaport Sandbox Validator Access.pdf`** (repo root) — the ledger API endpoint + OIDC M2M
   auth. ⚠️ the client secret is **shared + plaintext**; the submission repo must be PUBLIC, so
   keep the secret OUT of git (env var / gitignored `.env` / tiny token-exchange proxy).
3. **`continuum-prototype/continuum-daml/`** — the Daml (41 tests green, e2e on a 3.5.6 sandbox).
   Contracts in `contracts/daml/Continuum/`; scripts in `scripts/`. Key choices the UI drives:
   credential issuance, `SealedBid`, `SetClearing`, `RecordConsent`, `OpenElections`,
   `LPElection`, `allocateFor` (phase-1), `Close`; reads: `RegistryHolding`, `Allocation`,
   `FairnessDisclosure`, `SettlementReceipt`. Party model + `ExecDelegation` authority pattern
   are documented in the brainstorm doc.
4. **`continuum-prototype/prototype/`** and **`portal/`** — the static HTML to port (4 personas:
   advisor/GP, secondary buyer, exiting LP, LPAC oversight). `prototype/demo-script.md` = the flow.
5. Reference: `Jatinp26/Seaport-Guide` (11-step Seaport UI walkthrough), video
   `youtu.be/uFi9meqpr3c`, Canton docs mirror at `../cf-docs` (don't guess APIs).

**Already PROVEN (don't re-litigate):** devnet access works — token exchange (OIDC
client_credentials, 8h JWT) + `GET /v2/state/ledger-end` → HTTP 200 `{"offset":...}` on
`https://ledger-api.validator.devnet.sandbox.fivenorth.io/`. Architecture = **deploy DAR via
Seaport/ledger-API + a thin custom React frontend hitting the standard JSON Ledger API v2
directly** (no Java backend); loop-sdk optional for wallet UX.

## Step 2 — Run the devnet DEPLOY GATING TEST (do this BEFORE writing specs)

This is pass/fail for the whole submission. Prove a Continuum contract goes on-ledger on the
shared validator, end to end. **Endpoints/verbs verified against the Canton 3.5 JSON Ledger
API v2 OpenAPI — use them as written:**
1. Build the DARs (`dpm build --all` in `continuum-daml/`). Toolchain installed
   (`~/.local/bin/dpm`, SDK 3.4.11, JDK 17).
2. Get an M2M access token (client_credentials → JWT; secret from the PDF, via env var). The
   JWT `sub` is the ledger **user id** you'll act as.
3. **FIRST validate the token's privilege level** — DAR upload (`POST /v2/dars`) and party
   allocation (`POST /v2/parties`) require **`participant_admin`**; a shared M2M token may be
   scoped to `daml_ledger_api` only and will **403** on these. Check `GET /v2/authenticated-user`.
   **If it lacks admin, fall back to the Seaport UI for BOTH DAR upload AND party allocation**
   (party-management), and use the API only for command submission + queries. Decide this on
   day 1 — it changes Stream A's deploy automation.
4. **Upload the DAR**: `POST /v2/dars` (`application/octet-stream`; NOT the deprecated
   `/v2/packages`). Optionally `POST /v2/dars/validate` first to pre-check upgrade-compat.
5. **Allocate** ≥2 parties (`POST /v2/parties`, body `{partyIdHint, userId, synchronizerId?}`)
   — e.g. `gp`, `buyer`. **Pass `userId` = the token's `sub`** so that user gets `act_as` on
   the new party. (Alt: `POST /v2/users/{id}/rights` with `CanActAs`.) **Without this bind,
   step 7 returns PERMISSION_DENIED** — allocating a party does NOT by itself let your token
   act as it. Confirm rights via `GET /v2/authenticated-user`.
6. Read the current offset: `GET /v2/state/ledger-end` → `activeAtOffset`.
7. **Create** one contract: `POST /v2/commands/submit-and-wait` with `JsCommands`
   {`commandId`, `commands`, `actAs:[gp]`}; template ids use the `#package-name:Module:Entity`
   form. Start simple — mint a `RegistryHolding` or create `RegistryAllocationFactory`.
   **NOTE for the splice-token / `ExecDelegation` exercises later**: factory/allocation/interface
   choices are exercised on contracts the actor may not be a stakeholder of → the command body
   needs **`disclosedContracts`** (fetch each CID + its `createdEventBlob` from active-contracts).
   This is the most likely reason a *correct-looking* submit still fails — bake it into the client.
8. **Query** `POST /v2/state/active-contracts` (it's POST, body needs `activeAtOffset` + an
   `eventFormat`; NOT a bare GET) to confirm the contract is on-ledger.
9. If the **3.4.11 / LF-2.1 DAR is rejected** by the 3.5.7 validator (LOW risk — our DARs already
   ran e2e on a 3.5.6 sandbox and the pinned splice DARs ARE the devnet 0.6.11 bundle): bump the
   packages to **SDK 3.5.x**, **bump the package version** (vetting's upgrade-compat check rejects
   a same-name/same-version package with a different hash), rebuild, re-run.
Report the result. If it can't be made to pass, STOP and escalate — everything else depends on it.

## Step 3 — Produce specs + plans (superpowers)

Once the deploy test passes, use **superpowers:writing-plans** (and `writing-specs`/brainstorming
only if a real ambiguity surfaces) to produce:
- **One short spec** for the app: the persona views, the UI-action → Daml-command/query map, the
  ledger-client + token-proxy design, party/act-as handling, and the read models.
- **Bite-sized, TDD-where-possible plans** carved into **independent workstreams so multiple
  agents can run in parallel** (the spec must define the seams that make this safe):
  - **Stream A — chain/deploy**: DAR deploy + party allocation (API or Seaport UI per step 3),
    the **reverse-proxy** (see below), the typed ledger client (codegen-js/`@c7/ledger` or
    hand-written JSON payloads incl. `disclosedContracts` handling), one command + one query
    proven against devnet.
  - **Stream B — frontend**: React+TS+Vite scaffold, port the 4 persona views from the HTML,
    wire them to the ledger-client **interface** (mock the client first so B doesn't block on A).
  - **Convergence**: end-to-end deal on devnet through the UI; verify conservation on-ledger.
  - **Submission (floor-critical, not polish)**: public repo (secret gitignored), deck, 3-min
    video, and a **hosted live product** — the "live product link" is a HARD requirement, so
    host the React app + proxy (e.g. Vercel/Netlify + a small serverless proxy) as part of the floor.
- **The A/B seam is TWO artifacts** (define both in the spec): (i) the TS ledger-client
  *interface* (shape B mocks), and (ii) a generated **party-registry config** (real devnet party
  IDs + which persona maps to which) that A emits after allocation. B must read party IDs from
  (ii), NOT hard-code strings — a fake string passes the mock and breaks on wiring.
- **The reverse-proxy is on the FLOOR, not optional**: a pure-browser app both leaks the shared
  secret AND is likely CORS-blocked by the ledger API. So build a **thin reverse-proxy that
  injects the Bearer token (handling 8h refresh) and forwards all `/v2/*` calls** — one box
  solves secret-hiding + CORS. The browser talks only to the proxy.
- Sequence: A's deploy-automation + B's scaffold/port run in parallel from the start; they
  converge at wiring (which needs the party-registry + a live proxy). Flag anything sequential.

## Constraints / guardrails

- ~3 days, team of 2. Floor first: **on-ledger devnet contracts + a minimal clickable live
  product** driving ≥1 real flow — that's the qualifying bar. Then widen to the full deal.
- Keep the tested Daml as source of truth; the app wraps it, doesn't reimplement settlement.
- Secret OUT of the public repo. 8h token expiry → refresh logic.
- Don't gold-plate before the floor is green on devnet.

## Deliverable of this new chat

(1) A green devnet deploy test (a Continuum contract on-ledger, with the working SDK version +
the exact deploy/party/command steps recorded), then (2) a committed **spec** + **plan(s)**
carved for parallel agent execution, with the first task of each stream ready to dispatch.
