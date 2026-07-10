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
shared validator, end to end:
1. Build the DARs (`dpm build --all` in `continuum-daml/`). Toolchain already installed
   (`~/.local/bin/dpm`, SDK 3.4.11, JDK 17).
2. Get an M2M access token (client_credentials → JWT; secret from the PDF, via env var).
3. **Upload the DAR** to the validator — try the JSON Ledger API package-upload endpoint
   (`/v2/packages` or the interactive-submission upload; check the API for the exact route) OR
   the Seaport UI if the API path isn't available.
4. **Allocate** at least 2 parties (`POST /v2/parties`) — e.g. a `gp` and a `buyer`.
5. **Create** one contract via `POST /v2/commands/submit-and-wait` acting-as `gp` (e.g.
   `RegistryAllocationFactory`, or mint a `RegistryHolding`).
6. **Query** `/v2/state/active-contracts` to confirm it's on-ledger.
7. If the **3.4.11 / LF-2.1 DAR is rejected** by the 3.5.7 validator: bump the packages to
   **SDK 3.5.x**, rebuild, re-run (our Daml is standard — expect a clean bump; re-pin the
   `splice-api-token-*-v1 0.6.11` DARs). Record whichever SDK works.
Report the result. If it can't be made to pass, STOP and escalate — everything else depends on it.

## Step 3 — Produce specs + plans (superpowers)

Once the deploy test passes, use **superpowers:writing-plans** (and `writing-specs`/brainstorming
only if a real ambiguity surfaces) to produce:
- **One short spec** for the app: the persona views, the UI-action → Daml-command/query map, the
  ledger-client + token-proxy design, party/act-as handling, and the read models.
- **Bite-sized, TDD-where-possible plans** carved into **independent workstreams so multiple
  agents can run in parallel** (the spec must define the seams that make this safe):
  - **Stream A — chain/deploy**: DAR deploy automation, party allocation, token-exchange proxy,
    the typed ledger client (codegen-js/`@c7/ledger` or hand-written JSON payloads), one
    command + one query proven against devnet.
  - **Stream B — frontend**: React+TS+Vite scaffold, port the 4 persona views from the HTML,
    wire them to the ledger-client interface (mock the client first so B doesn't block on A).
  - **Convergence**: end-to-end deal on devnet through the UI; verify conservation on-ledger.
  - **Submission**: public repo (secret gitignored), deck, 3-min video, deployed live product
    (host the React app + proxy).
  Make the ledger-client **interface** the contract between A and B so they parallelize cleanly.
- Sequence the streams: A's deploy-automation + B's scaffold/port can run in parallel from the
  start; they converge at wiring. Flag anything that MUST be sequential.

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
