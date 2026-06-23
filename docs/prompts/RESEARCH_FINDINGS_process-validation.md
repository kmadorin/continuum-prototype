# Research Findings — Continuum process model vs real GP-led continuation deals

> Output of `PROCESS_RESEARCH_BRIEF.md`. Feeds `PORTAL_BRIEF.md`.
> Method: multi-source web research (ILPA primary guidance + advisor market reviews + law-firm explainers + SEC), claims extracted and cross-checked. ~91 claims across 22 sources, then a **second adversarial-verification pass** (3 dedicated websearch agents) that refute-tested corrections #1–7 and pulled a new primary anchor — the **CFA Institute** report *Continuation Funds: Ethics in Private Markets, Part I* (Sept 2025, pp. 17–20, citing Lazard/Jefferies/Houlihan Lokey/Evercore). All confidence levels below reflect that second pass.

---

## TL;DR verdict

Continuum's model is **mostly credible and notably better than typical demos** — it gets the big things right: competitive price discovery, %-of-NAV pricing, sealed buyer bids, peer-private LP elections, **default = sell**, atomic settlement. But three things read as **naive to a secondaries professional** and should be fixed:

1. **Pricing mechanics** — real deals are a **lead-investor + syndicate** model (lead underwrites and *sets the price for all investors*; syndicate joins at substantially the *same* price/terms; the **sponsor/GP controls who is admitted and runs the process — the lead sets price, not allocation**), reached through a **staged, competitive, mutually-blind process** (NDA/data-room → ~3 finalists submit priced bids to win lead → terms aligned) — not a single flat sealed-bid round among equal buyers with pro-rata-from-capacity allocation. *[CFA Institute Sept 2025 — HIGH confidence]*
2. **LPAC consent is a PRE-CLOSE GATING step**, not post-close oversight. Continuum relegates LPAC/oversight to after settlement — the single most visible miss.
3. **LP options are three-way** (sell / roll / **status quo** on unchanged terms) with a **concrete election window (≥30 calendar / 20 business days)**, and **LPs can never be forced to roll**.

Fix those and a secondaries pro would find it believable.

---

## A. Price discovery — is "sealed-bid auction among many buyers" accurate?

**Partly. Right instinct, wrong mechanics.**

- **Competitive process is correct and expected.** ILPA's guidance mandates a *competitive bid-solicitation process run by an engaged third-party advisor with independent third-party price validation*; the LPAC reviews "the number, range and content of bids considered" and why the "winning bid" was selected. So advisor-run competitive tension + a single winning bid is real — not pure bilateral negotiation. (ILPA Continuation Funds guidance, May 2023; Ropes & Gray summary.)
- **It's a LEAD-INVESTOR + SYNDICATE structure, not a flat field of equal sealed bidders.** CFA Institute (Sept 2025, p. 20): *"The lead investor sets the price for all investors."* A *lead* (occasionally co-leads) underwrites a large commitment; a *syndicate* of additional investors joins — typically later, in a **syndication round** — at substantially the same price/terms (*"a single standard set of terms for all bids, although slight deviations may remain,"* p. 19). **The sponsor/GP, via its agent, runs the process, selects the lead, and controls who is admitted to the syndicate — the lead sets price, NOT allocation** (*"The bidding process is completed when the GP selects the lead investor,"* p. 20). **HIGH confidence.** (CFA Institute *Continuation Funds: Ethics in Private Markets Part I*, Sept 2025; Lazard 2025; GCM Grosvenor 2026.)
- **Process is staged and mutually-blind, not a single sealed round — but the stages differ from generic M&A.** Real shape (CFA pp. 18–20): agent markets to ~25 parties → NDA + **data-room diligence up-front** → ~3 finalists → **stage 1: each finalist bids a specific price (% of NAV) + size to win the lead role → GP selects lead** → **stage 2: align all non-price terms (fee, carry, hurdle, GP commitment)** → LPAC approval/fairness opinion → close. Finalists are **blind to one another** (*"None of the finalists knows which or how many other parties are bidding,"* p. 19) and the GP "plays the bidders off each other" (p. 20). **MEDIUM-HIGH confidence.** Note: this is NOT a generic "non-binding IOI → confirmatory DD → binding SPA" ladder, and a **formal pre-binding exclusivity grant to the lead is only weakly evidenced for CVs** — don't assert it. (CFA Institute Sept 2025; Lazard 2025.)
- **Pricing convention = % of reference NAV, clearing near par.** Single-asset CVs cluster near NAV: **~87% priced above 90% of NAV, and ~67% of single-asset deals above 95% of NAV in 2025 — both figures attributable specifically to Lazard's *Secondary Market Report 2025*** (pp. 11–12), not a generic advisor blend. LP-portfolio pricing ran high-80s to ~90% of NAV (Jefferies: 90% in H1 2025; funds <5yrs ~95%, tail-end ~73%). Deep-discount auction framing is wrong for CVs. (Lazard 2025; Jefferies H1 2025.)
- **Single-asset CVs dominate** (~53–64% of GP-led/CV volume) — validates Continuum's single-asset focus. (Jefferies; GCM Grosvenor.)
- **Named runners:** Jefferies, Evercore, Lazard, PJT Park Hill, Campbell Lutyens — advisor-run competitive processes are standard; a pre-identified lead is also standard *within* that process. Both coexist.

