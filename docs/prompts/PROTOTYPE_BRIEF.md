# Build Brief — Continuum Interactive Prototype (Walking Skeleton)

> Paste-and-go build prompt for a fresh Claude Code session.
> The session must already be launched with the design system loaded and Claude for Chrome enabled — see `docs/prompts/LAUNCH.md`.

## Mission

Build an **interactive, clickable HTML prototype** of the **Continuum walking skeleton** — the thinnest end-to-end thread where **one GP-led continuation deal closes**, shown across all five parties. The goal is to **demo the flow and UX to potential users** (secondaries advisors, fund admins, GPs, LPs, buyers) and learn whether the "confidential closing room" experience makes sense — *before* any blockchain work.

**No Canton. No backend. No real crypto.** Every ledger/settlement behavior is **simulated in-memory with plain JavaScript.** This is a UX/flow prototype, not a working system.

## Context & references (read these first)

All paths are inside the project root `/Users/kirillmadorin/Projects/hackathons/canton/continuum`:

- **`docs/specs/2026-06-21-continuum-story-map-design.md`** — the full design spec (problem, personas, the 8-step lifecycle, the walking skeleton in §4, primitives model). **Primary source of truth for behavior.**
- **`docs/specs/continuum-user-story-map.excalidraw`** — the user story map (backbone + R1 walking skeleton + R2/R3). Open at excalidraw.com if useful.
- **`design/pitch-design-tokens.md`** — exact visual tokens to match.
- **`/Users/kirillmadorin/Projects/hackathons/canton/pitch/`** — the existing pitch site. **Match this look.** `pitch/deck.html` has the most complete `<style>` block — copy its `:root` + components as your CSS base.
- **`design/system-prompt.md`** + **`design/skills/`** — the design methodology now governing you (loaded as system prompt). Follow it. Especially run the procedures in `design/skills/make-a-prototype.md`, then review with `design/skills/ai-slop-check.md`, `design/skills/accessibility-audit.md`, `design/skills/polish-pass.md`, `design/skills/interaction-states-pass.md`.
- **Prior design chat (optional deep context):** session `2520b370-d71d-4073-ac20-10015f94badd`, transcript at `~/.claude/projects/-Users-kirillmadorin-Projects-hackathons-canton/2520b370-d71d-4073-ac20-10015f94badd.jsonl`. That session produced the spec + story map. You usually only need the docs above; consult the transcript only for "why" questions. (Resume only works from the `/canton` directory, not `/continuum`.)

## What to build — the walking-skeleton scenario

One continuation deal, five parties, told in plain business language (no Canton terms in the UI):

**Parties (the demo cast):** Advisor/Organizer (creates the room, runs the close), Investor — Staying (rolls into the new fund), Investor — Leaving (cashes out), Buyer (secondary buyer; pays cash, receives units), Oversight (LPAC/Regulator).

