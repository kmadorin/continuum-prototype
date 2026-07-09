# Continuum — On-Chain Architecture & Daml Contract Spec (R1)

> The dedicated Daml/Canton spec that `2026-06-21-continuum-story-map-design.md` §5/§7 flagged as TBD.
> Scope: the on-ledger design that runs on Canton **devnet** and is driven by the per-role portal via the JSON Ledger API v2.
> Method: architecture by the executor (Opus), domain economics validated by a Fable continuation-fund/tokenization advisor, grounded on the local `cf-docs` Canton docs + ILPA guidance.

> **⚠️ SUPERSEDED** by `docs/superpowers/specs/2026-07-09-continuum-onchain-spec.md` — the single authoritative, freshly-grounded spec (folds in this architecture, the 5 review must-fixes, and the new valuation/document hash-anchoring layer). Kept for history / deeper template notes only.

---

## 0. Decisions locked for R1

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | Token model | **Real Canton Network Token Standard (CIP-0056 / Splice `splice-api-token-*`)** | Cash, CV units, and Atlas asset are all CIP-56 `Holding`s; settlement runs through the `Allocation` DvP flow; requires registry/factory + disclosed-contracts plumbing. |
| D2 | Auction | **On-ledger sealed bids** | Each buyer's bid is a Daml contract they alone sign → blind to competitors by the stakeholder model. |
| D3 | Topology | **One participant, many parties** (from the design spec) | Proves per-party projection privacy; multi-participant is the R2 production hardening. |
| D4 | Cash leg | **Mock CIP-56 USD stablecoin labelled "USDC"** (not Canton Coin) | Drop-in swap to Circle USDCx in production; CC/Amulet is gas only. |
| D5 | Roll pricing | **Rolling LPs roll at the deal price (96%)**, not at par | Canonical ILPA structure; keeps every close invariant tying out. **Fixes the prototype's par-roll math.** |
| D6 | Close computation | Elections/bids **explicitly disclosed to the executor at the clearing step only** | GP is blind to individual sealed contents during the window, sees them transiently at compute — matches the visibility table. |

---

## 1. Party & observer model

### 1.1 Parties (all hosted on the one hackathon participant)

| Party | Legal actor | On-ledger duties | Notes |
|---|---|---|---|
| `GP` | GP / Advisor (Whitfield) | Deal author; auction runner; **settlement executor**; CV-unit **registry/admin**; old-fund operator | Plays several hats — split into distinct parties only in R2 multi-participant. |
| `RollingLP` (×N) | Staying investor (Hawthorn) | Files election; receives CV units | Peer-private from other LPs. |
| `ExitingLP` (×N) | Leaving investor (Calder) | Files election; receives cash | Default election = sell. |
| `Buyer` (×M) | Secondary buyer (Northbeam + syndicate) | Files sealed bid; pays USDC; receives CV units | Blind to other buyers. |
| `Regulator` | LPAC / oversight | Pre-close **consent gate**; post-close scoped fairness view | Signatory of the consent; observer of the disclosure only. |
| `Issuer` | KYC issuer | Signs `EligibilityCredential` | GP/LPAC plays this in MVP. |
| `CashRegistry` | USDC admin | Mints the mock stablecoin | `InstrumentId.admin` for cash. |
| `Vehicle` | Continuation vehicle (= GP hat) | CV-unit `InstrumentId.admin`; holds the pre-minted unit treasury | Distinct `InstrumentId`, same participant. |

> **Registry/admin parties** (`CashRegistry`, `Vehicle`, old-fund) are the Token-Standard instrument admins. In MVP they can be the same key as `GP`; they are logically separate so the production swap (e.g. cash admin → Circle) is a one-line change to `InstrumentId.admin`.

### 1.2 Observer discipline (the privacy contract)

- **Sealed contents** (`SealedBid`, `LPElection`) have **no observers** → only the author is a stakeholder → invisible to peers *and* to the GP until explicitly disclosed at the clearing/close step.
- **Markers** (`BidFiled`, `ElectionFiled`) carry the GP as observer but **no economic content** → the GP learns *that* a bid/election is in, not *what*.
- **Room-public facts** (reference NAV, fairness range, clearing price once set) live on `ContinuationDeal` with the full roster as observers.
- **Post-close disclosure** adds `Regulator` as observer to a *scoped* result contract only — never to the raw sealed contracts.

---

## 2. Instrument model (Token Standard, CIP-56)

Three CIP-56 instruments + one non-token position. Each token instrument is a set of `Holding` UTXOs with an `InstrumentId {admin, id}`, transferred via `TransferFactory` and settled via `Allocation`.

