# Continuum — 3-Minute Demo Script

A click-through for showing the prototype to a user (secondaries advisor, fund admin,
GP, LP, or buyer). Mirrors spec §4. **Bold lines are the wow lines — say them out loud.**

**Setup before you start:** serve it (`python3 -m http.server 8753`), open
`http://localhost:8753/index.html`. For the strongest effect, open **five tabs**, one per
persona — but a single tab with the **"Viewing as"** switcher works fine solo. Hit
**Reset demo** first so you start clean.

---

### 0 · Frame it (15s)
> "This is a continuation deal. An old fund holds an asset it can't sell yet, so it spins
> up a new vehicle. Some investors roll in, some cash out, a secondary buyer pays cash for
> the units. Today that takes weeks of lawyers, spreadsheets, and sequenced wires.
> **Continuum closes it privately, all at once.**"

### 1 · Set up the room — *as Advisor* (15s)
- The advisor names the old fund, the new vehicle, the asset. Click **Open closing room**,
  then **Open elections**.
> "One source of truth for the close. Everyone's invited — but nobody can see anyone else's
> private inputs."

### 2 · Price the deal — *as Buyer, then a seller* (30s)
- As Advisor, click **Price the deal**. Switch to **Secondary Buyer**, set the price (96% of NAV) and capacity, **Set price & disclose to room**.
- Switch to **Investor — Leaving** (or Advisor).
> "The buy side sets one price — **96% of NAV, validated by a Houlihan Lokey fairness
> opinion** — and it's **public to the whole room**. This is how real GP-led deals work:
> the price is fixed and blessed *before* anyone elects." *(Point at the public price card.)*

### 3 · Decide: roll or sell — *as the two Investors* (30s)
- Switch to **Advisor**, click **Open elections**.
- Switch **Viewing as → Investor — Leaving**. You see the set price + your position. Pick **Sell**, submit.
- Switch to **Investor — Staying**. Pick **Roll over**, submit. Switch to **Advisor**.
> "Each LP decides roll vs sell **at the set price** — and **no LP sees another LP's choice.**
> The advisor sees *that* they decided, never *what*." *(Point at the "Election in" chips, no amounts.)*

### 4 · Work out who gets what — *as Advisor* (20s)
- Switch to **Advisor**. Click **Work out who gets what → Compute the allocation**.
> "The engine sizes the book from the elections **at the set price** — four concrete legs:
> cash to the seller, units to the roller and the buyer, the asset into the new vehicle."

### 5 · Approve my part — *all parties* (20s)
- Click **Send for approvals**. Approve as Advisor, then switch to Buyer / Staying / Leaving
  and approve each.
> "Each party signs **only its own obligation**. Nobody signs for the whole book."

### 6 · Close — all at once — *as Advisor* (25s) — **the moment**
- Switch to Advisor. Click **All legs authorized → go to close**, then **CLOSE — ALL AT ONCE**.
- *(If you have five tabs open, watch them all flip to SETTLED together.)*
> "**One action. Every leg settled together — cash, units, and the asset — in a single
> private, atomic transaction.**"

### 7 · All-or-nothing — *the failure beat* (20s) — **the clincher**
- Click **Reset demo**, click back through to the close screen. This time tick
  **Simulate a failed leg**, then **CLOSE**.
> "If any single leg fails — **the whole thing rolls back. Nothing moves.** No half-settled
> mess, no stranded wire. That's the partial-close catastrophe, gone."

### 8 · Prove it was fair — *as Oversight* (15s)
- Finish a successful close. As Advisor, **Grant oversight window**. Switch to **Oversight — LPAC**.
> "Before the close, the LPAC saw only that a deal existed. **After, they get a scoped
> window to verify it was fair — without ever seeing the live private inputs.**"
> *(Optional forward-looking line: "…and the same scoped view can be extended to an
> external auditor or regulator.")*

### 9 · The flywheel — *as Advisor* (15s)
- As Advisor, click **Start deal #2**. Switch to **Secondary Buyer** at the pricing step.
> "New deal, same buyer. **Their verification carries over — they price in one click, no
> re-onboarding.** Onboarding cost approaches zero. That's the network effect."

---

### The one-line close
> *"The price was set and fairness-validated up front, every leg settled together, no LP saw
> another LP's hand, the cash was a real stablecoin, and the LPAC can verify — all in
> one private, atomic transaction."*

*(Reminder: this is a UX simulation — no Canton, no wallets, no network. It exists to test
whether the closing-room experience makes sense before any blockchain work.)*
