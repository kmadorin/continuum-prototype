# Build Brief — Continuum Portal (Role-Split Prototype)

> Paste-and-go build prompt for a fresh Claude Code session.
> The session must already be launched with the design system loaded and Claude for Chrome enabled — see `start-portal.sh` / `docs/prompts/LAUNCH.md`.

## Mission

Turn the existing **single-page** Continuum prototype into a **multi-page service**: one page per role, with a **portal/login** landing. It must look and feel like a real continuation-fund product — not a demo with a role dropdown. Same deal, same privacy/atomicity story; new information architecture.

**No Canton. No backend. No real crypto.** All ledger/settlement behavior stays simulated in-memory with plain JavaScript, exactly as the original. This is a UX/flow prototype.

## Context & references (read these first)

All paths are inside the project root `/Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype`:

- **`prototype/`** — the EXISTING single-page prototype. **Primary source of truth for behavior, data, and visuals.** Reuse it:
  - `prototype/app.js` (894 lines) — the proven 8-stage state machine (`setup → invite → price → elect → compute → approve → close → settled`), seed datasets, per-role views, privacy/redaction logic, atomic-close leg animation, `localStorage` deal state, `BroadcastChannel` cross-tab sync. **Lift this logic; do not reinvent it.**
  - `prototype/styles.css` (370 lines) — the design tokens + components. **Copy its `:root` and components as your CSS base** (it already matches the pitch).
  - `prototype/README.md`, `prototype/demo-script.md` — how it runs and the click-through.
- **`docs/superpowers/specs/2026-06-23-continuum-portal-role-split-design.md`** — the design for THIS build (architecture, file structure, per-role page model, decisions). **Primary source of truth for structure.**
- **`docs/specs/2026-06-21-continuum-story-map-design.md`** — original spec (problem, personas, 8-step lifecycle, privacy model). Source of truth for domain behavior.
- **`docs/specs/continuum-user-story-map.excalidraw`** — the user story map (roles × activities).
- **`design/pitch-design-tokens.md`** — exact visual tokens to match.
- **`design/system-prompt.md`** + **`design/skills/`** — the design methodology now governing you (loaded as system prompt). Follow it. Run the procedures in `design/skills/make-a-prototype.md`, then review with `design/skills/ai-slop-check.md`, `design/skills/accessibility-audit.md`, `design/skills/interaction-states-pass.md`, `design/skills/hierarchy-rhythm-review.md`, `design/skills/polish-pass.md`.

## What to build

A multi-page prototype under **`continuum-prototype/portal/`**:

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

### Shared modules (build these first — reuse, don't regenerate)

- **`shared/state.js`** — lift the deal engine out of `prototype/app.js`: seed datasets, the 8-stage machine, election filing, fairness/price, allocation compute, atomic close + forced-leg-failure rollback, and `reset()`. **No DOM in this file.** Expose a small interface: read the current deal, dispatch a role action, subscribe to changes.
- **`shared/sync.js`** — the only module that touches storage. Wrap `localStorage` (keep the original deal key/shape so existing behavior carries over) and a `BroadcastChannel`; emit "deal changed" to subscribers.
- **`shared/shell.js`** — shared UI chrome every role page reuses: topbar (brand + logged-in identity), the discreet **demo switcher**, the 8-stage **progress-rail** component, the **redaction** (`•••• submitted`) treatment, and the global **Reset demo** control. No role-specific logic.
- **`shared/styles.css`** — copy `prototype/styles.css` tokens + components; extend for dashboard/workspace/login as needed.

### Portal / login (`index.html`)

Realistic product login: five persona **account cards** (Advisor / Organizer, Investor — Staying, Investor — Leaving, Secondary Buyer, Oversight — LPAC), one-click enter, **no real password**. Selecting a card sets `continuum.session.role` and routes to that role's page (e.g. `advisor.html#/`).

### Per-role pages — dashboard + workspace

Each `<role>.html` has two hash-routed views:
- **Dashboard** (`#/`) — service home: deal list (one seeded deal), status chip, and an **"Action required"** badge when this role is the one holding up the close.
- **Workspace** (`#/deal/D-001`) — left **progress rail** (8 stages, current highlighted); center = this role's **current action front-and-center**; other steps read-only context. Other parties' sealed inputs render **redacted** (`•••• submitted`) with the "you can't see this" treatment.

Preserve the original privacy model exactly:

| Role | Acts at | Sees |
|---|---|---|
| Advisor / Organizer | create room, invite, fairness-validate price, compute close, fire atomic close, disclose to regulator | full orchestration; LP elections only as contentless "filed" markers |
| Investor — Staying (Rolling LP) | privately ROLL at the set price; approve units leg | own election; the public price; peers redacted |
| Investor — Leaving (Exiting LP) | privately SELL at the set price | own election; the public price; peers redacted |
| Secondary Buyer | commit price (% of NAV); approve cash leg; deal-#2 one-click reuse | own bid; price public to room |
| Oversight — LPAC | nothing pre-close; post-close scoped fairness view | redacted until close, then scoped verification |

