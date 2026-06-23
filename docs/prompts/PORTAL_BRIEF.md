# Build Brief — Continuum Portal (Real-Service Prototype, R1 + R2)

> Paste-and-go build prompt for a fresh Claude Code session.
> The session must already be launched with the design system loaded and Claude for Chrome enabled — see `start-portal.sh` / `docs/prompts/LAUNCH.md`.

## Mission

Evolve the existing portal at `portal/` into something that reads like a **real software product a fund advisor and their counterparties would actually log into** to run a GP-led continuation deal end to end — covering the **full process (R1 + R2)**, including a **sealed-bid buyer auction** and **multiple LPs**.

There is already a portal in `portal/`. **It fails the bar: it reads like our spec rendered as HTML, not a working service.** Your job is to fix exactly that. Read the next section before anything else — it is the whole point of this build.

**No Canton. No backend. No real crypto.** All ledger/settlement/auction behavior stays simulated in-memory with plain JavaScript. This is a UX/flow prototype.

---

## ⚠️ DESIGN STANCE — build a product, not an interactive spec (read first)

The current portal turned the spec into a webpage: the 8-step lifecycle became the navigation, the spec's explanatory prose became on-screen paragraphs, and the walking-skeleton narration became "YOUR MOVE" coaching. The result feels like documentation, not a tool. **Do not repeat this.**

### Anti-patterns — DO NOT do these (each one is currently in the build)

1. **Lifecycle-as-navigation.** The left rail is the 8 spec steps ("Set up the room → … → Prove it was fair"). A real app does NOT navigate by narrative step. Kill the step-rail-as-nav.
2. **Teaching lede on every screen.** Every view opens with a big editorial headline + a paragraph explaining what this step is for ("Name the fund, the new vehicle… Invited parties see the shell…"). Real tools don't teach; they show data. Delete the teaching prose.
3. **"YOUR MOVE" coaching callouts.** Turn-taking narration that tells the user what to do next. Replace with a real **task / approvals queue**.
4. **Blank "waiting / room not open yet" cards.** When a party has no immediate action, the screen is an empty locked card. Real tools still show a populated workspace (the deal, your position, documents, activity).
5. **One card per screen, oceans of empty space.** Low density reads as "doc." Fill the workspace with real tables and panels.
6. **Toy data.** 1 deal, 1 buyer, 2 LPs. Sparse data is the #1 reason it feels fake.

### What to build instead

1. **Object-centric IA.** Navigate by *things*, not steps. Persistent left sidebar of destinations. Inside a deal, a section sub-nav: **Overview · Participants · Bids / Pricing · Elections · Allocation · Settlement · Documents · Audit**. The lifecycle stage appears as a **status pill + progress meter**, never as the primary navigation.
2. **Task-driven, not narrated.** A **"Needs you (N)"** task/approvals queue is the home surface. Actions live inside the relevant section (approve a leg on the Settlement tab, submit a bid on the Bids tab), not in a coached linear flow.
3. **Dense, real tables.** An **investor register** (LP, type, commitment, NAV, ownership %, election status). A **bid book** (buyer, bid % of NAV, capacity, status). A **settlement legs** table (leg, from→to, amount, status, value date, ref). An **activity / audit log** (timestamp · actor · event).
4. **Show, don't narrate.** Terse section headers ("Investor register", "Bid book", "Settlement"). Numbers, statuses, and tables carry the meaning. At most a single muted one-line hint where genuinely needed. No paragraphs explaining the concept.
5. **Empty-but-active states.** A party waiting on others still sees its deal overview, its own position/credential, the document index, and the activity feed — never a blank card.
6. **Receipts, not teaching diagrams.** Post-close shows a settlement confirmation (settlement id, timestamp, value date, leg refs, downloadable), not a "Before → After" pedagogical diagram.

### Real comparables to channel (look-and-feel reference)