**Verdict:** keep sealed-bid privacy as the demo hook, but reframe the winner as a **lead** that the **syndicate joins at the lead price**, with **sponsor-controlled allocation**. Ideally show indicative→binding staging.

## B. Weak-demand / low-bid scenario

- **LPs can NEVER be forced to roll; a real cash-out option must always exist.** (ILPA; Norton Rose Fulbright; Debevoise.) ✅ validates Continuum's design intent.
- **Default for non-responders = SELL / cash out** (not roll, not status quo). (ILPA, multiple summaries.) ✅ directly validates Continuum's `default = sell`.
- **"Status quo" option = roll on UNCHANGED economic terms** (no fee/carry rate increase, no carry crystallization for rollers); ILPA treats it as a **should-always-be-offered** norm, with no minimum-threshold roll participation to access it. (ILPA May 2023, p. 10.) ⚠️ **Correction from first pass: the "~40% of CVs offer it" statistic is UNSUPPORTED** — not traceable to ILPA, GCM Grosvenor, or any primary review; drop it. (Verification pass.)
- **GP can walk via DUAL-TRACK / broken-deal, not a "reserve price."** ⚠️ **"Reserve price" is NOT a market term of art** — no primary source (ILPA, Jefferies, Kirkland, Skadden) uses it; drop the phrase. What IS real:
  - **Price = the winning competitive bid + fairness opinion**, not a pre-set minimum. Skadden (May 2024): *"The purchase price is typically determined by third parties (the buyers…), often through an auction process run by a financial advisor."* Mercer (Oct 2025): *"The proposal with the combination of the best price and terms with confirmed access to capital will be selected to transact."*
  - **Dual-track price validation** (strongest finding): GPs often sell a **minority stake to a third party** alongside the CV to prove the price is arm's-length. Skadden: *"combined with the sale of a minority stake in the underlying asset to a third party through a traditional exit process."* Lexology *"The Evolving Dual Track"*: the Minority Co-Investor *"helps to provide independent validation that the commercial deal is arm's length in terms of price."* ILPA requires GPs to disclose the justification for a CV *"as opposed to alternative options, such as a fund extension or third party sale."*
  - **Deals can not-proceed** ("broken-deal" is a provisioned-for outcome; pricing-gap collapse is a primary reason CV deals fail) — Global Legal Insights fund-finance guide.
  - **De-facto near-NAV floor:** ~90% of single-asset deals priced ≥90% of NAV in 2024 (Lazard via Mercer). Behavioral, not contractual (NAV is GP-controlled; contested-value litigation exists).
  - ❌ **GP/lead does NOT backstop or pay above the buyer's cleared price** — Macfarlanes: the sponsor sits on the sell side; the third-party bid is the price.
  - **Net: MEDIUM confidence** (up from LOW). Substance confirmed (dual-track validation, decline-to-proceed, near-NAV floor); reject "reserve price" and "GP backstop."

## C. LP choice, conflicts, governance