### Demo switcher

A discreet **"demo: jump to role"** control on every page (small, top corner) linking to the other role pages. State is shared, so jumping changes the lens on the same live deal. Gives real-service feel plus easy on-stage switching.

### Live multi-tab sync (keep the wow)

All pages read/write **one shared deal** via `shared/sync.js`. Opening all five roles in separate tabs = a live war room: when the Advisor fires the close in one tab, every tab's settlement legs animate together. Keep the atomic close (one action moves everything) and the optional **forced-leg-failure** rollback (`--fail` red-orange; nothing moves).

## Hard constraints

- **Static front-end only.** Plain HTML + CSS + vanilla JS. **No build step, no framework, no server logic.** Must run by opening `portal/index.html` and also via `python3 -m http.server` from `portal/`.
- **All state in memory + `localStorage`/`BroadcastChannel`**, seeded in JS. Keep a visible **Reset / Restart demo** control.
- **No Canton, no wallets, no real tokens, no network calls.** No Canton/Daml jargon in the UI — plain business language.
- **Reuse the proven domain logic** from `prototype/app.js`; only the per-role UI is rewritten.
- **Do not modify** the original `prototype/` directory.
- **Accessible:** semantic HTML, keyboard navigable, WCAG AA contrast, visible focus rings (never removed), `prefers-reduced-motion` respected.

## Design direction

- **Match the pitch/original exactly** — copy `prototype/styles.css` (`:root` + components) and `design/pitch-design-tokens.md`. Dark institutional theme, cyan accent (`oklch(76% 0.135 162)`), **Archivo + IBM Plex Mono**, sharp corners, 1px grid borders, no shadows, semantic color only.
- Obey the loaded design-system prompt: designer not code-generator, no AI-slop defaults (no gratuitous gradients/emoji/weak SVGs), **one primary CTA per screen**, real content not lorem, visible hierarchy & rhythm, design tokens + reusable components.

## Process (follow in order)

1. **Discovery first (brief):** Per the design system, ask **up to 3 high-value clarifying questions** only if they'd change the build. Otherwise proceed with sensible defaults and state them.
2. **Aesthetic direction:** set up `shared/styles.css` from `prototype/styles.css`.
3. **Shared modules:** build `state.js`, `sync.js`, `shell.js` by lifting/refactoring `prototype/app.js`. Confirm the full deal can run programmatically before building pages.
4. **Build pages** per `design/skills/make-a-prototype.md`: portal login first, then make the full thread clickable across role pages end to end (walking skeleton), then deepen each dashboard/workspace.
5. **Feedback loop via Claude for Chrome:** open the portal (`file://` or `localhost`), **screenshot each key screen** (login + each role's dashboard + workspace), self-critique against the pitch look + `ai-slop-check.md` + `accessibility-audit.md` + `polish-pass.md`, and **iterate until clean.** Record a short **GIF** of the full close flow with two+ role tabs side by side (the war-room sync).
6. **Verify** the whole thread across pages: login → role pages → sealed elections (peers redacted) → blind/public price → compute → atomic close animating across tabs (and the forced-failure variant) → regulator window opens post-close → flywheel one-click returning buyer → reset.

## Deliverables (in `continuum-prototype/portal/`)

- The portal itself (files in the structure above).
- **`portal/README.md`** — how to run it (open `index.html` / `python3 -m http.server`), what's simulated vs. real, the file map, and the per-role page list.
- **`portal/demo-script.md`** — a ~3-minute click-through for showing it to a user: log in, walk the deal across roles, show privacy + atomic close in the war-room tabs, then the flywheel.
- Screenshots/GIF in `portal/media/`.

## Acceptance criteria

- A first-time viewer logs in, picks a role, and understands the value of one full deal close across roles in **under 3 minutes.**
- It reads as a **real multi-page service**, not a role-toggle demo (distinct URLs, login, dashboards).
- **Privacy is visibly demonstrated** (sealed inputs redacted across role pages).
- **Atomicity is visibly demonstrated** (one close moves everything across tabs; forced-failure moves nothing).
- The **flywheel** (one-click returning buyer) is shown.
- Looks **indistinguishable in spirit from the original prototype / pitch**; passes the design-system's ai-slop + accessibility checks.
- Runs with zero install beyond a static file server. No Canton anywhere. Original `prototype/` untouched.

## Out of scope

Real ledger/settlement, wallets, real auth/passwords, multi-user networking, backend, persistence beyond `localStorage`, multi-deal management beyond the single seeded deal, mobile-perfect responsiveness (desktop-first is fine), and any rewrite of the proven domain logic.