- **Cap table / investor register:** Carta, Juniper Square, Allvue — investor lists, capital accounts, position rows.
- **Deal / data room:** Datasite, Ansarada, Intralinks — deal header, document index, participant permissions, activity.
- **Settlement / payments console:** a banking ops view — legs with statuses, value dates, references.

When in doubt, ask: *"would this screen exist in Carta / a deal room / a payments console?"* If it looks like a slide explaining a process, it's wrong.

---

## Scope — implement the FULL process (R1 + R2)

Build the complete deal, not a sliced release. This implements both the R1 walking skeleton AND the R2 user stories from the spec (`docs/specs/2026-06-21-continuum-story-map-design.md` §3, R2 band of the story map). Notably **R2 is in scope**, including:

- **Sealed-bid buyer auction** — multiple buyers submit sealed bids blind to one another; the advisor runs the auction; the clearing/lead bid sets the disclosed price. (This is the buyer-price-privacy story — it's essential to understanding how the whole thing works, so it must be present.)
- **Multiple LPs** in the fund register, each electing privately (peer-private), with **split roll/sell**, **amend before deadline**, and **default = sell**.
- **Pro-rata + lead/syndicate backstop** if sell-demand exceeds buyer capacity.
- **Preview the close** before triggering settlement; **cancel/withdraw a leg** before close.
- Post-close scoped **oversight** view; **flywheel** (returning buyer reuses credential, bids in one click on deal #2).

### The process, modeled as workspace sections (not narrated steps)

1. **Setup** (Advisor) — create the continuation vehicle, asset, reference NAV, terms; invite the participant set (N LPs, M buyers).
2. **Participants** — roster/register: LPs with positions; buyers verified via reusable eligibility credential.
3. **Bids / Pricing — the auction** (Buyers + Advisor) — each buyer submits a **sealed bid** (% of NAV + capacity), blind to other buyers. Advisor sees the **bid book**; each buyer sees only its own bid. At the deadline the advisor opens the book; the best qualifying bid becomes the **clearing/lead price**; a **fairness opinion** validates it; the clearing price is **disclosed to the room**. Lead (+ optional syndicate at the same price) will absorb sell demand.
4. **Elections** (LPs) — each LP privately rolls or sells (split allowed; amend until deadline; default sell) **at the clearing price**. Advisor sees only that an election is *filed*, never its contents; no LP sees another's.
5. **Allocation** (Advisor) — size the close from the elections at the clearing price; **pro-rata + lead backstop** if oversubscribed; **preview** the legs; numbers tie out (sum in = sum out).
6. **Approvals** (each party) — each authorizes only its own leg; may cancel/withdraw a leg before close.
7. **Settlement** (Advisor) — one atomic action settles every leg together; **forced-failure** toggle rolls the whole thing back (nothing moves).
8. **Oversight** (LPAC/Regulator) — scoped post-close fairness view; nothing live pre-close.
9. **Flywheel** — start deal #2; returning buyer reuses verification and bids in one click.

---

## Information architecture (per role)

Persistent app shell on every role page:

- **Top bar:** brand, deal switcher/badge, logged-in identity, discreet **"demo: jump to role"** control, **Reset demo**.
- **Left sidebar (global destinations):** Dashboard · Deals · Tasks · Participants · Documents · (Settings). Highlight current. This is the app's spine — NOT the lifecycle.
- **Home / Dashboard:** the **task queue** ("Needs you (N)") + a **deals list** (a small pipeline, statuses, your role's pending item) + key metrics. Not a hero headline.
- **Deal workspace:** a deal header (vehicle name, status pill, progress meter, key figures: reference NAV, clearing price once set, election deadline) + a **section sub-nav** (Overview · Participants · Bids/Pricing · Elections · Allocation · Settlement · Documents · Audit). Each section is a real panel/table, scoped to what this role may see.

Per-role visibility (preserve the privacy model exactly — render redaction consistently as `•••• sealed` with a "you can't see this" treatment):

| Role | Primary surfaces | Sees |
|---|---|---|
| Advisor / Organizer | all sections; runs auction, computes, settles | full bid book; LP elections only as "filed" markers (not contents); full register |
| Secondary Buyer | Bids/Pricing, own position, documents | own bid only + (post-clearing) the clearing price; never other buyers' bids |
| Investor — Staying (Rolling LP) | Elections, own position, register (own row detailed; others' elections redacted) | own election; clearing price; peers' elections redacted |
| Investor — Leaving (Exiting LP) | Elections, own position | own election; clearing price; peers redacted |
| Oversight — LPAC | nothing pre-close; post-close Audit/fairness | redacted until close, then scoped verification view |

---

## Data to seed (moderate density)

Enough to read as real; not a stress test.

- **Deals:** 1 hero deal (Meridian CV I) shown in full + a 2nd deal (Brightwater CV I) for the flywheel. Optionally 1-2 more as greyed pipeline rows on the Deals list for texture.
- **LPs (fund register, ~8):** the 2 hero LPs — **Hawthorn Pension** (rolling) and **Calder Family Office** (leaving) — plus ~6 realistic background LPs (e.g. pensions, endowments, family offices, a fund-of-funds) with names, type, committed capital, NAV, ownership %, and election status. Numbers must tie out against fund NAV.
- **Buyers (auction, 3-4):** **Northbeam Secondaries** + 2-3 others (e.g. a pension secondaries arm, a dedicated secondaries fund, a bank's GP-solutions desk) with sealed bids (% of NAV), capacity, and status (bid in / passed / lead). One becomes the clearing/lead.
- **Documents:** a small index (LPA, fairness opinion, PPM/transaction memo, election form, purchase agreement) with type, owner, status.
- **Activity/audit:** a feed of timestamped events with actors (room opened, buyer X bid filed, price cleared, LP election filed, leg approved, close settled).

Keep all the financial math consistent and tying out, building on the existing engine (see below).

---

## Reuse — evolve `portal/` in place, don't start from zero

Keep what works; replace what fails.

- **Keep:** `portal/shared/sync.js` (localStorage + BroadcastChannel live multi-tab sync — works, keep it). The **design tokens** in `portal/shared/styles.css` (dark institutional, cyan accent, Archivo + IBM Plex Mono, 1px borders, no shadows, sharp corners) — keep the tokens, extend components. The **financial engine** in `portal/shared/state.js` / the math from `prototype/app.js` (NAV, units, cash, allocation, tie-out, atomic close + forced-failure) — keep and **extend** it for multi-buyer auction + multi-LP + clearing/backstop.
- **Replace:** the navigation model (kill the lifecycle rail-as-nav → object-centric sidebar + section sub-nav), every role view (kill teaching lede / YOUR MOVE / blank waiting cards → dense panels + tables + task queue), and the seed data (toy → moderate as above).
- **Add:** the bid book + auction logic, the investor register, the task queue, the documents index, the activity/audit log, the settlement legs table, confirmation receipts.

Keep the live multi-tab sync working: opening Advisor + a Buyer + an LP in separate tabs should stay in sync, and the atomic close should animate across all tabs.

---

## Hard constraints

- **Static front-end only.** Plain HTML + CSS + vanilla JS. **No build step, no framework, no server logic.** Must run by opening `portal/index.html` and via `python3 -m http.server` from `portal/`.
- **All state in memory + localStorage/BroadcastChannel**, seeded in JS. Keep a visible **Reset demo** control.
- **No Canton, no wallets, no real tokens, no network calls.** **No Canton/Daml jargon in the UI** — plain business language. Keep the small "Simulation — no Canton, no wallets" footnote subtle.
- **Privacy made visible** — sealed bids/elections render redacted to parties who shouldn't see them.
- **Atomic settlement** — one action moves every leg; forced-failure moves nothing.
- **Accessible:** semantic HTML, keyboard navigable, WCAG AA contrast, visible focus rings (never removed), `prefers-reduced-motion` respected.

## Design direction

- **Keep the established visual language** from `portal/shared/styles.css` / `prototype/styles.css` and `design/pitch-design-tokens.md`: dark institutional theme, cyan accent (`oklch(76% 0.135 162)`), Archivo + IBM Plex Mono, sharp corners, 1px grid borders, no shadows, semantic color only.
- Obey the loaded design-system prompt (`design/system-prompt.md`): designer not code-generator, no AI-slop defaults, one primary action per surface, real content not lorem, visible hierarchy & rhythm, reusable components and tokens.
- **Density and restraint together:** institutional tools are dense but calm — aligned tables, tight type scale, generous-but-not-empty spacing, muted labels, one accent. Avoid both the sparse "doc" look and a noisy dashboard.

## Process (follow in order)

1. **Discovery (brief):** ask up to 3 high-value questions only if they'd change the build; otherwise proceed with sensible defaults and state them.
2. **Audit the existing `portal/`** against the DESIGN STANCE section; list what you'll keep, replace, add.
3. **Engine first:** extend `shared/state.js` for multi-buyer auction (sealed bids → clearing/lead), multi-LP elections, pro-rata + backstop, and the seed data. Confirm the full deal runs programmatically before building UI.
4. **Shell + IA:** build the object-centric sidebar, deal header, section sub-nav, and task queue once in a shared module; reuse across roles.
5. **Sections:** build each section (Overview, Participants/register, Bids/auction, Elections, Allocation, Settlement, Documents, Audit) as real panels/tables, scoped per role.
6. **Feedback loop via Claude for Chrome:** open the portal (`localhost`), screenshot the dashboard + each section for each role, self-critique against the DESIGN STANCE + `design/skills/ai-slop-check.md` + `accessibility-audit.md` + `polish-pass.md` + `hierarchy-rhythm-review.md`, and **iterate until it reads like a product, not a doc.** Record a short GIF of the auction → clearing → elections → atomic close across two role tabs.
7. **Verify** the whole flow across roles and tabs: setup → invite N LPs + M buyers → sealed bids (blind) → clearing price disclosed → multi-LP elections (peer-private, split/amend/default) → allocation with backstop + preview → per-leg approvals → atomic close (+ forced-failure) → post-close oversight → flywheel.

## Deliverables (in `portal/`)

- The evolved portal (object-centric IA, auction, register, task queue, tables, settlement, audit, receipts).
- **`portal/README.md`** — how to run it, what's simulated vs real, the file map, the role + section list.
- **`portal/demo-script.md`** — a ~3-minute click-through: log in as Advisor, run the sealed-bid auction, watch the clearing price disclose, switch to LPs electing privately, settle atomically across tabs, then the flywheel.
- Screenshots/GIF in `portal/media/`.

## Acceptance criteria

- A first-time viewer believes this is a **real service** for running continuation deals — object-centric navigation, dense real tables, a task queue — NOT a narrated walkthrough. None of the six anti-patterns above are present.
- The **sealed-bid auction** is shown: multiple buyers bid blind, the advisor runs it, a clearing price is set and disclosed; buyers see only their own bid.
- **Multiple LPs** elect privately at the clearing price (split/amend/default sell); peers' elections are redacted.
- **Privacy** (sealed bids + sealed elections) and **atomicity** (one close moves everything; forced-failure moves nothing) are both visibly demonstrated.
- The **flywheel** (returning buyer reuses verification, bids in one click) is shown.
- Looks consistent with the established Continuum visual language; passes the design-system ai-slop + accessibility checks.
- Runs with zero install beyond a static file server. No Canton anywhere.

## Out of scope

Real ledger/settlement, wallets, real auth/passwords, multi-user networking, backend, persistence beyond localStorage, mobile-perfect responsiveness (desktop-first is fine), and a uniform-price multi-unit clearing model (use best-qualifying-bid → lead/clearing price; that's enough).
