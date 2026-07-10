# Brainstorming prompt — Continuum: static prototype + Daml → deployed devnet app

> Paste the block below into a fresh chat to start the next-phase brainstorm.

---

Use the **superpowers:brainstorming** skill. Do NOT jump to implementation — explore
intent, requirements, and design trade-offs first, then produce a recommended path +
a phased plan. Ask me questions where a decision is genuinely mine.

## Goal

Get **Continuum** (an ILPA-grounded continuation-fund settlement engine) from "static
HTML prototype + tested Daml contracts" to a **deployed app on Canton devnet, wired to
the smart contracts**, that a hackathon judge can click through: connect a wallet, issue
tokens, and run the deal (create deal → sealed bids → LP elections → atomic close →
oversight/verification). Decide the fastest credible path and scope it to the deadline.

## What already exists (repo: /Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype)

- **Static HTML prototype** — `prototype/` and `portal/`. Multi-persona UX sim (advisor/GP,
  secondary buyer, exiting LP, LPAC oversight). Pure client-side, no Canton, no wallet. See
  `prototype/demo-script.md`.
- **Daml contracts** — `continuum-daml/` (3 packages: `contracts/`, `scripts/`, `tests/`).
  - 41 Daml Script test declarations green; full deal close verified **end-to-end on a live
    Canton 3.5.6 sandbox** (`e2e/run.sh`, `Continuum.Scenario:setupCloseAndAssert`).
  - Implements the **real `splice-api-token-*-v1` interfaces** (Holding, Allocation,
    AllocationFactory, AllocationRequest) via a generic `Registry`. Uses SDK 3.4.11, LF 2.1,
    DARs pinned from the 0.6.11 splice-node bundle.
  - Load-bearing design facts: `Allocation_ExecuteTransfer` controllers are interface-fixed
    as {sender,receiver,executor}, solved with a co-signed `ExecDelegation`/`ExecFor` pattern.
    MVP party model collapses gp = vehicle = oldFund = registry admin (one party). Distinct
    parties: ValuationAgent, FairnessProvider, LPAC, Regulator(optional), Issuer, each LP,
    each Buyer. Close enforces units-issued == PSA price on-ledger.
  - Governance is ILPA-accurate: **LPAC** (LP committee) is the oversight/fairness observer;
    "regulator" is an OPTIONAL external attestation, not a required party.