| Instrument | `InstrumentId` | Admin | Divisible | Purpose |
|---|---|---|---|---|
| **Mock USDC** | `{CashRegistry, "USDC"}` | `CashRegistry` | yes | Cash leg. Minted freely to Buyers (and to Exiting LPs at start = 0). |
| **CV units** | `{Vehicle, "MERIDIAN-CV-I"}` | `Vehicle` | yes | Fund LP interest, **NAV/unit = $1.00**. Pre-minted treasury held by `Vehicle`, transferred at settlement. Carries a `class` in `meta`: `StatusQuo` \| `NewTerms` \| `Buyer`. |
| **Atlas asset** | `{GP, "PROJECT-ATLAS"}` | old-fund (`GP` hat) | **no (indivisible)** | The portfolio interest. One `Holding` of amount = 1 (or refNAV), `meta = {refNAV: 52.0M, transferPrice: 49.92M}`. Moves old-fund → `Vehicle`. |

**Non-token position:**

| Template | Signatory | Observer | Purpose |
|---|---|---|---|
| `OldFundInterest` | old-fund (`GP`) | the LP | Each LP's stake in the winding-down old fund. **Archived (burned) inside the atomic close** against cash (exiting) or CV units (rolling). Makes value conservation visible; not tradeable so not a token. |

**Why CV units are unitised at $1.00, not denominated in dollars:** lets NAV/unit drift post-close without re-denominating holdings; ownership fraction = `units / 49,920,000`. (Fable ruling §5.)

---

## 3. The minimal contract set

Ten custom templates + the Token-Standard interfaces. For each: **S** = signatory, **O** = observers, choices with their **controller**.

### 3.1 Onboarding

**`EligibilityCredential`** — reusable verified-investor badge (no native KYC on Canton).
- **S:** `Issuer` · **O:** `Buyer` (holder)
- Choices: `Revoke` (Issuer).
- Used by **explicit disclosure** when a buyer bids (fetched read-only into the bid transaction). Reused across deals → the **flywheel**.

### 3.2 Deal setup — the root state machine

**`ContinuationDeal`** — root contract; carries public deal facts and drives the stage machine.
- **S:** `GP` (+ `Vehicle`) · **O:** all `RollingLP`/`ExitingLP`/`Buyer` (the room); `Regulator` added post-close.
- Fields: `fund`, `cv`, `asset`, `refNav (52.0M)`, `fairLow/fairHigh`, `fairnessProvider`, `electionDeadline`, `roster`, `clearingPrice : Optional`, `stage`.
- Choices (each advances the stage; controller in brackets):
  - `SubmitBid` *(nonconsuming; Buyer)* → creates a `SealedBid` + `BidFiled` marker. Asserts a valid `EligibilityCredential` (disclosed).
  - `SelectLead` *(GP)* → consumes qualifying bids (disclosed to GP here), sets `clearingPrice` = lead bid, records the syndicate order. Gated on `stage = bidding` past bid deadline.
  - `OpenElections` *(GP)* → gated on a granted `LPACConsent`; moves to `elections`.
  - `Close` *(GP as executor)* → the clearing + settlement choice (see §3.6).

### 3.3 Auction (sealed, on-ledger)

**`SealedBid`** — a buyer's blind bid.
- **S:** `Buyer` (sole) · **O:** *none* → invisible to other buyers and to GP.
- Fields: `dealId`, `pctOfNav`, `capacity`, `ts`.
- Choices: `Withdraw` (Buyer) before deadline.
- **Reveal:** at `SelectLead`, each bid is **explicitly disclosed** to the GP (disclosed-contracts) so the GP compares and picks the lead. Buyers stay blind to each other throughout.

**`BidFiled`** — contentless marker.
- **S:** `Buyer` · **O:** `GP` → GP sees *that* a buyer bid, not the number.

> **Variant (R2):** commit–reveal (hash commit then reveal) if you want the GP itself blind until the deadline. R1 keeps GP-blind-until-`SelectLead` via disclosure timing.

### 3.4 Consent gate (LPAC)

**`LPACConsent`** — the pre-close conflict-waiver gate (ILPA ≥10 business days).
- Created via propose–accept: `GP` proposes `LPACConsentRequest` (**S:** GP, **O:** Regulator); `Regulator` exercises `Grant` → `LPACConsent` (**S:** Regulator, **O:** GP).
- Fields: `granted`, `recusals : [Party]`, `reviewOpenedAt`, `ts`.
- **Gates `OpenElections`** — elections cannot open, and `Close` cannot run, without a granted consent. Encodes the paper's hard gate on-ledger.

