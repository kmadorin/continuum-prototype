# Continuum — Daml Contracts, Tests & Local E2E (Phase 1 Design)

> **⚠️ SUPERSEDED** by `docs/superpowers/specs/2026-07-09-continuum-onchain-spec.md`, which is the single, clean, freshly-grounded spec (adds the valuation/document hash-anchoring layer). This draft is kept for history only.

**Date:** 2026-07-08
**Status:** Approved (brainstorming) → ready for writing-plans
**Companion:** `docs/specs/2026-07-08-continuum-daml-contract-spec.md` (the architecture/contract reference this design implements)

## Goal & scope

Produce a **working set of Daml smart contracts + a business-grounded test suite + a local-blockchain end-to-end run** that executes the full GP-led continuation-fund secondary deal (deal #1) and the deal-#2 flywheel, proving the four Canton properties (projection privacy, atomic multilateral settlement, selective disclosure, multi-party workflow).

**In scope (this phase):**
- All 10 contract templates + 3 instrument registries (full lifecycle incl. flywheel).
- Our own registries **implementing the real `splice-api-token-*` interfaces** (Holding / TransferFactory / Allocation / AllocationFactory / AllocationRequest).
- Daml Script test suites covering the Fable business-rule matrix (§ "Test matrix" below).
- Local e2e: build DAR → boot **canton sandbox** → upload → run `Seed` + `Close` via Daml Script against the live ledger → assert final ACS ties out.

**Out of scope (later phases):** devnet deployment (validator/VPN/Keycloak), the portal UI ↔ JSON Ledger API wiring, full Splice LocalNet runtime + wallet, real USDCx/Circle.

## Decisions carried

| # | Decision |
|---|---|
| D1 | Real Canton Network Token Standard (CIP-0056 / `splice-api-token-*` interfaces). |
| D2 | Sealed bids on-ledger (buyer sole signatory → peer-blind). |
| D5 | Rolling LPs roll at the **deal price** (96%), not par. Asset booked at cost; NAV/unit = $1.00. |
| D6 | Sealed bids/elections disclosed to the executor **only at clearing/close** (GP blind mid-window). |
| **D7** | **Default-to-sell requires no post-deadline LP signature:** LPs pre-authorize the executor at deal-join (`DealParticipation`, LP+GP co-signed); instrument holdings are **registry-admin-authored** so delivery needs no live receiver signature. (Fable 8.7.) |
| D8 | LPAC consent is **recusal-aware, verified on-ledger**: the election-open gate derives conflicts by matching the LPAC member roster against `BidFiled` markers and rejects a consent whose `recusals` don't cover an on-ledger-detectable conflict — not trusting a self-reported field. (Fable 8.6 + review §3.1.) |
| **D9** | **Independent fairness attestation:** a provider-signed `FairnessOpinion` (signatory `FairnessProvider`, GP observer) carries the fair range; `Close` is gated on it and asserts `clearing ∈ [low, high]`. The GP does **not** self-attest fairness. (Review §1.1.) |
| **D10** | **Broken-deal path is on-ledger:** `ContinuationDeal` has a `Break` choice → `Broken` terminal stage; voids bids/elections, leaves the old fund intact, no re-entry. (Review §1.2.) |
| **D11** | **LPAC ≠ Regulator:** distinct parties. `LPAC` grants the conflict waiver pre-election; `Regulator` receives only the scoped post-close `FairnessDisclosure`. Makes selective disclosure legible. (Review §3.2.) |
| **D12** | **GP economics are declared, not hidden:** `ContinuationDeal` carries an explicit `gpCommitment` + `carryCrystallized` field (**$0 in the demo numbers**, but named), with the real carry-in-waterfall deferred to R2's 6-leg flow. Pre-empts the defining CV-conflict question. (Review §1.3, §6.2.) |

**`OldFundInterest` authority (load-bearing correction):** signatory = old-fund (`GP`) **+ the LP** (co-signed). The burn at close therefore genuinely requires the LP's authority, which flows from the LP+GP-co-signed `DealParticipation` (the delegation/power-of-attorney pattern): `Close` exercises the burn+settle through each LP's `DealParticipation`, whose choice body carries LP authority with GP as controller. This turns D7 from decoration into the real answer to rule 8.7.

## Architecture

Single Canton participant hosting all parties (hackathon topology). Parties: `GP` (author + executor + registries' admin hat), `RollingLP`/`ExitingLP` (×N), `Buyer` (×M, lead + syndicate), **`LPAC`** (grants the conflict waiver), **`Regulator`** (scoped post-close view only — distinct from LPAC, D11), **`FairnessProvider`** (signs the fairness opinion, D9), `Issuer`, plus logical instrument-admin parties (`CashRegistry`, `Vehicle`, old-fund) that may share the `GP` key in MVP.

> **Single-participant honesty (demo Q&A pre-emption):** one key wears many hats (GP/executor/registry/Vehicle/old-fund). Daml authority is **party-level, not key-level**, and the privacy proofs are per-party projections — so co-location does not weaken them. State this up front; the live mid-window per-party ACS query (test 7.3) is the money shot. Multi-participant (operator-level separation) is R2.

### Project layout
```
continuum-daml/
  daml.yaml                # deps: daml-prim, daml-stdlib, daml-script, splice-api-token-*
  daml/Continuum/
    Deal.daml              # ContinuationDeal (root state machine), DealParticipation
    Credential.daml        # EligibilityCredential
    Auction.daml           # SealedBid, BidFiled
    Consent.daml           # LPACConsentRequest, LPACConsent (recusal-aware)
    Election.daml          # LPElection, ElectionFiled
    OldFund.daml           # OldFundInterest (burned at close)
    Close.daml             # clearing math + atomic Allocation batch + invariant asserts
    Disclosure.daml        # SettlementReceipt, FairnessDisclosure
    Registry/
      Usdc.daml            # implements Holding/TransferFactory/AllocationFactory/Allocation
      Unit.daml            # CV units; class metadata: StatusQuo | NewTerms | Buyer
      Asset.daml           # Project Atlas; indivisible
  daml/Test/               # one Script suite per Fable group
    Sequencing.daml Election.daml Price.daml Allocation.daml
    Conservation.daml Atomicity.daml Privacy.daml Edge.daml
  scripts/Seed.daml        # re-runnable: parties, instruments, mint, credentials, deal
  e2e/run.sh               # canton sandbox: start → upload DAR → Seed + Close → assert
```

### Contract set

The 10 templates from the contract spec §3, plus `DealParticipation`:

| Template | Signatory | Observers | Key choices (controller) |
|---|---|---|---|
| `ContinuationDeal` | GP (+Vehicle) | room; Regulator post-close | `SubmitBid`(Buyer, nonconsuming), `SelectLead`(GP), `OpenElections`(GP), `Close`(GP), **`Break`(GP or on LPAC denial) → `Broken` stage**; carries `gpCommitment`/`carryCrystallized` (D12) |
| `DealParticipation` **(new)** | LP/Buyer **+ GP** | — | propose-accept; the LP+GP authority that `Close` exercises to **burn the LP's co-signed `OldFundInterest` and settle its leg** without a post-deadline LP signature (D7) |
| `FairnessOpinion` **(new, D9)** | FairnessProvider | GP | carries `[low, high]` + provider id; `Close` gated on it, asserts `clearing ∈ [low, high]` |
| `EligibilityCredential` | Issuer | Buyer | `Revoke`(Issuer); reused across deals (flywheel); `Close` asserts each funding buyer's is unrevoked |
| `SealedBid` | Buyer | — | `Withdraw`(Buyer); disclosed to GP at `SelectLead` |
| `BidFiled` | Buyer | GP | contentless marker; **also the on-ledger fact the recusal gate checks** (D8) |
| `LPACConsentRequest` / `LPACConsent` | GP / **LPAC** | LPAC / GP | `Grant`(LPAC); gate derives conflicts from `BidFiled` × LPAC roster, rejects uncovered recusals (D8); gates `OpenElections` |
| `LPElection` | LP (sole) | — | `Amend`(LP); disclosed to GP at `Close`; default absent = SELL |
| `ElectionFiled` | LP | GP | contentless marker |
| `OldFundInterest` | old-fund (GP) **+ LP** | — | co-signed; archived (burned) inside `Close` **via `DealParticipation`** |
| `TransferLegRequest` *(impl `AllocationRequest`)* | GP (executor) | leg sender+receiver | senders `AllocationFactory_Allocate`; executor `Allocation_ExecuteTransfer` |
| `SettlementReceipt` / `FairnessDisclosure` | GP | room / Regulator | post-close proof / scoped regulator window |

### Pinned behaviors (Fable §1.5, §2.3 — no longer "TBD")

- **Split residue:** `LPElection` `ensure rollNav + sellNav == positionNav` (both ≥0); any mismatch is rejected at submission — no silent residue.
- **Buyer decline-to-fund at clearing:** the declining buyer's allocation is re-scaled across the remaining syndicate (rerun buyer-only pro-rata); if the gap can't be filled, `Close` fails → GP `Break`s the deal. Declining buyer pays/receives nothing.
- **Revoked credential at funding:** `Close` asserts every funding buyer holds an unrevoked `EligibilityCredential`; a revocation between bid and funding makes `Close` fail (deal re-scales or breaks) — no silent inclusion.
- **Rounding rule:** CV units rounded **down to whole units**, residual units assigned to the **lead buyer**; cash to the cent, residual to the **largest exiting LP**. Conservation asserts (§5) use this rule; sum-of-parts == whole exactly.
- **Asset conservation:** the Atlas token carries economics in `meta` (`refNAV`/`price`) with `amount = 1`; invariant 8 (old fund terminal) asserts the asset holding's **existence/owner**, not its amount field.

> **Tokenization framing (say it in the demo):** CV units are **register entries on a transfer agent's book** (admin = the registry/transfer agent), not bearer instruments — which is how fund LP interests actually work. No self-custody or bearer-token claim is made; the indivisible Atlas token abstracts a single portfolio-company interest re-registration.

### Instruments (our registries implement the real interfaces)

Three registries, each a set of admin-authored `Holding` UTXOs with `InstrumentId {admin, id}`, implementing `TransferFactory` + `AllocationFactory` + `Allocation` + our `AllocationRequest`:

| Instrument | InstrumentId | Admin | Divisible |
|---|---|---|---|
| Mock USDC | `{CashRegistry,"USDC"}` | CashRegistry | yes |
| CV units | `{Vehicle,"MERIDIAN-CV-I"}` | Vehicle | yes (class in `meta`) |
| Atlas asset | `{GP,"PROJECT-ATLAS"}` | old-fund | no (amount = 1; meta refNAV/price) |

`OldFundInterest` is a plain position (not a token — never traded), burned at close against cash (sellers) or CV units (rollers).

### Atomic close (the settlement)

`Close` (controller GP as executor) in one transaction: (1) read disclosed `LPElection`s at `clearingPrice`; (2) compute roll/sell aggregates, syndicate fill, **buyer-only** pro-rata scaling; (3) `assert` the conservation invariants; (4) create per-leg `TransferLegRequest`s; senders allocate; (5) `Allocation_ExecuteTransfer` across all legs **+** archive all `OldFundInterest`s — all-or-nothing; (6) emit `SettlementReceipt` + `FairnessDisclosure`.

**Canonical numbers (clearing 96%, NAV $52M, roll $31.6M, sell $20.4M):** buyer cash $19.584M · roller units 30,336,000 · buyer units 19,584,000 · total units 49,920,000 · asset at cost $49.92M · NAV/unit $1.00.

## Test matrix (Fable-validated business rules)

Daml Script, one suite per group. **Coverage priority (Fable §5.1):** the **10 ⚠️ flagged rules + all of groups 5 (conservation) and 6 (atomicity)** are the guaranteed must-pass set for this phase, each with explicit positive **and** negative tests; non-flagged group-8 edge cases are **stretch goals**. Full enumeration (72 assertions): `docs/specs/2026-07-08-continuation-fund-test-matrix.md`. The groups and priority rules:

1. **Sequencing/gating** — no lead-select before bid deadline; **LPAC consent before elections open (1.3)**; **price fixed before elections (1.5)**; ≥10-biz-day LPAC window; close needs {LPAC ✓ + elections closed + fairness attestation}; no stage double-run; LPAC denial → broken deal.
2. **Election** — **default = SELL (2.1)**; never-forced-to-roll (`cvUnits>0 ⇒ explicit roll/split`); amend-before-deadline only; **status-quo vs roll distinct terms (2.4)**; split partitions position exactly; only LP files own election.
3. **Price/fairness** — **single clearing price all buyers, syndicate MFN (3.1)**; exiting LPs uniform haircut; **rollers roll at deal price (3.3)**; asset-at-cost + NAV/unit=$1.00; clearing within fairness range; price immutable after elections open; losing bids never leak into pricing.
4. **Allocation/oversubscription** — **rolls filled 100%, never scaled (4.1)**; pro-rata scaling buyers-only; syndicate fills only overflow above lead capacity; undersubscription = explicit fail/broken (never force sellers to roll); allocation conservation.
5. **Conservation/tie-out** — the $ identities: partition 31.6+20.4=52; cash in=out=19.584M; units 30.336M+19.584M=49.92M; asset at cost 49.92M=units×$1; **old interests all burned incl. rollers' (5.5)**; per-LP `cash+units×$1 = 0.96×oldNAV`; no orphans/mints.
6. **Atomicity/failure** — **all-or-nothing close; sabotage one leg ⇒ ledger byte-identical (6.1)**; no partial-settlement backdoor; broken-deal restores status quo; buyer decline-to-fund at clearing; no close replay; post-deadline election can't corrupt pending close.
7. **Privacy-as-business** — LP-B can't see LP-A's election (any stage); buyer-B can't see buyer-A's bid (ever); **GP blind to contents mid-window (7.3)**; regulator sees nothing pre-close, scoped view post-close via explicit act; LPAC sees conflict package only.
8. **Edge** — over-roll rejected; negative/zero amounts rejected; ineligible/revoked bidder; **all-roll (zero sell) no divide-by-zero (8.4)**; all-sell; **LPAC-bidder recusal (8.6)**; **non-elector needs no signature at close (8.7)**; deadline-boundary semantics; duplicate election/bid; rounding at scale; GP self-dealing guard; stale-NAV reference rejected.

## Local e2e

`e2e/run.sh`: `dpm build` → boot canton sandbox → upload DAR (JSON Ledger API or `daml ledger upload-dar`) → run `Seed` then `Close` as Daml Script against the running ledger → query final ACS and assert the §5 conservation identities hold on a real ledger (not just the Script interpreter). Party IDs read from Seed output, never hardcoded.

## Build order (blocker-first)

1. **Spike A (token plumbing, blocker #1):** one allocate→execute leg with the `Usdc` registry on the sandbox before scaling.
2. **Spike B (privacy plumbing, promoted):** prove GP-blind-mid-window (test 7.3) via explicit disclosure of a `SealedBid`/`LPElection` to the GP only at clearing/close. If this slips, the fallback (GP-as-observer) silently deletes the headline privacy claim — so de-risk it now, not at step 5. (Review §5.3.)
3. All 3 registries + `Seed`.
4. `ContinuationDeal` + `FairnessOpinion` + `EligibilityCredential` + `DealParticipation`; `SubmitBid` → `SelectLead` sets clearing.
5. `LPElection` (+ default-to-sell) + `LPACConsent` gate (on-ledger recusal check); `Break`/`Broken` path.
6. `Close`: clearing math + rounding rule + 4-leg `Allocation` batch + `OldFundInterest` burns (via `DealParticipation`) + fairness-range + invariant asserts.
7. `SettlementReceipt` + `FairnessDisclosure` (to `Regulator`); deal-#2 flywheel (credential reuse).
8. Full e2e on sandbox.
9. Test matrix green (`dpm test`) — see scope below.

## Risks

- **R1 — obtaining `splice-api-token-*` interface DARs** as build deps. Spike at step 1; fallback = vendor the interface `.daml` sources if published DARs aren't fetchable in the local setup.
- **R2 — implementing `AllocationRequest`/`Allocation` correctly** against the real interface signatures (ExtraArgs/ChoiceContext shapes). Mitigate by cribbing cn-quickstart's `AllocationRequest` example.
- **R3 — time-gated tests** (LPAC ≥10 biz days, election window) need Script `setTime`/`passTime`; keep durations configurable so tests run fast.
