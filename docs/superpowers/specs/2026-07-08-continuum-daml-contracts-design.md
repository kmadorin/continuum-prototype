# Continuum — Daml Contracts, Tests & Local E2E (Phase 1 Design)

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
| **D7** | **Default-to-sell requires no post-deadline LP signature:** LPs pre-authorize the executor at deal-join (`DealParticipation`); instrument holdings are **registry-admin-authored** so delivery needs no live receiver signature. (From Fable rule 8.7.) |
| D8 | LPAC consent is **recusal-aware**: a conflicted member's vote is excluded; a waiver recorded with a conflicted vote counted is rejected at the election-open gate. (Fable 8.6.) |

## Architecture

Single Canton participant hosting all parties (hackathon topology). Parties: `GP` (author + executor + registries' admin hat), `RollingLP`/`ExitingLP` (×N), `Buyer` (×M, lead + syndicate), `Regulator`, `Issuer`, plus logical instrument-admin parties (`CashRegistry`, `Vehicle`, old-fund) that may share the `GP` key in MVP.

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
| `ContinuationDeal` | GP (+Vehicle) | room; Regulator post-close | `SubmitBid`(Buyer, nonconsuming), `SelectLead`(GP), `OpenElections`(GP), `Close`(GP) |
| `DealParticipation` **(new)** | LP/Buyer + GP | — | created via propose-accept; grants executor standing authority to burn the party's `OldFundInterest` and settle its close leg |
| `EligibilityCredential` | Issuer | Buyer | `Revoke`(Issuer); reused across deals (flywheel) |
| `SealedBid` | Buyer | — | `Withdraw`(Buyer); disclosed to GP at `SelectLead` |
| `BidFiled` | Buyer | GP | contentless marker |
| `LPACConsentRequest` / `LPACConsent` | GP / Regulator | Regulator / GP | `Grant`(Regulator, recusal-aware); gates `OpenElections` |
| `LPElection` | LP (sole) | — | `Amend`(LP); disclosed to GP at `Close`; default absent = SELL |
| `ElectionFiled` | LP | GP | contentless marker |
| `OldFundInterest` | old-fund (GP) | LP | archived (burned) inside `Close` |
| `TransferLegRequest` *(impl `AllocationRequest`)* | GP (executor) | leg sender+receiver | senders `AllocationFactory_Allocate`; executor `Allocation_ExecuteTransfer` |
| `SettlementReceipt` / `FairnessDisclosure` | GP | room / Regulator | post-close proof / scoped regulator window |

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

Daml Script, one suite per group. Every rule = an assertion; the 10 flagged rules get explicit positive **and** negative tests. Full enumeration (72 assertions): `docs/specs/2026-07-08-continuation-fund-test-matrix.md`. The groups and priority rules:

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

1. **Spike:** one allocate→execute leg with the `Usdc` registry on the sandbox (de-risks the token-standard plumbing — the #1 blocker) before scaling.
2. All 3 registries + `Seed`.
3. `ContinuationDeal` + `EligibilityCredential` + `DealParticipation`; `SubmitBid` → `SelectLead` sets clearing.
4. `LPElection` (+ default-to-sell) + `LPACConsent` gate (recusal-aware).
5. `Close`: clearing math + 4-leg `Allocation` batch + `OldFundInterest` burns + invariant asserts.
6. `SettlementReceipt` + `FairnessDisclosure`; deal-#2 flywheel (credential reuse).
7. Full e2e on sandbox.
8. Whole Fable test matrix green (`dpm test`).

## Risks

- **R1 — obtaining `splice-api-token-*` interface DARs** as build deps. Spike at step 1; fallback = vendor the interface `.daml` sources if published DARs aren't fetchable in the local setup.
- **R2 — implementing `AllocationRequest`/`Allocation` correctly** against the real interface signatures (ExtraArgs/ChoiceContext shapes). Mitigate by cribbing cn-quickstart's `AllocationRequest` example.
- **R3 — time-gated tests** (LPAC ≥10 biz days, election window) need Script `setTime`/`passTime`; keep durations configurable so tests run fast.
