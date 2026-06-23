# Demo script — ~3-minute click-through

Open `http://localhost:8765/index.html`. For the multi-tab beats, open the Advisor in one tab
and a Buyer + an LP in two more (sign in separately, or use **Demo · jump to role** in the top bar).
Hit **Reset demo** first for a clean start.

---

### 0 · The pitch (10s)
"Continuum is the workspace a fund advisor and their counterparties log into to run a GP-led
continuation deal — auction, elections, allocation, and an atomic close — each seat seeing only
its own part." Sign in as **Advisor / Organizer**.

### 1 · Dashboard, not a doc (15s)
The home surface is a **task queue ("Needs you")**, a deals list (Meridian CV I active +
Brightwater CV I queued for the flywheel), and at-a-glance metrics. No teaching prose, no
lifecycle rail. Note the left sidebar — Dashboard / Deals / Tasks / Participants / Documents —
that's the spine.

### 2 · Run the sealed-bid auction (40s)
Open the deal → **Bids / Pricing**.
1. **Open auction to buyers.** The bid book shows 4 buyers: two have already filed (amounts
   `•••• sealed`), Kestrel passed.
2. Switch to the **Buyer** tab → **Bids** → submit Northbeam's sealed bid (96%, $16M). It sees
   only its own bid; "3 competing bids — sealed."
3. Back on Advisor → **Open sealed bid book.** The reveal: Northbeam 96% is the **lead**, others
   outbid, fairness-validated. The **clearing price 96% is disclosed to the room** (watch the
   buyer/LP tabs pick it up).

### 3 · Multiple LPs elect privately (35s)
Advisor → **Elections** → **Open elections to LPs**. The advisor's table shows only **"filed"** —
never roll-vs-sell, never amounts.
- **Rolling LP** tab (Hawthorn) → **Elections** → choose **Split**, roll $8.0M / sell $1.4M.
- **Exiting LP** tab (Calder) → **Sell** $5.0M. Each LP sees peers as `•••• sealed`; default = sell.

### 4 · Allocation that ties out (25s)
Advisor → **Elections** → **Close elections & compute allocation** → **Allocation**.
Sell $20.4M, roll $31.6M, buyer capacity $26M (lead $16M + **syndicate** $4.4M backstop), cash
$19.58M. 13 settlement legs. Tie-out: units issued **52.0M** = asset NAV in **$52.0M**.
**Send for per-leg approval.**

### 5 · Per-leg approvals + atomic close (30s)
Advisor → **Settlement**: every party authorizes only its own leg (escrow / receive / take units).
With all legs authorized, **Settle atomically** — the legs sweep to *Settled* across all open tabs
at once. A **receipt** appears: settlement ID, T+0 value date, $19.58M USDC, 52M units.

> **Show atomicity:** tick **"Force a leg to fail"** before settling. Every leg rolls back —
> nothing moves, every party is exactly where it started. Then **Retry the close** cleanly.

### 6 · Oversight + flywheel (15s)
- **Oversight — LPAC** tab: locked pre-close; post-close it gets the scoped fairness view —
  attestations (price set by auction before elections, buyers blind, LP elections peer-private,
  conflict disclosed, atomic settlement).
- On the receipt → **Start next deal — Brightwater CV I**: Northbeam's credential is reused, so
  the returning buyer bids in one click.

---

**The four things to land:** object-centric product (not a narrated walkthrough) · sealed-bid
auction (buyers blind, advisor clears) · private multi-LP elections (peers redacted) · atomicity
(one close moves everything, forced-failure moves nothing).