- **Toolchain installed**: dpm 1.0.21, Daml SDK 3.4.11, JDK 17. `~/.local/bin/dpm` wrapper.
- **Docs**: plan + spec under `continuum-prototype/docs/superpowers/`; ILPA source PDF at
  repo root; Canton docs mirror at `../cf-docs` (use it, don't guess APIs).
- **DEVNET ACCESS IS ALREADY SOLVED** — the team is authorized on **5N Seaport**
  (https://app.devnet.seaport.to/), a **hosted Canton Network web-IDE + validator**. It
  supports: **Upload DAR → deploy to validator → create contract in one step**, "Upload DAR
  to Validator" (deploy custom packages), Connect-GitHub (import repo), and templates for
  **CIP-56 Token** and **Allocation Factory (swap/payment settlement)** — our exact domain.
  A Canton **party is already provisioned** (`41319a…::1220c6…`). So the classic devnet
  onboarding path (apply for + run our own validator, SV sponsor, VPN, 1-hr secret) is NOT
  needed. NOTE: "5N Seaport" is unrelated to OpenSea's EVM "Seaport" — same name, different
  thing; the correct docs are the in-app Documentation / "How to use seaport" user guide, not
  the ProjectOpenSea GitHub repo. Seaport is a 5North (Five North Digital) product; its docs
  are `docs.fivenorth.io` (has `5n-dashboard` → **dar-management** + **party-management**,
  `hosted-node`, `sandbox`, `sponsored-node`). GitHub org: `github.com/fivenorth-io`
  (Seaport itself is closed-source; relevant public repos below).
- **Sanctioned hackathon deploy path (from the "Canton Tech Deep Dive" workshop, Encode
  Build-on-Canton)**: Seaport IS the recommended tool, and **a shared DevNet validator is
  pre-configured inside Seaport for teams** ("select this validator … configured for you on
  DevNet"). Deploy flow: write Daml → **Build** (→ DAR) → **Deploy** → select the DAR → select
  the provided validator. Multi-package file needed for multiple modules. Seaport's UI also
  **creates contracts + exercises choices** (auto-generated "Smart Choice Exercise" forms) and
  **tracks contract IDs/disclosures + full history**. BUT — see HARD REQUIREMENTS below — a
  Seaport-only mock-up does NOT qualify; Seaport is the build+deploy tool, and we ALSO need a
  separate "live product" link. The workshop did NOT cover external frontends or wallet-connect
  — that's our own integration.
- **loop-sdk** (`@fivenorth/loop-sdk`, `github.com/fivenorth-io/loop-sdk`) — the JS client for
  a dApp/React frontend to connect the **5N Loop wallet** and hit the Canton ledger:
  `init(network:'devnet')` → `connect()` (QR) → `getActiveContracts` (query by template/
  interface id), `submitTransaction`/`submitAndWaitForTransaction`, `signMessage`, `transfer`,
  `getHolding`. Works on devnet. **IMPORTANT limitation (README)**: "we only support DAML
  transaction from the Splice built-in DAR files and Utility app DAR files" — so it may NOT
  yet submit our **custom** deal choices (Close/SealedBid/LPElection). Spike this: it can
  likely READ our token-standard `Holding`/`Allocation` (interface queries) + do wallet/token
  transfers, but custom-choice submission may need Seaport's UI or the raw JSON Ledger API.
- **id-sdk** (`github.com/fivenorth-io/id-sdk`) — 5N identity/credential SDK; maps to our
  `EligibilityCredential` / KYC flywheel (reusable QP credential across deals).

## Hackathon target + HARD REQUIREMENTS (from the Encode programme page — verified)

Encode **"Build on Canton"** (also targeting HackCanton/NODERS on one codebase). Our project
**"Continuum"** is already registered (team of 2, tracks **1 Private DeFi & Capital Markets**
+ **2 TradeFi/RWA & Tokenized Assets** — track 1 is the bullseye).

- ⏰ **DEADLINE: Monday 13 July 2026, 12:59 BST. No extensions.** (This prompt is being
  written ~10 July — roughly **3 days left**. Scope must be brutal.)
- 🏆 **Prize pool $7,000**, top-3 teams across all tracks.
- ⚠️ **MANDATORY: contracts deployed and RUNNING ON-LEDGER on Canton DEVNET.** LocalNet, local
  sandbox, or a **Seaport-only mock-up DO NOT QUALIFY** — "use Seaport to build, then deploy to
  the Devnet validator and confirm your contracts run on-ledger."
- **Submission checklist**: (1) public repo, (2) presentation deck, (3) **3-minute video pitch
  w/ demo**, (4) **link to a live product**, (5) **deployed live on Canton Devnet**.
- **Judging criteria**: technical execution (works? clean, documented code?), originality/
  creativity, **UX & design (could a real user use it? clear interface?)**, real-world
  applicability (genuine problem, would someone use it?).
- 📎 **There is an official PDF in the Encode Discord (#general and #resources)**: "all major
  info for using validator-deployed contracts on your frontend" + links (Seaport
  `devnet.seaport.to`, a helpful video). **GET THAT PDF FIRST** — it is the authoritative guide
  for wiring a frontend to the devnet-deployed contracts and likely answers most of our spikes.

Continuum's edge vs the criteria: real on-ledger atomic settlement, privacy (sealed bids /
private elections), token issuance, and the ILPA governance story — a credible institutional
capital-markets use case (track 1). The gap is purely **devnet deploy + a live product UI**.

## DEVNET WIRING — RESOLVED (from the official "Seaport Sandbox Validator Access" PDF)

The team has access to a **shared 5North devnet validator with a real, reachable Canton
JSON Ledger API v2** — so an external frontend can talk to the ledger directly (NO Java
backend required). This de-risks architecture (B).
- **Ledger REST**: `https://ledger-api.validator.devnet.sandbox.fivenorth.io/` (standard
  Canton JSON Ledger API v2 — e.g. `GET /v2/state/ledger-end`, `/v2/state/active-contracts`,
  `POST /v2/commands/...`). **WebSocket**: `wss://ledger-api.validator.devnet.sandbox.fivenorth.io`
  (subprotocols `jwt.token.<token>` + `daml.ws.auth`).
- **Auth = OIDC client_credentials (M2M)**: POST to `https://auth.sandbox.fivenorth.io/application/o/token/`
  with `grant_type=client_credentials`, `client_id=validator-devnet-m2m`, the shared
  `client_secret` (in the PDF), `audience=validator-devnet-m2m`, `scope=daml_ledger_api` →
  a **JWT that expires every 8h** (build refresh). Pass as `Authorization: Bearer <token>`.
- ⚠️ **SECURITY**: the client secret is a **shared plaintext credential** and the submission
  repo must be **PUBLIC** — so keep the secret OUT of git (env var / server-side proxy /
  gitignored `.env`). A pure-browser app would expose it; consider a tiny token-exchange proxy
  or inject at build time for the demo, and note the production answer is per-user wallet auth.
- **Deploy path**: build the DAR in Seaport → upload/deploy to the provided validator (Seaport
  UI). The `Jatinp26/Seaport-Guide` repo is the **11-step UI walkthrough** (wallet → auth →
  project → build DAR → deploy → instantiate → exercise choices); helpful video
  `youtu.be/uFi9meqpr3c`. Guide also references **`@c7/ledger` TS SDK + codegen-js bindings**
  for programmatic ledger access.
- **Party model**: you get **Party IDs from a Loop wallet** (devnet); parties are allocated on
  the validator (Seaport party-management / ledger API). One M2M app credential can **act-as**
  our hosted parties — so our ~15-party topology likely works on this single validator.

Net: the two hardest unknowns (devnet access + a reachable ledger API for a custom frontend)
are BOTH solved. Remaining real work is deploy-the-DAR + build-the-thin-frontend.

## Research already done — Canton's frontend/deploy options (from ../cf-docs)

- **cn-quickstart** (github.com/digital-asset/cn-quickstart) — DA's full-stack reference:
  Daml + **Java Spring Boot backend** + **React + TypeScript + Vite frontend** + **LocalNet**
  (Docker Compose) + OAuth2 auth + PQS reads + Splice wallet for Canton Coin. Ships a
  "Licensing" workflow (its `LicenseRenewalRequest` is the canonical `AllocationRequest`
  interface example). Doc: `cf-docs/docs-main/sdks-tools/reference-projects/cn-quickstart.mdx`.
- **Two architectures** (doc: `appdev/modules/m4-frontend-dev.mdx`, `m4-sdks-apis`):
  1. **Fully mediated** (cn-quickstart default): frontend → typed REST (OpenAPI /
     `openapi-client-axios`) → Java backend → Ledger API. Backend owns party/contract IDs,
     command submission, auth, PQS. Frontend never touches the ledger.
  2. **Direct ledger access**: React → **JSON Ledger API** using **`dpm codegen-js`** TS
     bindings generated from our DAR. No Java backend; frontend handles party/contract IDs +
     command submission itself.
- **Wallet SDK v1.3.x** (`sdks-tools/sdks/wallet-sdk.mdx`) — supports Canton 3.5.X / Splice
  0.6.X; namespaces incl. `users/keys/ledger/party` (auto) + `amulet/token/asset/events`
  (via `.extend()`) — verify exact set; `prepare→sign→execute` lifecycle; browser/dApp/remote
  transports. For wallet connect + token/amulet ops.
- **JSON API** reference: `sdks-tools/api-reference/json-api`. **LocalNet**:
  `sdks-tools/development-tools/localnet`.
- **DevNet version pins** (hard facts): Canton/damlSdk **3.5.7**, splice **0.6.11**, min
  protocol **v6**. Our contracts are **LF 2.1 / SDK 3.4.11**. There is **no published
  Canton↔SDK compat matrix** for a 3.4.11 DAR on a 3.5.x participant — but our e2e already
  ran on a **3.5.6 sandbox**, so the skew is probably fine (confirm on LocalNet 3.5 early).

## Key decisions to explore (the heart of the brainstorm)

1. **Architecture — under a ~3-day clock, and Seaport-deploy is MANDATORY but not sufficient**
   (submission needs BOTH on-ledger devnet contracts AND a separate live-product link):
   - **(A) Seaport-only**: build+deploy DARs to the devnet validator and drive the deal via
     Seaport's Smart-Choice-Exercise UI. **Satisfies the on-ledger requirement but NOT the
     "live product" one on its own** — insufficient as the whole submission.
   - **(B) Deploy via Seaport + thin custom React frontend** talking to the deployed contracts
     via **loop-sdk** (wallet connect + token reads/transfers) and/or the **JSON Ledger API +
     `dpm codegen-js`** bindings for our custom choices. **Most likely the right target** given
     the deadline: reuses our HTML/UX, gives the live-product link, keeps infra light. Risk:
     loop-sdk custom-DAR limitation + party/auth wiring.
   - **(C) Fork cn-quickstart** (Java backend + React + auth + PQS). Most robust, but a Java
     backend is **probably too heavy for 3 days** — likely out unless a teammate owns it.
   The brainstorm should pick the fastest path to "devnet-deployed contracts + a clickable live
   product" and treat (C) as a stretch only if time allows.
2. **Template reuse vs. rebuild**: can our multi-persona HTML be ported into cn-quickstart's
   React app, or is it faster to rebuild the 4 persona views in React against the generated
   bindings? What's genuinely reusable (copy/layout/flow) vs. throwaway?
3. **Wallet + token strategy**: use the real **Splice wallet + Canton Coin/amulet** for the
   cash leg (impressive, but integration cost + devnet amulet faucet), or keep our
   self-issued `RegistryHolding` USDC-mock and issue our own CV-unit + cash instruments (we
   already implement the token standard, so wallets/other apps can still read them)? What
   does "issue tokens" and "connect wallet" need to mean for a credible submission?
   (Known devnet facts: there IS a rate-limited `tap` faucet for free test Canton Coin, and
   self-featuring an app on devnet needs no CF approval.)
4. **Devnet deploy path — access is SOLVED via 5N Seaport; the decision is how to use it.**
   We already have an authorized hosted validator (upload-DAR + create-contract + a
   provisioned party). Open questions: does 5N Seaport let us **allocate our ~15 distinct
   parties** on its validator (multi-hosted parties), or is it one-party-per-account (then
   how do we model GP/LPs/buyers/LPAC)? Can our external React app **reach that validator's
   ledger/JSON API** (endpoint + auth/token), or is 5N Seaport only an in-browser IDE (then
   the app talks to a separate participant)? Does the GitHub-import path build our
   `continuum-daml` repo as-is? These gate whether 5N Seaport is just the deploy tool or also
   the runtime our frontend connects to.
5. **Multi-party topology on one node**: our design needs many distinct parties. Can they all
   live on one devnet participant (multi-hosted parties) for the demo, or do we need multiple
   validators? What's the cheapest topology that still shows privacy (sub-transaction
   visibility) convincingly?
6. **Scope triage / MVP for the ~3-day deadline** — the FLOOR must satisfy BOTH mandatory
   requirements (on-ledger devnet + live product link):
   - **Floor (must-have to qualify)**: our DARs **deployed + running on the Seaport DevNet
     validator (on-ledger, verifiable)** AND a **minimal live product** — even a thin React
     view that reads our deployed contracts and submits ONE flow (e.g. the deal-#1 close or a
     sealed bid) — plus the repo, deck, and 3-min video. Seaport-UI alone is NOT enough.
   - **Target**: the ported multi-persona React app driving the full deal (bids → elections →
     close → oversight) against the deployed contracts; loop-sdk wallet connect for the token
     side.
   - **Stretch**: real Splice/Canton-Coin cash leg + flywheel deal #2. Decide what's cut FIRST
     given the clock — don't gold-plate before the floor is green on devnet.
7. **Contracts-as-source-of-truth**: the Daml is done and tested; the app should wrap it, not
   fork its logic. Confirm the app only needs read models (PQS/JSON queries) + command
   submission for the existing choices (`SubmitBid`/`SealedBid`, `LPElection`, `SetClearing`,
   `OpenElections`, `Close`, `allocateFor`, credential issuance). Any missing choice/endpoint
   the UI implies that the contracts don't yet expose?

## Spikes to run early (day 1 — mostly deploy-validation now; wiring is answered by the PDF)

- **THE gating spike — deploy our DAR on the shared devnet validator**: build
  `continuum-contracts` (+scripts) in Seaport (or upload our existing DAR) and deploy to the
  provided validator; then hit `GET /v2/state/ledger-end` with a Bearer token to confirm it's
  live. This is the pass/fail for the whole submission — do it FIRST.
- **Version skew** (still open): our DAR is LF 2.1 / SDK 3.4.11; devnet is Canton 3.5.7 /
  splice 0.6.11. No published 3.4↔3.5 compat matrix. If the 3.4.11 DAR is rejected by the 3.5
  validator, rebuild the contracts on **SDK 3.5.x** (our Daml is standard; likely a clean
  bump). Confirm the pinned `splice-api-token-*-v1 0.6.11` DARs still resolve.
- **Command submission for custom choices**: confirm we can `POST /v2/commands/submit-and-wait`
  our deal choices (`SealedBid`, `Close`, …) via the JSON Ledger API with the M2M token +
  act-as our parties. (loop-sdk's custom-DAR limit doesn't bite here — we're using the raw
  ledger API, not loop-sdk, for custom choices; loop-sdk is optional for wallet/token UX.)
- **codegen-js × interfaces**: generate TS bindings from our DAR (or use `@c7/ledger`) and
  confirm interface choices are callable. Fallback: hand-write the JSON command payloads.
- **Party allocation**: allocate our ~15 parties on the validator (Seaport party-management /
  ledger API) and confirm one M2M token can act-as them.

## Constraints

- **Hard deadline: Mon 13 July 12:59 BST (~3 days out). No extensions.** Every scope call is
  dominated by this. Get the qualifying floor (on-ledger devnet + live product) green FIRST,
  then improve. Prefer the path with the least new infrastructure risk.
- **Grab the Encode Discord PDF ("using validator-deployed contracts on your frontend")
  before designing** — it likely answers the endpoint/auth/party spikes directly.
- Keep the tested Daml as the source of truth. Don't reinvent settlement logic in the app.
- Team of 2 — parallelize (one on devnet-deploy + contract wiring, one on the frontend).

## Deliverable from this brainstorm

A recommended architecture + a **phased plan** (LocalNet milestone → devnet milestone),
with the MVP slice explicitly scoped, the top 3 risks named with mitigations, and a
clear first task. Surface any decision you need from me before finalizing.
