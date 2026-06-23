# Continuum Portal — Role-Split Prototype (Design)

Date: 2026-06-23
Status: Approved design → ready for implementation plan

## Goal

Split the current single-page Continuum prototype (one page, `<select>` dropdown
switches the viewing role) into a **multi-page service**: one page per role, with a
portal/login landing. Make it look and feel like a real continuation-fund product,
not a demo with a role toggle. Build it with Claude Code using the **same design
system and design skills** as the original prototype.

## Current state (source of truth to reuse)

`continuum-prototype/prototype/`:
- `index.html` (39 lines) — topbar with persona `<select>`, stepper, main mount.
- `styles.css` (370 lines) — design tokens + components (dark institutional theme,
  cyan accent `oklch(76% 0.135 162)`, Archivo + IBM Plex Mono, 1px borders, no shadows,
  sharp corners). No framework.
- `app.js` (894 lines) — vanilla, `"use strict"` IIFE. Holds:
  - 5 personas: `advisor`, `staying`, `leaving`, `buyer`, `oversight`.
  - 8-stage state machine: `setup → invite → price → elect → compute → approve → close → settled`.
  - Seeded datasets, per-role views (`vSetup`, `vPrice`, `vElect`, …), privacy/redaction
    logic, atomic-close leg animation.
  - Shared deal state in `localStorage` (`continuum.*`), view pref in `sessionStorage`
    (`continuum.viewAs`), live cross-tab sync via `BroadcastChannel`.

Design system (reused unchanged): `design/system-prompt.md`,
`design/pitch-design-tokens.md`, `design/skills/*` (`make-a-prototype`, `ai-slop-check`,
`accessibility-audit`, `polish-pass`, `interaction-states-pass`, `hierarchy-rhythm-review`).

The product, personas, privacy model, and 8-step lifecycle are specified in
`docs/specs/2026-06-21-continuum-story-map-design.md` and the story map
`docs/specs/continuum-user-story-map.excalidraw`.

## Decisions (locked with user)

1. **Architecture:** separate HTML page per role + a portal/login landing. Genuinely
   multi-page, vanilla, no build step.
2. **In-page model:** dashboard + deal workspace (not task-inbox, not filtered stepper).
3. **Login:** realistic product login (persona account cards, one-click, no real
   password) + a discreet "demo: jump to role" switcher on every page.
4. **Location:** same repo `continuum-prototype/`, new `portal/` subdir alongside the
   untouched `prototype/`. Original prototype kept as reference.
5. **Logic:** reuse the proven state engine from `prototype/app.js`; only the per-role
   UI is rewritten fresh under the design system.
6. **Prompt:** one comprehensive `PORTAL_BRIEF.md` (per-role spec as a section inside it).

## Architecture & file structure

New build under `continuum-prototype/portal/`:

```
portal/
  index.html            # portal / login — persona account cards
  advisor.html   advisor.js
  staying.html   staying.js
  leaving.html   leaving.js
  buyer.html     buyer.js
  oversight.html oversight.js
  shared/
    state.js            # deal engine: seed, 8 stages, elections, compute, atomic close, reset
    sync.js             # localStorage + BroadcastChannel live cross-tab sync
    shell.js            # topbar, demo switcher, progress-rail + redaction components
    styles.css          # design tokens + components (lifted from prototype/styles.css)
```

Each role page is its own URL. All pages read/write **one shared deal** in
`localStorage` and re-render on `BroadcastChannel` events. Opening all five roles in
separate tabs = a live "war room": when the advisor fires the close in one tab, every
tab's settlement legs animate together.

### Module boundaries

- `shared/state.js` — pure deal engine. Owns the seed datasets, the 8-stage machine,
  election filing, fairness/price, allocation compute, atomic close + rollback, and
  `reset()`. No DOM. One clear interface: read current deal, dispatch role actions,
  subscribe to changes. Lifted and de-tangled from `prototype/app.js`.
- `shared/sync.js` — persistence + cross-tab. Wraps `localStorage` (one deal key) and a
  `BroadcastChannel`. Emits "deal changed" to subscribers. The only thing that touches
  storage.
- `shared/shell.js` — shared UI chrome reused by every role page: topbar (brand,
  logged-in identity), discreet demo switcher, the 8-stage progress rail component, and
  the redaction/`•••• submitted` treatment. No role-specific logic.