### 3.5 Elections (sealed, peer-private)

**`LPElection`** — an LP's private roll/sell decision at the set price.
- **S:** `LP` (sole) · **O:** *none* → peer-private by construction; no other LP and not the GP is a stakeholder.
- Fields: `dealId`, `choice : Roll | StatusQuo | Sell | Split {rollNav, sellNav}`, `ts`.
- Choices: `Amend` (LP) before deadline. **Default:** an LP with no `LPElection` at deadline is treated as **Sell** (never forced to roll).

**`ElectionFiled`** — contentless marker.
- **S:** `LP` · **O:** `GP` → GP sees a filing exists, not its content.

At `Close`, elections are **explicitly disclosed to the GP** (executor) *only within the clearing transaction* to size the allocation. Matches the visibility table: GP sees "signal only, then the allocation."

### 3.6 Clearing + settlement (Token Standard DvP)

`Close` (choice on `ContinuationDeal`, controller `GP` as **executor**) does, in one atomic Daml transaction:

1. **Clear:** read the disclosed `LPElection`s at `clearingPrice`; compute roll/sell aggregates, syndicate fill, pro-rata scaling (**buyers only**); assert the §4 invariants.
2. **Request allocations:** create one `TransferLegRequest` per leg (below).
3. **Execute:** exercise `Allocation_ExecuteTransfer` on every allocated leg **+** archive the `OldFundInterest`s — all-or-nothing.
4. **Emit:** a `SettlementReceipt` (room observers) and a scoped `FairnessDisclosure` (Regulator observer).

**`TransferLegRequest`** — *our app template that implements the Token-Standard `AllocationRequest` interface* (`splice-api-token-allocation-request-v1`). This is the documented extension point: wallets detect contracts implementing `AllocationRequest` and prompt the sender to allocate.
- **S:** `GP` (executor) · **O:** the leg's sender + receiver.
- `AllocationRequestView { settlement : SettlementInfo, transferLegs, meta }`.
- Each **sender** runs `AllocationFactory_Allocate` (from the registry factory, with disclosed contracts) → an `Allocation` locking their `Holding`s for that leg.
- The **executor** (`GP`) fires `Allocation_ExecuteTransfer` across all legs in the `Close` body.

**`SettlementReceipt`** — **S:** GP · **O:** room. Post-close proof; each party projects only its own legs.
**`FairnessDisclosure`** — **S:** GP · **O:** Regulator. The scoped post-close window (bids range, clearing, allocation summary, fairness ref) — the only place the Regulator becomes an observer.

### 3.7 Contract-set summary

| # | Template | Signatory | Observers | Lifecycle step |
|---|---|---|---|---|
| 1 | `EligibilityCredential` | Issuer | Buyer | 0 / 2 |
| 2 | `ContinuationDeal` | GP (+Vehicle) | room; Regulator post-close | 1–6 |
| 3 | `SealedBid` | Buyer | — | 2 |
| 4 | `BidFiled` | Buyer | GP | 2 |
| 5 | `LPACConsent` (+ `…Request`) | Regulator / GP | GP / Regulator | 2.5 gate |
| 6 | `LPElection` | LP | — | 3 |
| 7 | `ElectionFiled` | LP | GP | 3 |
| 8 | `OldFundInterest` | old-fund (GP) | LP | burned at 6 |
| 9 | `TransferLegRequest` *(impl `AllocationRequest`)* | GP | leg sender+receiver | 5 |
| 10 | `SettlementReceipt` / `FairnessDisclosure` | GP | room / Regulator | 6 / 7 |
| — | Token Standard `Holding`/`TransferFactory`/`Allocation` | per interface | per interface | 5–6 |

---

## 4. Settlement legs & economics (Fable-validated, clearing = 96%)

Reference: NAV in scope $52.0M · roll $31.6M · sell $20.4M · **roll at deal price**.

### 4.1 Faithful flow (6 legs — the R2 target)
1. Buyers → CV: cash subscription **$19.584M** (0.96 × 20.4).
2. Rolling LPs → CV: netted in-kind contribution **$30.336M** (no cash moves; the LP directs its distribution into the CV).
3. CV → old fund: asset purchase price **$49.92M** ($19.584M cash + $30.336M netted).
4. Old fund → CV: **Project Atlas** transfers.
5. Old fund → Exiting LPs: liquidating cash distribution **$19.584M**.
6. CV → Rolling LPs / Buyers: mint **30,336,000** + **19,584,000** = **49,920,000** units.

### 4.2 R1 demo (4 legs — collapsed, declared simplification)
Net payer/payee/amounts are identical; only the old-fund waterfall hop is collapsed.

