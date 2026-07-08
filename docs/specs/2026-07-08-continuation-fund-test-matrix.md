# Continuation-Fund Business-Rule Test Matrix

**Source:** Fable domain-advisor ruling (2026-07-08), for the Continuum Daml contract test suite.
**Purpose:** the ILPA-grounded business rules the Daml Script tests must assert, so the contracts are provably faithful to real continuation-fund practice — not just mechanically correct.
**Format:** each item = **Rule** / **Scenario** / **Expected**. ⚠️ = commonly gotten wrong in naive models.
**Deal reference:** NAV $52M · roll $31.6M · sell $20.4M · clearing 96%.

## 1. Sequencing / gating
- **1.1** No lead selection before bid deadline → attempt while window open FAILS; succeeds only after `bidDeadline`.
- **1.2** No late bids → bid after deadline FAILS.
- **1.3 ⚠️** LPAC consent must exist before elections open → `OpenElections` with no approved waiver FAILS. (Conflict cleared *before* LPs elect.)
- **1.4** LPAC review ≥10 business days → force vote at day 7 FAILS; day ≥10 succeeds.
- **1.5 ⚠️** Elections open only after price fixed → open before lead-select/clearing FAILS. (LPs elect at a known price.)
- **1.6** Election window ≥ min duration (≥20 biz / ≥30 cal days) → close window early FAILS.
- **1.7** Close requires LPAC approved + elections closed + fairness attestation → each missing gate FAILS independently (3 negative tests).
- **1.8** No stage double-run → re-select lead / re-open elections / re-execute close all FAIL (contracts consumed on transition).
- **1.9** LPAC denial blocks downstream → deny waiver, attempt `OpenElections` FAILS; deal → broken-deal.

## 2. Election
- **2.1 ⚠️** Default = SELL → non-elector booked SELL at 96%, receives cash, **zero CV units**. (Never default-to-roll / negative consent.)
- **2.2** Never forced to roll → invariant: `cvUnits > 0 ⇒ that LP filed explicit roll/split`.
- **2.3** Amend until deadline, frozen after → last election counts; post-deadline amend FAILS.
- **2.4 ⚠️** Status-quo vs roll distinct terms → both get CV units at $1.00/deal-price, but distinct terms records (`feesNotWorse=True` / carry-basis carried vs new terms). Don't collapse.
- **2.5** Split partitions exactly → `rollNav + sellNav == positionNav`, both ≥0; mismatch FAILS (or residue defaults to SELL — pin it).
- **2.6** Only the LP files/amends its own election → GP/other LP attempt FAILS.
- **2.7** Aggregates tie → roll $31.6M, sell $20.4M, sum $52M.

## 3. Price / fairness
- **3.1 ⚠️** Single clearing price, syndicate MFN → every buyer `cashPaid/navAllocated == 0.96`, regardless of own bid. (No discriminatory per-bid pricing.)
- **3.2** Exiting LPs uniform haircut → each seller gets exactly 96%; total seller cash $19.584M.
- **3.3 ⚠️** Rollers roll at deal price → roll $10M → 9,600,000 units (not 10M). `roller units/NAV$ == buyer units/cash$`.
- **3.4** CV bootstrap → asset $49.92M; units 49,920,000; NAV/unit exactly $1.00; no day-one P&L.
- **3.5** Clearing within fairness range → range [92,100] close@96 OK; range [97,103] close@96 FAILS.
- **3.6** Price immutable after elections open → reprice attempt FAILS.
- **3.7** Losing bids don't leak → only 96% appears downstream; losing values never referenced.

## 4. Allocation / oversubscription
- **4.1 ⚠️** Rolls filled 100%, never scaled → under oversubscription every roller gets full elected roll. (Rolling is a right, outside scaling.)
- **4.2** Pro-rata scaling buyers only → lead filled to capacity; syndicate overflow scaled pro-rata; no buyer over its commitment; sum buyer alloc == $20.4M.
- **4.3** Syndicate fills only overflow above lead capacity → lead cap ≥ pool ⇒ syndicate $0; lead cap $12M ⇒ syndicate $8.4M.
- **4.4** Undersubscription explicit → funding gap FAILS or modeled broken-deal fallback; sellers never force-converted to rollers.
- **4.5** Allocation conservation → `sum(buyerAlloc)==sellNav`, `sum(rollAlloc)==rollNav` to the cent; defined rounding rule.

