# Continuum — MVP Design Spec & User Story Map

**Date:** 2026-06-21
**Status:** Draft for review
**Scope:** The product MVP (the confidential closing room) — *not* the HackCanton business-doc deliverables (validation, GTM), which are tracked separately.
**Targets:** Encode "Build on Canton" (deadline Jul 12, 2026 — working product + clean repo + 3-min demo + live deploy) and HackCanton S2 / NODERS (journey + validation). One codebase serves both.

---

## 1. What we're building

**Continuum** is a confidential *closing room* for GP-led continuation deals. A continuation close goes from "terms agreed" to "settled" — privately and all-at-once — instead of through weeks of lawyers, spreadsheets, emails, and sequenced wires.

**One sentence:** LPs and buyers commit privately, the engine computes the close, and cash plus fund interests settle atomically on Canton — with the regulator able to verify, and no party able to see what it shouldn't.

**Why Canton (the load-bearing four, all native to one primitive set):**
1. Per-party privacy — no LP sees another's roll/exit election; no buyer sees another's price.
2. Atomic multilateral settlement — every leg closes together or none do (no partial-close catastrophe).
3. Selective disclosure — regulator/LPAC get a scoped, post-close, need-to-know window.
4. Multi-party workflow across separately-controlled organizations — no shared database anyone owns.

---

## 2. Architecture model

### 2.1 Participant vs Party

- **Participant (node)** = a server an organization runs to plug into Canton. Stores ledger data, signs/validates transactions. Infrastructure.
- **Party** = an on-ledger identity (a legal actor) hosted on a participant. The node acts on its behalf.
- Email analogy: participant = mail server; party = email address; one server hosts many addresses.
- **The trust/privacy boundary is the participant operator.** Cryptographic privacy *between parties* holds regardless of co-location; but "no single operator sees everyone's data" only holds when orgs run separate participants.

**Production topology:** one participant per organization (GP/Advisor, each LP, Buyer, Regulator), all connected to one Synchronizer. This is the authentic Canton "network of networks" story.

**Hackathon topology (DECIDED):** **one participant node hosting many parties.** Sufficient to demonstrate per-party sub-transaction privacy (projection). Caveat acknowledged: this does *not* prove operator-level separation. We present multi-participant as the production hardening step (mapped as R2). Rationale: fastest path through the hardest plumbing (`ExtraArgs`/disclosed contracts); avoids multi-tenant onboarding complexity within the 3-week window.

### 2.2 Personas & roles

| Persona | On-ledger party | Also plays |
|---|---|---|
| GP / Advisor | `GP` | Settlement **executor** (the venue) + fund-unit **registry** (new vehicle) |
| Rolling LP | `RollingLP` | receives new units |
| Exiting LP | `ExitingLP` | receives cash |
| Secondary Buyer | `Buyer` | pays cash, receives units |
| Regulator / LPAC | `Regulator` | post-close observer |
| *(background)* KYC Issuer | `Issuer` | stamps `EligibilityCredential` (Advisor/LPAC in MVP) |
| *(background)* Cash Registry | USDCx admin | issues the cash instrument |
| *(background)* Unit Registry | = GP/vehicle | issues fund-unit instrument |

### 2.3 Instruments (the assets that move)

| Leg | Instrument | MVP implementation | Production |
|---|---|---|---|
| **Cash** | USD stablecoin | Author a **mock USD stablecoin** implementing Token Standard v1, label "USDC", mint freely to LPs/Buyer | **Circle USDCx** (live on Canton, CIP-56, privacy-preserving) — drop-in: point `InstrumentId.admin` at Circle |
| **Units** | Fund-interest units in the new continuation vehicle | Custom CIP-56 instrument, admin = vehicle/GP; pre-mint a treasury, transfer at settlement | same |
| **Asset** | Old fund's portfolio interest | Custom CIP-56 instrument owned by old fund | same / tokenized real asset |

**Cash-leg note:** Canton Coin (Amulet) is the network's utility/gas token, **not** cash — wrong leg semantically. Cash settles in a **CIP-56 stablecoin (USDCx)**. Because both mock and real USDCx are CIP-56 `Holding`s, the allocation/settlement code is identical. (Canton Coin network fees are forced to zero, so personas need no CC for gas.)

