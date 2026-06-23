# Continuum — Process-Validation Update (Design Spec)

**Date:** 2026-06-23
**Status:** Approved for planning
**Scope:** Update the portal prototype (`portal/`) and the user story map (`docs/specs/gen_story_map.py` → regenerate `continuum-user-story-map.excalidraw`) to fold in all 7 corrections from `docs/prompts/RESEARCH_FINDINGS_process-validation.md`, so the deal model reads as credible to a secondaries professional.
**Source of truth:** `RESEARCH_FINDINGS_process-validation.md` (CFA Institute Sept 2025 + ILPA May 2023 anchors).

---

## 1. Goal

The current prototype gets the easy things right (sealed bids, %-of-NAV pricing, peer-private elections, default=sell, atomic settlement) but reads naive on three points and carries four smaller inaccuracies. This update fixes **all 7** research corrections without changing the demo's core hooks (sealed-bid privacy, atomic close, flywheel).

Decisions locked during brainstorming:
- **Scope:** all 7 corrections.
- **LPAC actor:** upgrade the existing `oversight` seat (already labelled "LPAC / Regulator") to a dual-phase role — pre-close consenter + post-close observer. No new seat.
- **Consent gate placement:** **pre-elections** (strict ILPA) — LPAC consents before LPs elect against an approved deal.
- **Election model:** three top-level choices `{roll, status-quo, sell}` **plus** keep `split`. Default = sell.
- **Price-discovery depth:** status labels only (no full two-stage negotiation UI), with required specifics (see §4.3).

---

## 2. The 7 corrections → where they land

| # | Correction | Change |
|---|---|---|
| 1 | Lead + syndicate at lead price; **sponsor-controlled** allocation | Explicit advisor `selectLead` action (replaces auto-pick); syndicate admitted at lead price; lead sets price, advisor controls admission. |
| 2 | **LPAC consent = pre-close gate** | New `lpacConsent` stage before `elections`; `openElections` blocked until consent recorded. |
| 3 | Three-way election sell / roll / **status-quo** + ≥30-day window | `status-quo` as 3rd top-level choice (terms-flagged roll); split retained; ≥30 cal-day window shown. |
| 4 | Fairness opinion = conditional **supporting doc**, not auto-validator | Remove auto-`fairnessValidated`; reframe as a doc in the LPAC package; reword copy. |
| 5 | Concrete windows (election ≥30 cal / 20 biz; LPAC ≥10 biz) | Show windows in elections panel + LPAC consent panel. |
| 6 | Staged, mutually-blind price discovery | Bid-book status column + "finalists blind to one another" audit line + lead terms shown as set. |
| 7 | Dual-track / **decline-to-proceed**; NO reserve price, NO GP backstop | Advisor `declineToProceed` action → terminal `declined`; reword syndicate "backstop"→"fills overflow at lead price"; optional minority co-sale ref. |

---

## 3. Stage machine

```
setup → bidding → leadSelected → lpacConsent → elections → allocation → approvals → settlement → settled
                       │              │             │            │            │
                       └──────────────┴─────────────┴────────────┴────────────┴──► declined (terminal)
```

Changes vs current `setup → bidding → cleared → elections → allocation → approvals → settlement → settled`:
- Rename `cleared` → `leadSelected`.
- Insert `lpacConsent` between `leadSelected` and `elections`.
- Add terminal `declined` (advisor decline-to-proceed), reachable from `leadSelected` through `approvals`.

`STAGES` and `STAGE_META` (in `state.js`) updated accordingly:

| key | label | pill |
|---|---|---|
| setup | Setup | Setup |
| bidding | Auction open | Bidding |
| leadSelected | Lead selected | Lead set |
| lpacConsent | LPAC review | Consent |
| elections | Elections open | Elections |
| allocation | Allocation | Allocation |
| approvals | Approvals | Approvals |
| settlement | Settling | Settling |
| settled | Settled | Settled |
| declined | Declined to proceed | Declined |

`SECTIONS` add a `consent` section (LPAC package); ordered before `elections`.

---

## 4. Engine changes (`portal/shared/state.js`)