**The thread (matches spec §4):**
1. **Set up the room** — Advisor creates the deal: names the fund, the new vehicle, the asset, the terms. Invites the parties.
2. **Bring participants in** — parties appear; the Buyer is "verified once" (a reusable eligibility badge).
3. **Decide: stay or cash out** — each Investor **privately** chooses roll or exit + amount. *No other party sees the choice.*
4. **Make a private offer** — the Buyer **privately** submits amount + price. *The Leaving investor cannot see the price yet.*
5. **Work out who gets what** — the system computes the allocation from the sealed inputs.
6. **Approve my part** — each party approves only its own obligation.
7. **Close — all at once** — one click: **cash → Leaving investor, fund units → Staying investor + Buyer, asset → new vehicle, all simultaneously.** Every pane updates from the single close. Cash is a stablecoin ("USDC"), not a coin.
8. **Prove it was fair** — Oversight gets a scoped, after-the-fact view (appears only post-close).
9. **Flywheel (deal #2)** — start a second deal; the returning Buyer **reuses the verification** and offers in **one click** — no re-onboarding.

### Interaction & privacy model (the heart of the demo)
- **Persona switcher** simulating five separate browsers/screens — e.g. a top selector or a multi-pane "war room" view. The wow is *seeing privacy + atomicity*.
- **Privacy made visible:** when you're viewing as one party, other parties' sealed inputs render **redacted** (e.g. `•••• submitted`), with a clear "you can't see this" treatment. The Advisor sees *that* an election/offer is in, **not its contents**.
- **Atomic close:** a single action; all relevant panes update **together** with a short animation. Include an optional **"force a leg to fail" toggle** that shows the close rolling back — **nothing moves** (use `--fail` red-orange). This dramatizes "all-or-nothing."
- **Regulator window:** before close, Oversight sees only that a deal exists; after close, a scoped verification view opens.
- **Flywheel:** deal #2 visibly skips onboarding for the returning Buyer.

## Hard constraints
- **Static front-end only.** Plain HTML + CSS + vanilla JS (or tiny, dependency-light). **No build step, no framework toolchain, no server required** — must run by opening a file and also via a trivial `python3 -m http.server`.
- **All state in memory**, seeded in JS. Include a visible **Reset / Restart demo** control.
- **No Canton, no wallets, no real tokens, no network calls.** Label it clearly as a simulation where appropriate (subtle, not nagging).
- **Accessible:** semantic HTML, keyboard navigable, WCAG AA contrast, visible focus rings (never removed), `prefers-reduced-motion` respected. (The design system requires this.)

## Design direction
- **Match the pitch exactly** — use `design/pitch-design-tokens.md` and copy `pitch/deck.html`'s `:root`/components. Dark institutional theme, cyan accent (`oklch(76% 0.135 162)`), **Archivo + IBM Plex Mono**, sharp corners, 1px grid borders, no shadows, semantic color only.
- Obey the loaded design-system prompt: designer not code-generator, no AI-slop defaults (no gratuitous gradients/emoji/weak SVGs), one primary CTA per screen, real content not lorem, visible hierarchy & rhythm, design tokens + reusable components.

## Process (follow in order)
1. **Discovery first (brief):** Per the design system, ask **up to 3 high-value clarifying questions** only if they'd change the build (e.g. single multi-pane "war room" vs. a persona-switcher tab; how many LPs to show). Otherwise proceed with sensible defaults and state them.
2. **Aesthetic direction:** confirm tokens from the pitch; set up the CSS base from `deck.html`.
3. **Build** per `design/skills/make-a-prototype.md` — get the full thread clickable end to end first (walking skeleton), then deepen.
4. **Feedback loop via Claude for Chrome:** open the prototype (`file://` or `localhost`), **screenshot each key screen**, self-critique against the pitch look + `ai-slop-check.md` + `accessibility-audit.md` + `polish-pass.md`, and **iterate until it's clean.** Record a short **GIF of the full close flow** (Chrome can capture interactions).
5. **Verify** the whole thread works: setup → sealed elections → blind offer → compute → atomic close (and the forced-failure variant) → regulator window → flywheel.

## Deliverables (in `continuum/prototype/`)
- The prototype itself (e.g. `index.html` + `styles.css` + `app.js`, or a small set of files; keep it simple).
- **`README.md`** — how to run it (open file / `python3 -m http.server`), what's simulated vs. real, and the file map.
- **`demo-script.md`** — a ~3-minute click-through script for showing it to a user (mirrors spec §4), with the wow lines.
- The captured screenshots/GIF (in `prototype/media/`).

## Acceptance criteria
- A first-time viewer can click through one full deal close across all five parties and **understand the value in under 3 minutes.**
- **Privacy is visibly demonstrated** (sealed inputs redacted across parties).
- **Atomicity is visibly demonstrated** (one close moves everything; forced-failure moves nothing).
- The **flywheel** (one-click returning buyer) is shown.
- Looks **indistinguishable in spirit from the pitch site**; passes the design-system's ai-slop + accessibility checks.
- Runs with zero install beyond a static file server. No Canton anywhere.

## Out of scope
Real ledger/settlement, wallets, auth, multi-user networking, backend, persistence beyond in-memory, mobile-perfect responsiveness (desktop-first is fine for a demo).
