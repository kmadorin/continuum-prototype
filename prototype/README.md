# Continuum — Confidential Closing Room (Interactive Prototype)

A clickable, no-backend prototype of the **Continuum walking skeleton**: one GP-led
continuation deal closing across five parties — shown so a first-time viewer
understands the value in under three minutes.

It demonstrates the two things that make Continuum different:

- **Privacy made visible** — when you view as one party, the others' sealed inputs
  render **redacted** (`•••• sealed`, "you can't see this"). The advisor sees *that*
  an election or offer is in, never its contents.
- **Atomicity made visible** — one **CLOSE** moves every leg together (cash → leaving
  investor, fund units → staying investor + buyer, asset → new vehicle). A
  **"simulate a failed leg"** toggle shows the whole close rolling back — nothing moves.

> **This is a UX/flow prototype, not a working system.** No Canton, no wallets, no real
> tokens, no network calls. Every ledger/settlement behavior is simulated in-memory in
> plain JavaScript. The cash leg is labelled "USDC" (a stablecoin) to match the product.

## Run it

Either open the file directly, or serve it (recommended — `localStorage`/`BroadcastChannel`
sync works best over `http://`):

```bash
cd prototype
python3 -m http.server 8753
# then open http://localhost:8753/index.html
```

Or just double-click `index.html`.

### Two ways to demo

- **Solo (one tab):** use the **"Viewing as"** select box in the top bar to flip between
  the five parties. The view re-derives from shared deal state, so switching to the
  *leaving* investor mid-deal shows the buyer's price redacted, while *advisor* sees only
  that an offer is in.
- **War-room (five tabs):** open `index.html` in **five tabs / windows**, set each to a
  different persona. State is shared across tabs — when the advisor fires **CLOSE**, all
  five tabs flip to **SETTLED together**. (Same-origin tabs only; serve over `http://`.)

Use **Reset demo** (top-right) any time to start over. State is in-memory + `localStorage`;
it survives a refresh but is wiped by Reset.

## The thread (matches spec §4)

1. **Set up the room** — advisor names fund / vehicle / asset, opens the room.
2. **Bring participants in** — parties join; the buyer is verified once (reusable badge).
3. **Price the deal** — the lead buyer sets a price as % of NAV; a fairness opinion validates
   it; the price is **disclosed to the room** (this is how real GP-led deals work — price
   fixed and blessed *before* LPs elect).
4. **Decide: roll or sell** — each LP sees the set price + their position and *privately*
   chooses roll vs sell. Privacy here is **LP-vs-LP** — no LP sees another's election.
5. **Work out who gets what** — the engine sizes the allocation from the elections at the set price.
6. **Approve my part** — each party authorizes only its own obligation.
7. **Close — all at once** — one click settles every leg (or the fail toggle rolls it back).
8. **Prove it was fair** — oversight gets a scoped, post-close verification window.
9. **Flywheel** — start deal #2; the returning buyer reuses verification, prices in one click.

> **Privacy model (R1):** the price is *public* (the seller must see it to decide). What's
> private is each LP's **roll-or-sell election**, hidden from other LPs. The sealed-bid /
> blind-to-each-other story belongs to the **R2 multi-buyer** auction, not R1's single
> negotiated lead.

## What's simulated vs. real

| Concern | In this prototype | In the real product |
|---|---|---|
| Ledger / settlement | In-memory JS state machine | Canton + Token Standard atomic settlement |
| Privacy | View-derived redaction in the UI | Per-party sub-transaction privacy (projection) |
| Cash leg | Label "USDC", numbers only | CIP-56 USD stablecoin (USDCx) |
| Eligibility badge | A boolean that carries to deal #2 | Issuer-signed `EligibilityCredential` |
| Cross-tab sync | `localStorage` + `BroadcastChannel` | Separate participants on one synchronizer |

## File map

```
prototype/
├── index.html      # shell: top bar, persona switcher, lifecycle stepper, <main>
├── styles.css      # design tokens + components, vendored from the pitch site
├── app.js          # state machine, per-persona views, atomic-close animation, cross-tab sync
├── README.md       # this file
├── demo-script.md  # ~3-minute click-through script with the wow lines
└── media/          # captured screenshots of the key screens
```

## Design

Matches the Continuum pitch site: dark institutional theme, single cyan accent
(`oklch(76% 0.135 162)`), Archivo + IBM Plex Mono, sharp corners, 1px grid borders, no
shadows, semantic color only (`--fail` red-orange drives the forced-failure demo).
Keyboard navigable, visible focus rings, `prefers-reduced-motion` respected.
