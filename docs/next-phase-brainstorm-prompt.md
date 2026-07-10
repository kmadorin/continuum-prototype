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
  **tracks contract IDs/disclosures + full history**. Implication: a **minimal demo can run
  entirely inside Seaport** (deploy our DARs, drive the deal via its choice-exercise UI) with
  NO custom frontend — that's the safe MVP floor; the custom React app is polish/stretch. The
  workshop did NOT cover external frontends or wallet-connect — that's our own integration.
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

## Hackathon target

Two events (keep one codebase): **HackCanton (NODERS)** and **Encode "Build on Canton"**.
Submission credibility needs a **deployed, wallet-connected app on devnet** actually driving
the contracts — not a mock. Judges value: real on-ledger atomic settlement, privacy
(sealed bids / private elections), wallet + token issuance, and the ILPA governance story.

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

1. **Architecture — three real options** (weigh hackathon speed, demo polish, HTML reuse):
   - **(A) All-in-Seaport**: deploy our DARs to the pre-configured DevNet validator and drive
     the whole deal via Seaport's contract-create + Smart-Choice-Exercise UI. No frontend
     code. Safest MVP floor; least "product" polish.
   - **(B) Custom React → ledger** directly via **loop-sdk** (wallet connect + token reads +
     transfers) and/or the **JSON Ledger API + `dpm codegen-js`** bindings for our custom
     choices. Best story; carries the loop-sdk custom-DAR limitation + auth/party risk.
   - **(C) Fork cn-quickstart** (Java backend + React + auth + PQS), swap Licensing→Continuum
     Daml, deploy the DAR via Seaport. Most infra, most robust mediated path.
   Reuse of our bespoke HTML/UX is a cross-cutting factor for (B) and (C).
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
6. **Scope triage / MVP for the deadline** — three tiers:
   - **Floor**: DARs deployed to the Seaport DevNet validator, deal #1 close driven via
     Seaport's choice-exercise UI, oversight/LPAC view shown. Proves "real on-ledger atomic
     settlement on devnet" with zero frontend risk.
   - **Target**: custom React app (ported from our HTML) reading contracts + submitting the
     deal choices against the deployed contracts; wallet connect via loop-sdk for the
     token/cash side.
   - **Stretch**: real Splice/Canton-Coin cash leg + flywheel deal #2 + full multi-persona
     switching. Decide explicitly what's cut.
7. **Contracts-as-source-of-truth**: the Daml is done and tested; the app should wrap it, not
   fork its logic. Confirm the app only needs read models (PQS/JSON queries) + command
   submission for the existing choices (`SubmitBid`/`SealedBid`, `LPElection`, `SetClearing`,
   `OpenElections`, `Close`, `allocateFor`, credential issuance). Any missing choice/endpoint
   the UI implies that the contracts don't yet expose?

## Spikes to run early (not answerable from the docs — schedule as tasks)

- **Version skew**: our DAR is LF 2.1 / SDK 3.4.11; devnet is Canton 3.5.7 / splice 0.6.11.
  No published 3.4↔3.5 compat matrix. Confirm our `splice-api-token-*-v1` 0.6.11 DARs vet +
  run against a **3.5.x participant on LocalNet** first. (Our 3.5.6-sandbox e2e is encouraging
  evidence, not proof of DAR upload/vetting on a 3.5 participant.)
- **codegen-js × interfaces**: our `Registry` implements token interfaces. Docs don't cover
  codegen behavior for Daml interfaces — spike it: generate TS bindings from our DAR and
  confirm interface choices (e.g. `Allocation_ExecuteTransfer`) are callable. If not, the
  mediated Java backend is the fallback (de-risks decision #1).
- **Auth / multi-party demo**: how do we drive ~15 distinct parties from one browser for the
  demo (party switching, act-as, disclosure), and what token/JWT does the 5N Seaport
  validator's ledger API require?
- **5N Seaport capabilities spike (day 1)**: upload our `continuum-contracts` DAR via
  "Upload DAR to Validator", create a `RegistryAllocationFactory`/deal contract via "Deploy
  DAR & Create Contract", and confirm (a) our LF-2.1/3.4.11 DAR is accepted, (b) whether we
  can allocate multiple parties, (c) whether there's a reachable ledger/JSON API endpoint +
  auth for an external frontend, (d) whether Connect-GitHub builds our repo. This replaces
  the old "apply for a validator" risk.

## Constraints

- Hackathon deadline (short). Optimize for a **judge-clickable, credible, deployed** demo
  over completeness. Prefer the path with the least new infrastructure risk.
- Keep the tested Daml as the source of truth. Don't reinvent settlement logic in the app.
- Keep it one codebase serving both events.

## Deliverable from this brainstorm

A recommended architecture + a **phased plan** (LocalNet milestone → devnet milestone),
with the MVP slice explicitly scoped, the top 3 risks named with mitigations, and a
clear first task. Surface any decision you need from me before finalizing.
