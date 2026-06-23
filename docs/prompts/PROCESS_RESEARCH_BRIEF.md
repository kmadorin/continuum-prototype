# Research Brief — Does Continuum's deal model match how real GP-led continuation deals work?

> Paste-and-go research prompt for a **fresh chat with web access**.
> Goal: ground-truth Continuum's modeled process against how GP-led continuation /
> single-asset secondary deals actually run, then produce concrete corrections to our
> build brief (`docs/prompts/PORTAL_BRIEF.md`). Cite sources.
>
> Tip: this is a good fit for the `deep-research` skill — run it with this file's body
> as the question/args. Otherwise run in any chat with web search + fetch.

---

## What you're validating

**Continuum** is a confidential "closing room" for GP-led continuation-fund deals. An
advisor/GP runs a deal where some LPs cash out and others roll into a new continuation
vehicle (CV), a secondary buyer funds the cash-out, and everything settles atomically.
We are building an interactive UX prototype and need its *process model* to be credible
to an institutional secondaries audience (GPs, secondaries buyers, fund admins, LPs,
LPACs).

**The process as we currently model it** (verify each step against reality):

1. Advisor opens a deal room for a CV; names the fund, the new vehicle, the asset, a
   reference NAV (as-of date), and terms; invites **multiple LPs** and **multiple
   secondary buyers**.
2. **Pricing = sealed-bid auction:** each buyer submits a sealed bid (price as % of NAV
   + capacity), **blind to the other buyers**. At a deadline the advisor opens the bid
   book; the **best qualifying bid becomes the clearing/lead price**; a **fairness
   opinion** validates it; the price is **disclosed to the room**.
3. **LP elections:** each LP privately elects to **roll** into the CV or **sell** at the
   clearing price (split allowed; amend until deadline; **default = sell**); peers can't
   see each other's elections; the advisor sees only that an election is *filed*.
4. **Allocation:** the close is sized from elections at the clearing price; **pro-rata +
   lead/syndicate backstop** if sell-demand exceeds buyer capacity; previewed before
   settlement.
5. **Atomic settlement:** one action settles all legs (cash → exiting LPs, units →
   rolling LPs + buyers, asset → CV) or none.
6. **Oversight:** LPAC/regulator gets a scoped post-close fairness view.
7. **Flywheel:** a returning buyer reuses its eligibility credential and bids again with
   no re-onboarding.

---

## Core questions to answer (with citations)

**A. Price discovery — is the "sealed-bid auction among many buyers" accurate?**
- How is price actually set in GP-led CV / single-asset secondaries: a **lead-investor
  process**, a **structured auction** run by an advisor, bilateral negotiation, or a mix?
- Is price set by a single **lead** with a **syndicate joining at the lead's price**, or
  by a uniform clearing across multiple winners? How are bids collected (single sealed
  round, staged/indicative→binding, "best and final")?
- Who runs these processes (named secondaries advisors)? How standard is competitive
  tension vs a pre-identified lead?

**B. The weak-demand / low-bid scenario (the user's key doubt).**
- If the competitive process clears at a price LPs consider **too low**, but those LPs
  still want liquidity — **what does the GP actually do?** Specifically:
  - Is there a **reserve / minimum price** the GP sets in advance?
  - Can the GP **pull / not transact** if pricing is unacceptable? How common is that?
  - Does the GP or lead ever **backstop / improve** the price? Or is the buyer's price
    simply the price (GPs don't pay above market)?
  - Can LPs be **forced to roll**, or do they always have a real cash-out option? What
    is the **"status quo" option** and how does it work?
  - What happens to LPs who don't respond by the deadline — **default to sell, default
    to roll, or default to status quo**? (This varies; find what's typical / what ILPA
    recommends.)

**C. LP choice, conflicts, and governance.**
- What options do LPs really get (sell / roll / status quo), and on what timeline?
- Role of the **fairness / valuation opinion**, **LPAC consent**, and **conflict
  disclosure**. Summarize **ILPA's Continuation Funds guidance (2023)** and the **SEC
  Private Fund Adviser rules** requirement for an adviser-led-secondary fairness or
  valuation opinion (note current legal status of those rules).

**D. Full real-world process vs our model — gaps.**
- Map the real sequence (origination → advisor mandate → teaser/marketing → NDA/dataroom
  → buyer diligence → indicative bids → lead selection → confirmatory diligence →
  binding bid/SPA → fairness opinion → LPAC consent → LP election/rollover → closing).
- Which steps does our 7-step model capture, simplify, or skip? Which omissions would an
  institutional viewer notice immediately?

**E. Verdict + corrections.**
- Is Continuum's model **realistic enough** to be credible to secondaries professionals?
  What reads as wrong or naive today?
- Give **3-7 concrete model corrections**, each mapped to where it changes our build
  brief (`PORTAL_BRIEF.md`) — process flow, seeded data, and/or screens. Examples of the
  kind of correction we want: "add a reserve price + 'decline to proceed' path", "price
  = lead bid not uniform clearing", "elections are roll/sell/status-quo with X default",
  "fairness opinion + LPAC consent are gating steps, not post-close decoration".

---

## Sources to prioritize (verify, don't just trust these)

- **ILPA** — *Continuation Funds* guidance / GP-led secondaries best practices (2023).
- **Secondaries advisors' market reviews & primers** — Jefferies (Global Secondary
  Market Review / H1 & FY), Evercore, Lazard, PJT Park Hill, Campbell Lutyens, Houlihan
  Lokey, Raymond James/Cebile. (Pricing as % of NAV, lead-investor mechanics, process
  structure.)
- **Law-firm explainers** — Kirkland & Ellis, Debevoise, Ropes & Gray, Goodwin, Morgan
  Lewis, Proskauer on GP-led secondaries / continuation vehicles (process, conflicts,
  LPAC, status-quo option, fairness opinions).
- **SEC** — Private Fund Adviser Rules, adviser-led secondaries provision (fairness/
  valuation opinion); note the 5th Circuit vacatur and current status.
- **Trade press** — Secondaries Investor, Buyouts, PE International for recent deal
  mechanics and pricing context.

Prefer primary/industry sources over blog summaries. Flag anything where sources
disagree or where practice varies (e.g., default election treatment).

---

## Required output

1. **Answers to A–E** with inline citations (source + link).
2. A **"Model corrections" table**: each correction → why (with source) → exactly what to
   change in `PORTAL_BRIEF.md` (which section: process, data, or screens).
3. **Drop-in replacement copy** for the brief's "Scope — implement the FULL process"
   section reflecting the corrected model.
4. A one-paragraph **credibility verdict**: would a secondaries professional find this
   prototype's process believable, and what are the top 3 fixes.

Keep it tight and decision-useful — this feeds directly back into the build brief, not a
literature review.