- **Three real options + status quo:** roll (and optionally buy more) / sell (full or partial) / **status quo on existing terms** — a genuine three-way choice with adequate time. (ILPA; Norton Rose Fulbright.)
- **Election window:** ILPA recommends **≥30 calendar days / 20 business days** for the roll-or-sell decision (verbatim, p. 9: *"no less than 30 calendar days/20 business days"*, and "strive to provide more"). *Note: "criticizes ~10-day timelines" is a fair paraphrase of ILPA's rationale, not a verbatim quote in the 2023 core guidance.* (ILPA.)
- **LPAC consent is a gating, pre-signing step:** LPAC gets **≥10 business days** to evaluate, with disclosure of valuation, comparables, basis for adviser selection, and **conflicts** — and must **formally evaluate/waive conflicts even when the LPA has anticipatory waivers** (ILPA says LPA language should *not* include a presumptive conflict waiver). LPAC consults **early** and reviews terms **no less than 10 business days prior to signing the acquisition agreement.** (ILPA; Goodwin; Morrison Foerster "What LPACs Look For," Nov 2025.)
- **Fairness opinion is CONDITIONAL, not mandatory.** ILPA (verbatim): a fairness opinion *"In certain instances"* may benefit selling LPs, who *"as a group may request"* one. The **SEC adviser-led-secondaries rule that *would* have mandated a fairness/valuation opinion (Rule 211(h)(2)-2) was VACATED** by the 5th Circuit on **June 5, 2024** (*Nat'l Ass'n of Private Fund Managers v. SEC*, No. 23-60471) — entire Private Fund Adviser Rules struck for lack of statutory authority; SEC confirmed not in effect (announcement Oct 31, 2024). So the fairness opinion is now **market best practice, not a legal requirement.** (Morgan Lewis; Morrison Foerster; SEC.gov; Willkie.)
- **Conflict of interest is the core regulatory risk** (GP on both buy- and sell-side). Governance path = competitive marketing → conflict disclosure → **LPAC waiver/consent** → (often) third-party fairness/valuation opinion. SEC 2025 exam priorities still flag adviser-led secondaries; these can be **principal transactions** (Advisers Act §206(3) written disclosure + consent). (ACA Group; Mercer Capital; SEC.)
- **LPAC ≠ single neutral viewer:** members whose own institution's secondary arm is bidding **recuse**. (Morrison Foerster.)

## D. Real sequence vs the 7-step model

Real end-to-end (**3–9 months**): origination (often dual-track) → advisor mandate → teaser/marketing → NDA/dataroom → buyer diligence → **indicative bids → lead selection** → confirmatory diligence → **binding bid/SPA** → fairness opinion (if used) → **LPAC consent** → **LP election/rollover (≥30 days)** → closing (transfers often quarterly; ROFR/GP approvals can gate). (Jefferies; Kirkland; Debevoise; Ropes & Gray.)