### 2.4 Canton primitives glossary (the ones our users touch)

**Infra:** Participant (org's node) · Synchronizer (sealed post-office; orders/confirms but can't read contents) · Party (actor) · User (login → party).
**Contracts:** Template (blueprint) · Contract (live instance) · Signatory (must sign to create; bound) · Observer (can read; not bound) · Choice (a button) · Controller (who may press it) · Propose/Accept (handshake to create a multi-signatory contract).
**Privacy/settlement:** Sub-transaction privacy / projection (each party gets only its slice) · Atomic transaction (all-or-nothing).
**Token Standard v1 (CIP-0056):** Instrument (`{admin, id}`) · Registry/instrument admin (mint) · Holding (a balance/UTXO) · Allocation (escrow for one leg) · `AllocationFactory_Allocate` (lock holdings) · `Allocation_ExecuteTransfer` (settle all legs; controllers = executor+sender+receiver) · Executor (closing agent) · Disclosed contracts / `ExtraArgs` (supporting paperwork for validation).
**Our custom primitive:** `EligibilityCredential` (issuer-signed reusable "verified investor" badge — no built-in KYC on Canton).

### 2.5 Settlement flow (the one atomic close)

Minimal walking-skeleton deal = 4 transfer legs, settled atomically:
1. Buyer USDC → Exiting LP (cash)
2. Vehicle units → Rolling LP (roll)
3. Vehicle units → Buyer (units for cash)
4. Old fund asset → Vehicle (asset transfer)

Mechanics: each sender runs `AllocationFactory_Allocate` (locks holdings into an `Allocation` per leg) → **executor (GP/Advisor)** fires one `Allocation_ExecuteTransfer` across all legs → all-or-nothing. Projection ensures each party sees only its own legs.

### 2.6 Tech stack & key decisions

- **Ledger:** Canton 3.5.x / Daml SDK 3.4.11 / JDK 21. Token Standard **v1** (v2 is roadmap — narrative only; not buildable in time).
- **Build track (TBD — next decision):** cn-quickstart + Splice LocalNet (Docker, full control) **vs** C-Port / Seaport hosted devnet IDE + Loop wallet (browser, light, used in the official Jatin workshop). Leaning toward evaluating C-Port to sidestep Docker blockers.
- **UI:** **Path B** — each persona tab hits the **JSON Ledger API v2 directly** with its own per-party JWT (shared-secret/unsafe mode). `openapi-fetch` client generated from the v2 OpenAPI spec. WS streaming auth via `["daml.ws.auth","jwt.token.<JWT>"]` subprotocol. **No `@daml/react`** on 3.x. Each persona in a **separate browser profile** (avoid session-cookie collisions).
- **Seed:** party allocation + instrument setup + holdings minting + credential issuance as a **re-runnable Daml Script** (mid-demo crash → recover in seconds).

### 2.7 Top blockers (ranked)

1. `ExtraArgs`/disclosed-contracts plumbing — week-1 spike: ONE allocate→execute leg end-to-end before scaling to 5. Crib `TestCnTokenDvP.daml`.
2. Multi-tab session collision — Path B + separate browser profiles.
3. Docker RAM (8GB min; disable observability; avoid Docker Desktop 4.38.0) — or avoid via C-Port.
4. Balance/Scan latency (~1hr rounds) — TAP/mint instant; never demo against Scan.
5. In-memory state lost on restart — re-runnable seed script.
6. Party-id fingerprints change on reset — never hardcode; read from seed output.
7. Same-synchronizer constraint — all parties/legs on one synchronizer.
8. Version pinning — 3.5.x / 3.4.11 / JDK 21.

---

## 3. User Story Map (Jeff Patton)

**Backbone framing: A — deal-lifecycle phases**, with persona tags inside each phase and a leading Onboarding activity. The atomic-settle phase stays one column to preserve the "everything moves at once" demo beat.

Release slices:
- **R1 = Walking Skeleton** — thinnest thread through the *entire* backbone: one deal closes end-to-end with all 5 parties + a thin deal-#2 flywheel click. This is the Encode demo.
- **R2 = Realism & Robustness** — what makes the claims literally true and the demo resilient.
- **R3 = Platform Vision** — the network/utility story; mostly narrative for the pitch.

