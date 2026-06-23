# Continuum Portal — role-split prototype

A multi-page UX prototype of one **GP-led continuation-fund close**, split into a
real product: a portal/login landing plus one page per role. Five parties run a
single confidential close — each sees only its own part, and the whole transaction
settles **all at once or not at all**.

This is a **simulation**. No Canton, no backend, no wallets, no real crypto, no
network calls. Every ledger/settlement behaviour is plain in-memory JavaScript +
`localStorage`. It is the role-split successor to the single-page `../prototype/`,
which is kept untouched as the reference.

## Run it

No build step. Either:

```bash
# from this portal/ directory
python3 -m http.server 8000
# then open http://localhost:8000/
```

…or just open `portal/index.html` directly in a browser (`file://` works too — the
code uses plain `<script>` globals, not ES modules, so it runs without a server).

For the full effect, open several roles in separate tabs (use each card on the
login screen, or the **Demo · jump to role** switcher in the top bar). They share
one live deal — fire the close in the advisor tab and every tab animates together.

## What's simulated vs. real

| Real | Simulated |
|---|---|
| The UI, the flow, the privacy/redaction model, the atomic-close behaviour | The ledger, settlement, cash (USDC), units, KYC credential |
| Cross-tab live sync (`localStorage` + `BroadcastChannel`) | "Other parties" — all five seats run on your one machine |
| Hash routing, dashboards, per-role workspaces | Authentication — login is one click, no password |

## File map

```
portal/
  index.html            portal / login — five persona account cards
  advisor.html   advisor.js     Advisor / Organizer — runs the close
  staying.html   staying.js     Investor — Staying (rolling LP)
  leaving.html   leaving.js     Investor — Leaving (exiting LP)
  buyer.html     buyer.js       Secondary Buyer
  oversight.html oversight.js   Oversight — LPAC
  shared/
    state.js     deal engine: seed data, 8-stage machine, elections, compute,
                 atomic close + forced-failure rollback, flywheel, reset. No DOM.
    sync.js      the only module touching storage — localStorage + BroadcastChannel.
    shell.js     shared chrome (topbar, identity, demo switcher, progress rail,
                 redaction, close animation) + CT.ui component builders.
    page.js      per-role page runner: login guard, routing, dashboard scaffold,
                 re-render on cross-tab changes, close-animation trigger.
    styles.css   design tokens + components (lifted from ../prototype/styles.css,
                 extended for login / dashboard / workspace).
  README.md      this file
  demo-script.md ~3-minute click-through
  media/         screenshots + war-room GIF
```

### Module boundaries

`sync.js` is the only thing that persists. `state.js` is a pure deal engine on top
of it — read the deal, dispatch a role action, subscribe to changes — with no DOM.
`shell.js` + `page.js` are presentation only. Each `<role>.js` renders just its own
dashboard + workspace. A role file can change without touching the engine; the
engine can change without touching role UI.

## Per-role page model

Each role page has two hash-routed views:

- **Dashboard** (`#/`) — service home. One active deal, a status chip, and an
  **Action required** badge when this role is the one holding up the close.
- **Workspace** (`#/deal/D-001`) — left **progress rail** (8 stages, current
  highlighted); centre = this role's current action front-and-centre; other parties'
  sealed inputs render **redacted** (`•••• submitted`).

## The 8 stages

`setup → invite → price → elect → compute → approve → close → settled`

The buy side prices **first** (publicly, fairness-validated); LPs then elect roll vs
sell against that set price. Election privacy is **LP-vs-LP** — the organizer sees
*that* an LP decided, never *what*. The close is atomic: one action settles all four
legs, or a forced failure rolls everything back. After settlement the advisor can
grant the LPAC a scoped fairness window and start the next deal — where the returning
buyer reuses its verified credential in one click (the flywheel).

Global **Reset demo** (top bar, every page) restores the seed and broadcasts to all
tabs.