Bump `validState` version `v: 5 → 6` (state shape changes; old persisted state discarded).

### 4.1 Seed data additions
Per deal, add lead/CV terms used in the lead one-liner and the LPAC package:
```
leadTerms: { mgmtFee: "1.5%", carry: "10% over 8% hurdle", gpCommit: <reuse gpCommit> }
```
(`gpCommit` already exists; `mgmtFee`/`carry`/`hurdle` are new strings — illustrative, no math.)

### 4.2 Lead selection — `selectLead({buyerId})` (replaces `openBook`)
- Precondition: stage `bidding` (or `setup` with bids), `buyerId` is a filed, non-passed, in-range bid.
- Effects: `leadBuyerId = buyerId`; `clearingPrice = bids[buyerId].price`; `recomputeSyndicate()` (syndicate = next-ranked bids that fill overflow **at the lead price**); `stage = leadSelected`.
- **Do NOT** set any `fairnessValidated` truthy flag. Fairness opinion is a supporting doc only.
- Audit: `"Advisor selected lead — <buyer> · price <pct> · finalists were blind to one another"`; `"Syndicate admitted at lead price: <names>"` (if any); `"Fairness opinion on file (<provider>, <range>) — supports LPAC review"`.
- Sponsor-controlled framing: the advisor picks the lead; the lead sets the price, not the allocation.

### 4.3 LPAC consent gate
- `openLpacReview()` — advisor sends the package to LPAC; stage `leadSelected → lpacConsent`. Audit: `"Conflict + fairness + terms package sent to LPAC · ≥10 business-day review"`.
- `recordConsent({recusals?})` — LPAC records consent; sets `lpacConsent = { granted: true, recusals: recusals||[], ts }`. Audit: `"LPAC consented to the transaction · conflicts reviewed/waived"` (+ recusal note if any). Does **not** advance stage by itself.
- `openElections()` — precondition tightened: requires `stage === lpacConsent && lpacConsent.granted`. Advances to `elections`.
- New state fields: `lpacConsent: { granted: false, recusals: [], ts: null }`.

### 4.4 Three-way elections — `submitElection`
- `choice ∈ { roll, status-quo, sell, split }`.
- `roll` → `rollNav = nav`, `terms: "new"`.
- `status-quo` → `rollNav = nav`, `terms: "existing"` (stay invested, unchanged economic terms — no carry crystallization; same units math as roll).
- `sell` → `sellNav = nav`.
- `split` → `rollNav`/`sellNav` per payload (stay-portion defaults `terms: "new"`).
- Default for unfiled (post-deadline) = sell (unchanged).
- Allocation math: status-quo behaves exactly like roll for units/tie-out — it is a labelled roll. The `terms` flag drives copy only.

### 4.5 Allocation reword (#7)
- `recomputeSyndicate` / leg copy: replace "backstop" with "fills overflow at the lead price"; remove any "reserve price" / GP-pays-above wording. The cleared bid is the price; the GP sits sell-side.
- No math change.

### 4.6 Decline-to-proceed — `declineToProceed()`
- Precondition: stage in `{ leadSelected, lpacConsent, elections, allocation, approvals }`.
- Effects: `stage = declined`; nothing settles. Audit: `"Advisor declined to proceed (broken-deal) — pricing/terms unacceptable · nothing moved"`.
- Terminal; only `reset` / `startNextDeal` leaves it.

### 4.7 Tasks (`tasksFor`)
- advisor: `leadSelected` add "Send package to LPAC"; `lpacConsent` add "Awaiting LPAC consent" (muted) + (when granted) "Open elections to LPs"; add a persistent "Decline to proceed" secondary action while pre-settlement.
- oversight (LPAC): `lpacConsent` add "Review conflict + fairness package & record consent".

---

## 5. UI changes (`portal/shared/app.js`)

