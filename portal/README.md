# Continuum Portal — continuation-deal workspace (R1 + R2 prototype)

A static, front-end-only prototype of the software a fund advisor and their counterparties
would log into to run a **GP-led continuation deal end to end** — a sealed-bid buyer auction,
multiple LPs electing privately, allocation with a syndicate backstop, per-leg approvals, and
an atomic close. Object-centric IA: you navigate by *things* (deals, tasks, participants,
documents), not by lifecycle step.

> **Simulation only.** No Canton, no Daml, no wallets, no backend, no network. All ledger /
> auction / settlement behaviour is in-memory JavaScript synced across tabs via
> `localStorage` + `BroadcastChannel`. No real crypto or money moves.

## Run it

```bash
cd portal
python3 -m http.server 8765
# open http://localhost:8765/index.html
```

Or just open `portal/index.html` in a browser. Pick a seat on the sign-in screen. Open several
seats in **separate tabs** to watch the same deal from every side — they stay live-synced, and
the atomic close animates across all of them.

A **Reset demo** control (top bar) returns everything to the start.

## What's simulated vs real

| Real | Simulated |
|---|---|
| The UI, IA, role-scoped projections, and privacy model | The ledger, auction clearing, and settlement (plain JS) |
| The financial math — every figure derives from seed NAVs and **ties out** (units issued = asset NAV in; cash in = cash out) | "USDC", "atomic settlement", credential verification — labels on in-memory state |
| Live cross-tab sync (localStorage + BroadcastChannel) | "T+0", settlement IDs, downloadable confirmations |

## Roles & what each sees

| Seat | Sections | Sees |
|---|---|---|
| **Advisor / Organizer** (Dana Whitfield) | all | full bid book (after opening); LP elections only as **"filed"** markers, never contents; full register; runs the auction, computes, settles |
| **Secondary Buyer** (Northbeam) | Overview · Participants · Bids · Allocation · Settlement · Documents · Audit | its **own** sealed bid + (post-clearing) the clearing price; never other buyers' bids |
| **Investor — Rolling** (Hawthorn Pension) | Overview · Participants · Elections · Allocation · Settlement · Documents · Audit | own election + position; clearing price; peers' elections **redacted** |
| **Investor — Exiting** (Calder Family Office) | same as rolling | own election + position; clearing price; peers redacted |
| **Oversight — LPAC** | locked pre-close → Overview · Participants · Allocation · Settlement · Documents · Audit | nothing live pre-close; scoped fairness view + attestations post-close |

Redaction renders consistently as striped `•••• sealed` cells with a "you can't see this" line —
never conveyed by colour alone.

## The deal sections (sub-nav, scoped per role)

`Overview · Participants · Bids/Pricing · Elections · Allocation · Settlement · Documents · Audit`.
The lifecycle stage is a **status pill + progress meter** in the deal header — never the navigation.

- **Participants** — investor register (LP · type · committed · NAV · ownership % · election status) + buyer roster.
- **Bids/Pricing** — the sealed-bid auction. Buyers bid blind; the advisor opens the book; the
  best qualifying bid sets the disclosed **clearing/lead price**; a syndicate backstops overflow.
- **Elections** — LPs roll / sell / split at the clearing price; amend until the deadline;
  unfiled = default sell; peer-private.
- **Allocation** — sized from elections; pro-rata + syndicate backstop if oversubscribed; legs preview; tie-out.
- **Settlement** — per-leg approvals → one atomic close (or a forced-failure that rolls everything back) → receipt.
- **Audit** — timestamped activity log; fairness attestations for oversight post-close.

## File map

```
portal/
  index.html            sign-in (pick a seat)
  advisor.html  staying.html  leaving.html  buyer.html  oversight.html
                        thin role shells — each loads the shared modules and calls CT.app.run(role)
  shared/
    sync.js             persistence only: localStorage + BroadcastChannel cross-tab sync
    state.js            the deal engine — seed data (2 deals, 8 LPs, 4 buyers), stage machine,
                        sealed-bid auction → clearing/lead + syndicate, multi-LP elections,
                        allocation compute (ties out), atomic close + forced-failure, flywheel
    app.js              the whole front-end: object-centric shell (sidebar, deal header,
                        section sub-nav), task queue, dense tables, all sections, per-role
                        projection, wiring, atomic-close animation
    styles.css          design tokens + components (dark institutional, one cyan accent)
    selftest.js         node-only engine test: `node portal/shared/selftest.js` (not loaded by the browser)
  README.md  demo-script.md  BUILD_NOTES.md
```

## Seed data (Meridian CV I — the hero deal)

Reference NAV **$52.0M** @ $1.00/unit. 8 LPs, 4 buyers.
- **Auction:** Northbeam 96% (lead) · Cedar Park 95% · Vantage 94% · Kestrel passed. Clearing **96%**, Cedar Park syndicates the overflow at the clearing price.
- **Elections:** sell demand **$20.4M**, roll **$31.6M** (= $52.0M). Buyers fund $20.4M (lead $16M + syndicate $4.4M) → cash **$19.584M USDC**.
- **Tie-out:** units issued **52.0M** = asset NAV in **$52.0M**; cash in = cash out.
- **Flywheel:** deal 2 (Brightwater CV I) reuses Northbeam's verified credential — bid in one click.