| Real step | Continuum | Gap |
|---|---|---|
| Origination / dual-track | implicit (Setup) | minor — no M&A-alternative framing |
| Advisor mandate, teaser, NDA, dataroom, diligence | compressed into Setup/Documents | acceptable for a prototype |
| **Indicative → lead selection → binding** | single sealed round → clearing | **simplified — flag** |
| Lead + syndicate at lead price | "clearing/lead price; optional syndicate" | partial — make lead+syndicate explicit |
| Fairness opinion | inline "validates the price" | **reframe — conditional, supports LPAC, not auto-validate** |
| **LPAC consent (pre-close gate)** | **post-close Oversight** | **biggest miss — move to pre-close gate** |
| LP election, roll/sell/**status quo**, ≥30d | roll/sell + default sell + amend | **add status quo + concrete window** |
| Closing (atomic in proto; quarterly in reality) | atomic settlement | fine for prototype |

**What an institutional viewer notices immediately:** (1) LPAC consent missing as a pre-close gate; (2) no status-quo option; (3) flat-auction allocation instead of lead+syndicate / sponsor-controlled.

## E. Model corrections (mapped to PORTAL_BRIEF.md)

| # | Correction | Why (source) | Change in PORTAL_BRIEF.md |
|---|---|---|---|
| 1 | **[HIGH] Lead + syndicate at lead price; sponsor-controlled allocation.** Winning bid = *lead* who **sets the price for all**; syndicate joins later at the same price/terms; **GP/advisor selects the lead and controls who is admitted — lead sets price, not allocation.** | CFA Institute *Ethics in Private Markets Pt I* (Sept 2025, pp. 17–20): "The lead investor sets the price for all investors"; "The bidding process is completed when the GP selects the lead investor." Lazard 2025. | §Scope Bids/Pricing (step 3) + §Allocation (step 5) + §Data-seed buyers (designate lead, others "syndicate @ lead price", status `lead`/`syndicate`/`passed`). |
| 2 | **[CONFIRMED] LPAC consent = pre-close gating step, not post-close oversight.** Add an LPAC consent gate (conflict disclosure + ≥10 biz-day review) that must pass *before* settlement. | ILPA (p. 9): convene LPAC "no less than 10 business days before finalizing the terms… for LP election"; "Conflict approvals should guide the process but should not include a presumptive waiver." Goodwin; MoFo Nov 2025. | §Scope process (move/duplicate step 8 → gate before step 7) + §IA role table (LPAC sees conflict+fairness package pre-close and **votes**; not "nothing pre-close") + screens (LPAC consent panel + task-queue item). |
| 3 | **[CONFIRMED — drop the % stat] Three-way LP election: sell / roll / status-quo (unchanged terms).** Add status-quo alongside roll/sell; keep default = sell; never force a roll. | ILPA (p. 10): status-quo with "no increase to the carried interest rate," "no crystallization," "no minimum threshold roll participation"; (p. 9) "LPs should never be forced to roll." ⚠️ **"~40% offer it" is UNSUPPORTED — remove it.** | §Scope Elections (step 4) + §Data-seed (election-status enum: rolling / selling / status-quo / split) + Elections screen. |
| 4 | **[CONFIRMED] Fairness opinion is conditional best-practice, not a hard price-validator; SEC mandate vacated.** Pair it with the LPAC decision rather than "validates the price." | ILPA: beneficial "in certain instances"; SEC Rule 211(h)(2)-2 vacated 5th Cir **June 5, 2024** (Morgan Lewis; MoFo; SEC.gov). | §Scope Bids/Pricing (reword) + §Documents (fairness opinion = supporting doc for LPAC) + remove any "fairness opinion auto-validates" copy. |
| 5 | **[CONFIRMED] Concrete election + review windows.** Show election window ≥30 calendar / 20 business days; LPAC review ≥10 business days. | ILPA (p. 9) verbatim "no less than 30 calendar days/20 business days." | §Data-seed (deal deadlines) + deal-header key figures (replace vague "election deadline"). |
| 6 | **[MEDIUM-HIGH] Staged, mutually-blind price discovery.** Stage 1 = priced bids (% NAV) to win lead → GP selects lead; Stage 2 = align non-price terms. Finalists blind to each other. Label bid status in the book/audit. **Don't** assert a formal pre-binding exclusivity grant (weakly evidenced). | CFA Institute (Sept 2025, pp. 18–20): ~25 parties → NDA/data-room → ~3 finalists → price bid → lead → terms alignment; "None of the finalists knows… other parties are bidding." | §Scope Bids/Pricing (step 3) + Bids tab status column + Audit feed. *Optional depth; at minimum a stage/status label.* |
| 7 | **[MEDIUM — reworded] Dual-track / decline-to-proceed path; NO "reserve price," NO GP backstop.** Price = winning bid + fairness opinion; GP can let the deal not-proceed (broken-deal) if price is unacceptable; a parallel third-party/minority sale validates arm's-length price. | Skadden (May 2024); Mercer (Oct 2025); Lexology "Evolving Dual Track"; ILPA (disclose "third party sale" alternative); Global Legal Insights (broken-deal). ⚠️ **"reserve price" is not a market term; GPs do NOT pay above the cleared bid (Macfarlanes).** | §Scope process (Allocation/Settlement) + Advisor task queue ("decline to proceed" action) + §Documents (optional minority-sale validation ref) + screens. |

---

## Drop-in replacement — "Scope — implement the FULL process (R1 + R2)"

> Replace the existing §Scope process block (lines ~48–69) with the following.

### Scope — implement the FULL process (R1 + R2)

Build the complete deal, not a sliced release (R1 walking skeleton + R2 user stories). Notably **R2 is in scope**, including:

- **Sealed-bid → lead-investor pricing** — multiple buyers submit sealed bids (% of NAV + capacity) blind to one another; the advisor runs the process and **selects a lead, who sets the price for all**. A **syndicate joins later at the lead's price and terms**; the **advisor (sponsor) selects the lead and controls who is admitted** (lead sets price, not allocation). (Buyer-price-privacy is the hero story — keep sealed bids visible.) Optionally show two stages: **priced bids to win lead → terms alignment**.
- **Multiple LPs** in the fund register, each electing privately (peer-private), with a **three-way choice — sell / roll / status-quo (unchanged terms)** — **split allowed**, **amend before deadline**, **default = sell**, and an election window of **≥30 days**. LPs can never be forced to roll.
- **LPAC consent as a pre-close gate** — before settlement, the LPAC receives a scoped conflict-disclosure + valuation/fairness package and must **consent/waive conflicts** (≥10-business-day review). Settlement cannot run until consent is recorded.
- **Fairness/valuation opinion** as a **supporting document** for the LPAC decision (conditional best-practice, not a legal mandate post-2024 SEC vacatur) — not an automatic price validator.
- **Pro-rata + lead/syndicate backstop** if sell-demand exceeds buyer capacity, with **sponsor-controlled allocation**.
- **Preview the close** before settlement; **advisor "decline to proceed"** path if pricing is unacceptable (dual-track framing); **cancel/withdraw a leg** before close.
- **Atomic settlement** — one action settles all legs or none.
- Post-close scoped **oversight/audit** view; **flywheel** (returning buyer reuses credential, bids in one click on deal #2).

#### Modeled as workspace sections (not narrated steps)

1. **Setup** (Advisor) — create CV, asset, reference NAV, terms; invite N LPs + M buyers.
2. **Participants** — register: LPs with positions; buyers verified via reusable eligibility credential.
3. **Bids / Pricing — the process** (Buyers + Advisor) — each buyer submits a **sealed bid** (% NAV + capacity), blind to others. Advisor sees the bid book; each buyer sees only its own. At the deadline the advisor selects a **lead** (price-setting bid); the lead price is disclosed; the **syndicate joins at the lead price** (optionally a later round); non-price terms aligned with the lead.
4. **Elections** (LPs) — each LP privately elects **sell / roll / status-quo** (split allowed; amend until deadline; default = sell) at the lead price. Advisor sees only that an election is *filed*.
5. **Allocation** (Advisor) — size the close from elections at the lead price; **pro-rata + lead/syndicate backstop**, **sponsor-controlled** allocation; **preview** legs; tie-out (sum in = sum out).
6. **LPAC consent** (LPAC) — scoped conflict + valuation/fairness package; LPAC **votes to consent/waive conflicts**; this **gates** settlement. Recusal supported.
7. **Approvals** (each party) — each authorizes only its own leg; may cancel/withdraw before close.
8. **Settlement** (Advisor) — one atomic action settles every leg; **forced-failure** toggle rolls everything back. Advisor may **decline to proceed** instead.
9. **Oversight / Audit** — post-close scoped fairness/audit view (LPAC's pre-close gate is separate — see step 6).
10. **Flywheel** — start deal #2; returning buyer reuses verification, bids in one click.

---

## Credibility verdict (one paragraph)

A secondaries professional would find Continuum's process **broadly believable and unusually well-informed for a prototype** — it nails competitive price discovery, %-of-NAV pricing, sealed buyer bids, peer-private elections, default-to-sell, and atomic settlement, all of which match ILPA guidance and advisor market practice. It would read as **naive on three points**, which are the top fixes: **(1)** model pricing as **lead + syndicate at the lead price with sponsor-controlled allocation** (and ideally indicative→binding staging), not a flat sealed-bid clearing auction; **(2)** make **LPAC consent a pre-close gating step** (conflict waiver + ≥10-business-day review), not post-close decoration; **(3)** give LPs the **three-way sell/roll/status-quo choice over a ≥30-day window** and reframe the **fairness opinion as a conditional supporting document** (SEC mandate vacated June 2024), not an automatic price validator.

---

### Sources

**Primary / anchor:** ILPA, *Continuation Funds: Considerations for LPs and GPs* (May 2023, primary PDF) · **CFA Institute, *Continuation Funds: Ethics in Private Markets, Part I* (Deane & Robinson, Sept 2025)** — https://rpc.cfainstitute.org/sites/default/files/docs/research-reports/rpc_deane_continuationfunds-ethicsinprivatemarkets_pti_online.pdf · ILPA Continuation Fund Disclosure Template (2026).
**Advisor market reviews:** Lazard *Secondary Market Report 2025* (single-asset pricing) · Jefferies Global Secondary Market Review (Jan 2025 + H1 2025) · Evercore / Houlihan Lokey / William Blair (via CFA & Mercer) · GCM Grosvenor (2026 CV market).
**Law firms / governance:** Morgan Lewis & Morrison Foerster (5th Cir vacatur; "What LPACs Look For," Nov 2025) · Skadden ("Continuation Funds: What You Need To Know," May 2024) · Macfarlanes (structuring/terms) · Goodwin · Debevoise · Kirkland & Ellis · Norton Rose Fulbright · Ropes & Gray · Willkie · Lexology ("The Evolving Dual Track") · Global Legal Insights (fund finance / broken-deal).
**Regulator / other:** SEC.gov (Private Fund Advisers Rules announcement) · ACA Group · Mercer Capital (fairness opinions, Oct 2025) · NatLawReview (ILPA template / Coller mock) · Evalueserve · Industry Ventures · ION Analytics/Mergermarket.

> **Verification status (post second pass):** Corrections #1, #2, #4, #5 = **CONFIRMED** against primary sources (CFA Institute, ILPA, Morgan Lewis/MoFo). #6 = **MEDIUM-HIGH** (staged + mutually-blind confirmed by CFA; don't assert pre-binding exclusivity). #7 = **MEDIUM, reworded** — dual-track validation, decline-to-proceed/broken-deal, and a near-NAV de-facto floor are real; **"reserve price" is not a market term and GPs do not backstop above the cleared bid — both removed.** #3 core confirmed but **the "~40% offer status-quo" statistic was unsupported and has been dropped.**