### 5.1 LPAC (oversight) seat — dual phase
- **Pre-close (`lpacConsent` stage):** unlock a **Consent** section with the LPAC package: conflict disclosure (GP commit + both-sides note), fairness opinion (provider + range, framed as support), lead terms (fee/carry/hurdle), valuation/comparables summary, lead + syndicate at lead price. A **"Record consent"** control; **≥10 business-day** review window shown. Recusal toggle (a member recuses).
- **Gate visible:** before consent, elections cannot open (advisor sees blocked state).
- **Post-close:** existing fairness-attestations / scoped audit view retained; update its bullets to reflect lead-selection + LPAC pre-close consent (not "fairness validated the price").
- Section access for oversight: add `consent`; keep post-close set.

### 5.2 Bids / Pricing tab
- Status column: `Awaiting → Filed (Finalist) → Lead / Syndicate / Passed`.
- Advisor "Select lead" action per qualifying bid (replaces single "Open book").
- Lead one-liner once selected: price + `mgmtFee / carry / hurdle / gpCommit` — **shown as already set on the lead**, not a negotiation step.
- Audit/hint line: **"Finalists were blind to one another."**
- Remove "fairness-validated" chip on the clearing price; replace with "lead price · fairness opinion on file".

### 5.3 Elections tab
- Three-way control: Roll (new terms) · Status-quo (unchanged terms) · Sell · Split.
- Status-quo cell shows "unchanged terms — no carry crystallization".
- Window note: **"Election window ≥30 calendar days; never forced to roll; default = sell."**

### 5.4 Fairness reframe (global copy)
- Replace every "fairness opinion validates the price" / "fairness-validated" with "fairness opinion on file · range X–Y · supports the LPAC decision" (conditional best-practice; SEC mandate vacated June 2024 — narrative only, no UI claim of legal requirement).

### 5.5 Settlement / advisor
- "Decline to proceed (broken-deal)" action available pre-settlement → renders a `declined` terminal state (nothing moved, audit shown).
- Documents: optional minority co-sale validation reference (dual-track arm's-length framing) as a supporting doc row.

---

## 6. Story map (`docs/specs/gen_story_map.py` → regenerate)

- **Fix stale output path:** `continuum/docs/specs/` → `continuum-prototype/docs/specs/`.
- **Backbone:** insert a new activity **"4. LPAC consents (pre-close gate)"** between *Price the deal* and *Decide: roll or sell*; renumber following activities. Bump `COLS` from 9 to 10 columns and adjust `RIGHT`/band widths.
- **Card rewrites:**
  - *Price the deal*: BUYER "Sealed priced bid to win lead — blind to other finalists"; ADVISOR "Select the lead; lead sets price; syndicate joins at lead price; fairness opinion on file (supports LPAC)".
  - *New LPAC consents column*: OVERSIGHT "Review conflict + fairness + terms package; consent (≥10 biz days) — gates elections; recuse if conflicted".
  - *Decide: roll or sell*: STAY "ROLL / STATUS-QUO (unchanged terms) at the set price"; LEAVE "SELL — default if nothing filed; ≥30-day window; never forced to roll".
  - R2 cards: pricing "Sealed-bid; finalists blind; advisor selects lead, syndicate at lead price"; add a decline-to-proceed card (advisor, under settle/allocation); status-quo under decide.
- Regenerate the `.excalidraw` by running the script; verify element count prints.

---

## 7. Out of scope / non-goals

- No Canton / Daml / backend — still front-end simulation only.
- No full two-stage price negotiation UI (status labels only, per decision).
- No new persona seat (LPAC = upgraded oversight seat).
- No change to atomic-close mechanics, tie-out math, or flywheel.
- Do **not** introduce "reserve price" or any GP-backstop-above-cleared-bid concept (explicitly rejected by research).

---

## 8. Acceptance check

A secondaries professional reviewing the prototype sees: (1) advisor selects a **lead** who sets the price; a **syndicate** joins at the lead price; finalists were blind to one another; (2) **LPAC consents pre-close**, gating LP elections, with a ≥10-biz-day window and recusal; (3) LPs choose **sell / roll / status-quo** over a ≥30-day window, default sell, never forced to roll; (4) the fairness opinion is a **supporting document**, not an auto-validator; (5) the advisor can **decline to proceed**; and the story map reflects the same sequence. `selftest.js` still passes (tie-out unchanged).