## 5. Conservation / tie-out at close
- **5.1** Partition: 31,600,000 + 20,400,000 = 52,000,000.
- **5.2** Cash: buyer cash in = seller cash out = $19,584,000; none retained by GP/CV.
- **5.3** Units: rollers 30,336,000 + buyers 19,584,000 = 49,920,000.
- **5.4** Asset: at cost $49,920,000 = units × $1.00; NAV/unit $1.00.
- **5.5 ⚠️** Old fund emptied: asset holding archived; all LP old interests burned (rollers' too — old interest does NOT survive alongside new CV units).
- **5.6** Per-LP: `cashReceived + cvUnits×$1 == 0.96 × oldPositionNav` (e.g. split $10M→roll6/sell4: $3.84M + 5,760,000 units = $9.6M).
- **5.7** No orphans/mints: zero unallocated cash/units; no CV units held by GP/fund (unless declared GP commitment); asset only in CV.
- **5.8** Ownership sanity: buyers ≈39.23%, rollers ≈60.77% of CV.

## 6. Atomicity / failure
- **6.1 ⚠️** All-or-nothing → sabotage one leg, attempt close: entire close FAILS; ledger byte-identical to pre-attempt.
- **6.2** Missing roll leg blocks close → one roller's old interest gone ⇒ close FAILS entirely.
- **6.3** No partial-settlement backdoor → single settlement sub-choice outside the atomic close FAILS.
- **6.4** Broken deal restores status quo → LPAC denial / GP withdrawal ⇒ bids+elections voided, old fund intact, no cash moved, no re-entry.
- **6.5** Buyer decline-to-fund at clearing → declining buyer pays/receives nothing; re-scale or break (pin behavior).
- **6.6** No close replay → second close FAILS (instruction consumed).
- **6.7** Post-deadline election can't corrupt pending close → rejected; close on frozen set.

## 7. Privacy-as-business
- **7.1** LP election confidentiality → LP-B sees nothing of LP-A's election at any stage.
- **7.2** Sealed bids stay sealed between buyers → buyer-B can't see buyer-A's bid ever; losing bids sealed forever.
- **7.3 ⚠️** GP blindness mid-window → GP sees *that* a bid/election is filed, not contents, until deadline unseal; no early-reveal choice. Query GP's ACS mid-window to prove it.
- **7.4** Cross-side blindness → buyer sees only allocated aggregate sell-pool (post-election-close), never per-LP; LP sees only final clearing price, never bid tape.
- **7.5** Regulator scoped, post-close only → pre-close sees nothing; post-close (after GP's explicit disclosure act) sees defined scope, still not per-LP elections/losing bids.
- **7.6** LPAC sees conflict package only → not the bid tape, not other LPs' elections.

## 8. Edge cases
- **8.1** Over-roll → roll > position FAILS at submission (not silently clamped).
- **8.2** Negative/zero → negative split, zero/negative bid FAIL at submission.
- **8.3** Ineligible/revoked bidder → bid without credential FAILS; revoked-before-funding ⇒ close FAILS or excluded (pin).
- **8.4 ⚠️** All-roll (zero sell) → no divide-by-zero on pro-rata; close with $0 buyer cash, 49,920,000 roller units, or modeled break; conservation holds with sell=$0.
- **8.5** All-sell (nobody rolls) → if buyer cap ≥$52M all cashed at 96%; else undersubscription path; conservation holds with roll=$0.
- **8.6 ⚠️** LPAC-bidder recusal → conflicted member's LPAC vote excluded from quorum; waiver counted WITH conflicted vote rejected at election-open gate.
- **8.7 ⚠️** Non-elector needs no signature at close → default-to-sell leg must not require a post-deadline LP-signed action (pre-authorized via deal terms). If close needs the LP's signature, default-to-sell is broken.
- **8.8** Deadline boundary → `< deadline` accepted, `>= deadline` rejected; test both sides.
- **8.9** Duplicate election/bid → second replaces (amendment) or rejected; NAV counted exactly once.
- **8.10** Rounding at scale → deterministic rule; conservation ties to the cent; residual assigned per rule.
- **8.11** GP self-dealing guard → GP bidding/allocating to itself FAILS unless declared LPAC-disclosed commitment.
- **8.12** Stale NAV → close referencing a NAV ≠ election-open NAV ($52M) FAILS; one NAV pinned election-open→close.

## Priority (most-commonly-wrong)
2.1 · 3.3 · 5.5 · 3.1 · 4.1 · 1.3/1.5 · 7.3 · 8.4 · 8.6 · 8.7