Stories tagged `[R1]` / `[R2]` / `[R3]`. Stories below the R1 line are still built for R1 but seeded/scaffolded rather than clicked live, marked `[R1·seed]`.

### Backbone (left → right narrative)

`0. Onboard & Set Up → 1. Create Closing Room → 2. Elect → 3. Commit → 4. Compute Close → 5. Approve Own Legs → 6. Atomic Settle → 7. Disclose to Regulator → 8. Flywheel (Deal #2)`

---

### 0. Onboard & Set Up

- `[R1·seed]` As the **operator**, I allocate all parties on one participant via a re-runnable Daml Script, so the demo is reproducible.
- `[R1·seed]` As the **Cash Registry**, I define a CIP-56 USD stablecoin instrument and mint starting balances to LPs/Buyer, so they can fund legs.
- `[R1·seed]` As the **Unit Registry (vehicle)**, I define the fund-unit instrument and pre-mint a treasury, so units can be issued at close.
- `[R1·seed]` As the **old fund**, I hold a CIP-56 asset instrument representing the portfolio interest, so it can transfer to the vehicle.
- `[R1]` As the **KYC Issuer**, I issue an `EligibilityCredential` to the Buyer (signatory=issuer, observer=Buyer), so the Buyer can prove eligibility without re-onboarding.
- `[R2]` As the **Buyer**, I log in and view my own credential + balances in a wallet-style view.
- `[R2]` As any **org**, I run my own participant (multi-participant topology) so no operator sees others' data.
- `[R3]` As a **Buyer**, my credential is portable across advisors/venues (reusable-participant network).

### 1. Create Closing Room

- `[R1]` As the **GP/Advisor**, I create a `ContinuationDeal` with terms (old fund, vehicle, asset, election deadline, buyer rules) and a party roster, so the close has a single source of truth.
- `[R1]` As the **GP/Advisor**, I add invited LPs and the Buyer as observers of the deal shell, so they can see the room but not each other's later private inputs.
- `[R2]` As the **GP/Advisor**, I set and enforce an election deadline, so the close can't proceed prematurely.
- `[R2]` As the **GP/Advisor**, I invite multiple LPs and multiple buyers, so the close reflects a real syndicate.
- `[R3]` As the **GP/Advisor**, I clone a prior deal template, so repeat closes start in one click.

### 2. Elect (LPs)

- `[R1]` As a **Rolling LP**, I submit a sealed `LPElection` (roll + amount), signatory me alone, so no other LP or the operator sees my choice.
- `[R1]` As an **Exiting LP**, I submit a sealed `LPElection` (exit + amount), so I get cash without revealing my decision to peers.
- `[R1]` As the **GP/Advisor**, I see *that* an election is in (a non-revealing signal), not its contents, so I can track readiness without leaking.
- `[R2]` As an **LP**, I can submit a split election (part roll / part exit).
- `[R2]` As an **LP**, I can amend/withdraw my election before the deadline.

### 3. Commit (Buyers)

- `[R1]` As the **Secondary Buyer**, I submit a sealed `BuyerCommitment` (amount + price) referencing my `EligibilityCredential`, so my price is hidden from exiting LPs until close.
- `[R1]` As the **GP/Advisor**, I see *that* a commitment is in, not the price, so the book stays confidential.
- `[R2]` As a **Buyer**, my commitment is rejected if my credential is missing/expired, so only eligible buyers participate.
- `[R2]` As multiple **Buyers**, we each commit blind to one another (competitive book).

### 4. Compute Close

- `[R1]` As the **GP/Advisor (executor)**, I compute the closing allocation from the sealed inputs (who gets cash, who gets units, asset→vehicle) via a choice that reads disclosed inputs, so the book resolves into concrete legs.
- `[R1]` As the **engine**, I assemble the transfer legs and authorization requirements, so each party will approve only its own obligation.
- `[R2]` As the **GP/Advisor**, I run pro-rata allocation across multiple LPs/buyers and oversubscription rules.
- `[R2]` As the **GP/Advisor**, I preview the computed close before triggering settlement.

### 5. Approve Own Legs (Allocate)