- `<role>.js` — that role's dashboard + workspace rendering only. Consumes state.js,
  renders via shell.js components. Each is small and focused on one persona.

Each unit answers: what it does, how you use it, what it depends on. A role file can be
read and changed without touching the engine; the engine can change without touching
role UI.

## Per-role page model — dashboard + workspace

Each `role.html` has two hash-routed views:

- **Dashboard** (`#/`) — service home. Deal list (one deal in the demo) with a status
  chip and an **"Action required"** badge when this role is the one holding up the close.
- **Workspace** (`#/deal/D-001`) — left **progress rail** (8 stages, current highlighted);
  center = this role's **current action front-and-center**; other steps shown read-only as
  context. Other parties' sealed inputs render **redacted** (`•••• submitted`), with the
  "you can't see this" treatment from the original.

Per-role behaviour (preserve the original privacy model exactly):

| Role | Acts at | Sees |
|---|---|---|
| Advisor / Organizer | create room, invite, fairness-validate price, compute close, fire atomic close, disclose to regulator | full orchestration; LP elections only as contentless "filed" markers |
| Investor — Staying (Rolling LP) | privately ROLL at the set price; approve units leg | own election; the public price; peers redacted |
| Investor — Leaving (Exiting LP) | privately SELL at the set price | own election; the public price; peers redacted |
| Secondary Buyer | commit price (% of NAV); approve cash leg; deal-#2 one-click reuse | own bid; price public to room |
| Oversight — LPAC | nothing pre-close; post-close scoped fairness view | redacted until close, then scoped verification |

## Portal / login + demo switcher

- `index.html` — realistic product login. Five persona "account" cards, one-click enter,
  no real password. Selecting a card sets `continuum.session.role` and routes to that
  role's page (e.g. `advisor.html#/`).
- Discreet **"demo: jump to role"** control on every page (small, top corner) linking to
  the other role pages. State is shared, so jumping just changes which lens you view the
  same live deal through — gives real-service feel plus easy on-stage switching.
- Global **Reset demo** control (in shell) restores the seed and broadcasts to all tabs.

## Shared state — reuse, don't regenerate

Lift the working 8-stage state machine, seed datasets, privacy/redaction rules, and
atomic-close (incl. optional forced-leg-failure rollback) out of `prototype/app.js` into
`shared/state.js` + `shared/sync.js`. Domain logic stays proven; only per-role UI is
rebuilt fresh under the design system. Keep the existing `localStorage` deal shape and
`BroadcastChannel` so multi-tab live sync continues to work.

## Design system & constraints (unchanged from original)

- Match the pitch tokens exactly: dark institutional theme, cyan accent
  `oklch(76% 0.135 162)`, Archivo + IBM Plex Mono, 1px grid borders, no shadows, sharp
  corners.
- No Canton/Daml jargon in the UI — plain business language.
- One primary CTA per screen; secondary actions de-emphasized.
- Privacy made visible: redacted other-party inputs.
- Atomic close: single action, all relevant panes animate together.
- Semantic HTML, keyboard navigable, WCAG AA contrast, visible focus rings,
  `prefers-reduced-motion` respected.
- Run by opening a file or `python3 -m http.server` — no build, no server logic.
- Build verified with the design review skills (`ai-slop-check`, `accessibility-audit`,
  `interaction-states-pass`, `hierarchy-rhythm-review`, `polish-pass`).

## Deliverables

1. **`portal/`** — the multi-page prototype (files above).
2. **`start-portal.sh`** (repo root) — mirrors `start-prototype.sh`: launches Claude Code
   with `design/system-prompt.md` appended and `--chrome`, named session
   `continuum-portal`; prints the paste line
   (`Read docs/prompts/PORTAL_BRIEF.md and execute it.`).
3. **`docs/prompts/PORTAL_BRIEF.md`** — the build brief driving the `make-a-prototype`
   skill. References: existing `prototype/` (reuse state engine + tokens), the spec, the
   story map, the design skills. Specifies the multi-page split, dashboard+workspace
   model, portal login, demo switcher, privacy redaction, live multi-tab sync, and reset.

## Out of scope (YAGNI)

- No real authentication / passwords / backend.
- No real Canton/Daml ledger — front-end simulation only (as the original).
- No multi-deal management beyond the single demo deal (dashboard supports a list, seeded
  with one).
- No rewrite of proven domain logic — reuse it.
- Original `prototype/` is not modified.