| Leg | Sender → Receiver | Instrument | Amount |
|---|---|---|---|
| a | Buyer → Exiting LP | USDC | **$19.584M** |
| b | Vehicle → Rolling LP | CV units | **30,336,000** units |
| c | Vehicle → Buyer | CV units | **19,584,000** units |
| d | old-fund → Vehicle | Atlas asset | 1 (refNAV 52.0M / price 49.92M) |
| + | burn `OldFundInterest` (all LPs) | — | atomically archived |

### 4.3 Invariants the `Close` choice must `assert`
1. `roll + sell == refNav` (31.6 + 20.4 = 52.0).
2. `price == clearing × refNav` (= 49.92M).
3. cash in (buyer) == cash out (exiting) == `clearing × sell` (= 19.584M).
4. `unitsIssued == price / navPerUnit` (= 49,920,000) **and** buyer units + roller units == unitsIssued.
5. each roller's CV fraction == its prior Atlas fraction (30.336/49.92 == 31.6/52.0) — the roll-at-deal-price check.
6. value conservation: exiting haircut (0.816M) == buyer day-one discount; rollers value-neutral.
7. **rolls filled at 100%; only buyer allocations may be pro-rata scaled** (never scale/force a roll).
8. old fund terminal: 0 asset, 0 cash, 0 outstanding interests post-close.

> **Prototype alignment note:** the JS engine currently sizes roller units off full roll NAV ($31.6M). Update it (and any seed) to roll at the deal price (30,336,000 units) so the simulation matches the on-chain invariants. Otherwise invariants 4–6 fail.

---

## 5. Privacy analysis (who sees what; divulgence risks)

| Fact | Synchronizer | GP | Other LPs | Buyer | Regulator |
|---|---|---|---|---|---|
| Reference price / fairness | ✗ contents | ✓ (room) | ✓ | ✓ | post-close |
| A buyer's bid | ✗ | at `SelectLead` (disclosed) | ✗ | own only | post-close (scoped) |
| An LP's election | ✗ | at `Close` (disclosed) | ✗ | ✗ | post-close (scoped) |
| Computed allocation / legs | ✗ | ✓ (executes) | own leg | own leg | post-close (scoped) |
| Settled result | ✗ | ✓ | own leg | own leg | ✓ scoped window |

**The Canton properties this proves:** (1) sub-transaction/projection privacy — sealed bids/elections have no observers; (2) atomic multilateral settlement — one `Allocation_ExecuteTransfer` batch; (3) selective disclosure — Regulator observer added only to `FairnessDisclosure`; (4) multi-party workflow across roles.