- `[R1]` As the **Buyer**, I `AllocationFactory_Allocate` my USDC into a locked allocation for the cash leg, so my funds are escrowed for this close only.
- `[R1]` As the **Unit Registry (vehicle)**, I allocate units for rolling LP + buyer, so issuance is ready.
- `[R1]` As the **old fund**, I allocate the asset to the vehicle, so the asset leg is ready.
- `[R1]` As each **receiving party**, my approval/take-delivery is captured, so the leg is fully authorized.
- `[R2]` As any **party**, I can cancel/withdraw my allocation before settlement (`Allocation_Cancel`/`Withdraw`), so I'm not locked indefinitely.

### 6. Atomic Settle

- `[R1]` As the **GP/Advisor (executor)**, I fire one `Allocation_ExecuteTransfer` across all legs, so cash→Exiting LP, units→Rolling LP + Buyer, asset→Vehicle happen all-or-nothing.
- `[R1]` As each **party**, my UI updates from the single settlement, showing only my own legs, so the privacy + atomicity is visible live.
- `[R2]` As the **operator**, I can demonstrate a forced leg failure → nothing moves, proving atomicity (the partial-close catastrophe averted).
- `[R3]` As the **platform**, settlement uses Token Standard **v2** (per-leg batch privacy + one-click), so even the executor sees only metadata.

### 7. Disclose to Regulator

- `[R1]` As the **GP/Advisor**, I add the Regulator/LPAC as an observer to the settled result, so they get a scoped, post-close, need-to-know window.
- `[R1]` As the **Regulator/LPAC**, I verify the close followed the rules without seeing live private inputs, so fairness is provable.
- `[R2]` As the **Regulator**, I see a structured fairness report (process attestations), not raw payloads.
- `[R3]` As the **Regulator**, my window is granted via selective disclosure across participants (real org separation).

### 8. Flywheel (Deal #2)

- `[R1·thin]` As a **new GP**, I create a second `ContinuationDeal`, so we show repeatability.
- `[R1·thin]` As the **returning Buyer**, I reuse my existing `EligibilityCredential` and commit in one click — no re-onboarding — so the network effect is visible live.
- `[R3]` As the **Buyer**, I bid into many deals across many advisors with the same credential, so onboarding cost approaches zero (reuse the participant, never the capital).
- `[R3]` As the **platform**, the same engine extends to tenders, buybacks, fund-finance drawdowns.

---

## 4. The Walking Skeleton (R1) — the demo thread

The thinnest end-to-end thread, ~3 minutes, 5 browser tabs (one profile per persona):

1. **Setup (seeded):** 5 parties, instruments, balances, Buyer credential — all from one Daml Script.
2. **Create room:** GP creates the deal; LPs + Buyer see the shell.
3. **Sealed elections:** Rolling LP rolls, Exiting LP exits — cut between panes, neither sees the other's.
4. **Blind commitment:** Buyer commits a price; Exiting LP's pane shows it redacted.
5. **Compute + allocate:** GP computes the close; each party locks its leg.
6. **Atomic close:** GP fires one settlement → cash→Exiting LP, units→Rolling LP + Buyer, asset→Vehicle; every pane updates from one transaction.
7. **Regulator window:** Regulator pane gains a scoped post-close verification view.
8. **Flywheel:** Deal #2 — Buyer reuses credential, commits in one click.

**Wow line:** *"Every leg settled together, no LP saw another's hand, the cash was a real stablecoin, and the regulator can verify — all in one private, atomic transaction."*

---

## 5. Open questions / deferred decisions

1. **Build track:** C-Port hosted devnet vs cn-quickstart LocalNet — needs a focused evaluation (incl. test-USDCx availability on devnet). *Recommended next subagent.*
2. **Compute-close locus:** fully on-ledger choice vs off-ledger compute + on-ledger settle — depends on how much we disclose to the executor. R1 can compute off-ledger and settle on-ledger; revisit for v2 privacy.
3. **"Election in" signal:** how the GP learns an election exists without seeing content (separate signal contract vs hashed commitment). MVP: a minimal non-revealing flag.
4. **Asset-leg realism:** abstract "portfolio interest" token vs something richer. MVP: abstract CIP-56 instrument.
