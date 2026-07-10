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

1. **Architecture**: fork cn-quickstart (get backend+frontend+localnet+auth+wallet "for
   free", swap Licensing→Continuum Daml) vs. keep our bespoke prototype and bolt on the
   **JSON API + codegen-js + Wallet SDK** directly (no Java backend). Weigh hackathon speed,
   demo polish, and how much of our HTML/UX we can reuse.
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
4. **Devnet deploy path — treat access lead time as a first-class schedule risk.** Being an
   app provider on DevNet requires **applying for + running our OWN validator node** (apply
   form at canton.foundation), a **sponsoring Super Validator for VPN credentials**, and a
   **1-hour onboarding secret** — a multi-day, partly out-of-our-control process that may
   exceed the hackathon deadline. So the LocalNet-vs-devnet call must weigh that lead time up
   front, AND we should check whether **HackCanton/Encode provide a shared devnet validator
   or SV sponsor for teams**. Beyond access: party allocation for our ~15 parties, DAR
   vetting/upload, OAuth2/auth, app-provider identity.
5. **Multi-party topology on one node**: our design needs many distinct parties. Can they all
   live on one devnet participant (multi-hosted parties) for the demo, or do we need multiple
   validators? What's the cheapest topology that still shows privacy (sub-transaction
   visibility) convincingly?
6. **Scope triage / MVP for the deadline**: define the thinnest end-to-end slice that still
   wins — e.g. LocalNet + mediated backend + deal-#1 close + oversight view — vs. the
   stretch (real devnet + real wallet + flywheel deal #2). What's cut, what's kept.
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
- **Auth / multi-party demo**: does devnet require OAuth2/JWT per party, and how do we drive
  ~15 distinct parties from one browser for the demo (party switching, act-as, disclosure)?
- **Validator access**: kick off the devnet validator application / find a shared team
  validator on day 1 — its lead time gates everything downstream (see decision #4).

## Constraints

- Hackathon deadline (short). Optimize for a **judge-clickable, credible, deployed** demo
  over completeness. Prefer the path with the least new infrastructure risk.
- Keep the tested Daml as the source of truth. Don't reinvent settlement logic in the app.
- Keep it one codebase serving both events.

## Deliverable from this brainstorm

A recommended architecture + a **phased plan** (LocalNet milestone → devnet milestone),
with the MVP slice explicitly scoped, the top 3 risks named with mitigations, and a
clear first task. Surface any decision you need from me before finalizing.