**Divulgence risks to watch (Canton "stake → sees consequences"):**
- **Post-settlement counterparty divulgence:** after an atomic DvP, both sides of a leg transiently see each other's allocated `Holding`s (the ledger-model swap divulgence). Acceptable here — counterparties are meant to see their own leg — but do **not** bundle unrelated LPs' legs such that one LP's `Allocation` becomes a consequence another LP observes. Keep one `TransferLegRequest`/`Allocation` per (sender,receiver) leg so projections stay minimal.
- **`AllocationRequest` observers:** the request discloses `SettlementInfo` (executor, deadlines, `settlementRef`) and its own `transferLegs` to that leg's sender+receiver only — never put the full leg set on one shared request.
- **Marker leakage:** keep `BidFiled`/`ElectionFiled` truly contentless (no amount, no choice) — observers compute from arguments, so any field on the marker leaks.
- **Explicit disclosure hygiene:** disclosing a `SealedBid`/`LPElection` to the GP at clear/close divulges it transiently; it must not be created with the GP as observer (that would persist it in GP's ACS and leak during the window).

---

## 6. On-ledger vs off-ledger boundary

| Pipeline step | On-ledger | Off-ledger (app / JSON API) |
|---|---|---|
| 0 Onboard | `EligibilityCredential` issue | KYC UX, party/JWT setup |
| 1 Create room | `ContinuationDeal` create | deal metadata form |
| 2 Price (auction) | `SealedBid` + `BidFiled`; `SelectLead` sets clearing | bid entry UI; the app fetches disclosed bids for the GP at select |
| 2.5 LPAC | `LPACConsentRequest` → `LPACConsent` | consent UI, recusal capture |
| 3 Elect | `LPElection` + `ElectionFiled` | election UI; amend within window |
| 4 Compute close | `Close` clears + asserts invariants | the app assembles disclosed-contracts bundle; preview render |
| 5 Approve/allocate | `AllocationFactory_Allocate` per sender | per-party "approve my leg" button → JSON API submit |
| 6 Settle | `Allocation_ExecuteTransfer` batch + burns | one "close" click by GP; receipt render |
| 7 Disclose | `FairnessDisclosure` (Regulator observer) | scoped regulator view |
| 8 Flywheel | reuse `EligibilityCredential` (disclosed) | one-click bid on deal #2 |

Rule of thumb: **money/asset/consent state = on-ledger; presentation, form capture, and disclosed-contract assembly = off-ledger.** Clearing math runs *inside* `Close` on-ledger (with disclosed inputs) so the invariants are ledger-enforced, not trusted to the app.

---

## 7. Devnet deployment & app integration

**Build (DPM):** `daml.yaml` deps = `daml-prim`, `daml-stdlib`, `daml-script`, + the `splice-api-token-*` DARs (holding, transfer-instruction, allocation, allocation-instruction, allocation-request, metadata). `dpm build` → DAR; `dpm test` runs the seed/close Daml Script with coverage; `dpm codegen-js` → TS bindings for the portal.

**DevNet path** (`deploy-to-devnet.mdx`): apply for a validator node (canton.foundation) + VPN from a sponsoring SV → run the splice-node validator via Docker Compose (`start.sh -s <sponsorSV> -o <onboardingSecret> -p <partyHint> …`; secret valid 1h) → upload the DAR over the JSON Ledger API with a Keycloak bearer token. Develop on **Splice LocalNet / cn-quickstart** first (fast loop), promote the same DAR to DevNet for the demo — the allocation/settlement code is identical because both mock and real instruments are CIP-56 `Holding`s.

**App (Path B, no `@daml/react` on 3.x):** each persona tab hits **JSON Ledger API v2** with its own per-party JWT; `openapi-fetch` client from the v2 OpenAPI; WS auth via the `["daml.ws.auth","jwt.token.<JWT>"]` subprotocol; separate browser profiles to avoid cookie collisions. Key endpoints: `POST /v2/parties`, DAR upload, `/v2/commands/submit-and-wait`, `/v2/state/active-contracts` (filter by `interfaceId` with `includeCreatedEventBlob` for disclosure), `/v2/updates`. Party IDs read from the seed output — **never hardcode** (fingerprints change on reset).

**Seed as re-runnable Daml Script:** allocate parties → register 3 instruments → mint USDC to buyers + unit treasury to `Vehicle` → issue `EligibilityCredential`s → create `ContinuationDeal`. Mid-demo crash → recover in seconds.

---

## 8. Walking-skeleton build order

1. **Spike the hard plumbing first** (blocker #1): ONE leg end-to-end — mint a mock-USDC `Holding`, `AllocationFactory_Allocate`, `Allocation_ExecuteTransfer` — with disclosed contracts, before scaling to four. Crib `TestCnTokenDvP.daml` / cn-quickstart's `AllocationRequest` example.
2. Register the 3 instruments + seed script.
3. `ContinuationDeal` + `EligibilityCredential`; one `SealedBid` → `SelectLead` sets clearing.
4. `LPElection` (+ default-to-sell) + `LPACConsent` gate.
5. `Close`: clearing math + the 4-leg `Allocation` batch + `OldFundInterest` burns + invariant asserts.
6. `SettlementReceipt` + `FairnessDisclosure` (Regulator scope).
7. Portal wiring per persona (JSON API + JWT); deal-#2 flywheel click.
8. Promote LocalNet → DevNet.

---

## 9. Open decisions / risks

- **O1 — GP-blindness strictness on elections/bids.** R1 uses explicit-disclosure-at-clearing (GP blind during the window). If disclosed-contracts plumbing slips, fallback = GP as observer of elections/bids (still peer-private; weaker GP-blindness). Decide when the §8.1 spike lands.
- **O2 — Faithful 6-leg vs collapsed 4-leg.** R1 ships the 4-leg collapse; the 6-leg CV-routed flow (with the old-fund waterfall) is the R2 realism upgrade. Both settle through the same `Allocation` batch.
- **O3 — Unit treasury vs mint-at-settle.** R1 pre-mints a `Vehicle` treasury and transfers; if the registry supports mint-on-transfer cleanly, prefer that (no idle treasury holding to divulge).
- **O4 — LocalNet vs hosted DevNet for the demo** (the still-open §2.6 build-track question). Recommend building on LocalNet, demoing on DevNet; keep a LocalNet fallback if VPN/onboarding is flaky day-of.
- **O5 — Registry HTTP API for our custom instruments.** The Token Standard expects an admin→registry-URL mapping for factory/choice-context fetch. MVP can stub a minimal registry service for the mock instruments; confirm cn-quickstart's stub is reusable.
