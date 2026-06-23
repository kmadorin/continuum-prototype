# Continuum Portal — 3-Minute Demo Script

A click-through for showing the **role-split** portal to a user (secondaries advisor,
fund admin, GP, LP, or buyer). **Bold lines are the wow lines — say them out loud.**

**Setup:** serve it (`python3 -m http.server 8000`), open
`http://localhost:8000/`. For the strongest effect, open **the advisor seat plus one
or two others in separate tabs** — log in from the portal, or use the **Demo · jump to
role** switcher in the top bar (it views the same live deal through another lens). Hit
**Reset demo** first so you start clean.

---

### 0 · The login (15s)
- Open the portal. Five **account cards**, one per seat in the deal.
> "This isn't a demo with a role dropdown — it's the product. Each party logs into its
> own seat. **Pick one and you see only your part of the close.**"

### 1 · Set up the room — *as Advisor* (20s)
- Click **Enter as organizer**. You land on the advisor's deal workspace. Note the
  **progress rail** on the left and the **Your move** banner.
- Name the fund / vehicle / asset, click **Open closing room**.
> "One source of truth for the close. Everyone's invited — but nobody can see anyone
> else's private inputs."

### 2 · Price the deal — *as Buyer* (25s)
- As advisor click **Price the deal** (the advisor now waits on the buyer). Open the
  **Demo · jump to role → Secondary Buyer** (or the buyer tab). Set the price
  (96% of NAV) and capacity, **Set price & disclose to room**.
> "The buy side sets one price — **96% of NAV, validated by a Houlihan Lokey fairness
> opinion** — and it's **public to the whole room**. Price fixed and blessed *before*
> anyone elects."

### 3 · Decide: roll or sell — *as the two Investors* (30s)
- Back as advisor: **Open elections**. Jump to **Investor — Leaving**: you see the set
  price + your position. Pick **Sell**, submit. Jump to **Investor — Staying**: pick
  **Roll over**, submit.
- **Now show the privacy beat:** while on one LP's "election filed" screen, point at the
  other LP's panel.
> "Each LP decides at the set price — and **no LP sees another LP's choice.** Look:
> their election is **`•••• sealed` — 'you can't see this, and they can't see yours.'**
> The advisor sees *that* they decided, never *what*."

### 4 · Work out who gets what — *as Advisor* (20s)
- Jump to **Advisor**: the dashboard now shows an **Action required** badge. Open the
  deal → **Work out who gets what → Compute the allocation**.
> "The engine sizes the book from the elections **at the set price** — four concrete
> legs, and **the numbers tie out**: cash to the seller, units to the roller and the
> buyer, the asset into the new vehicle."

### 5 · Approve my part — *all parties* (20s)
- **Send for approvals.** Each role approves on its own page — advisor here, then jump
  to Buyer / Staying / Leaving and approve each. Each sees **only its own leg**.
> "Each party signs **only its own obligation**. Nobody signs for the whole book."

### 6 · Close — all at once — *as Advisor* (25s) — **the moment**
- For maximum effect, have advisor + buyer + an LP tab visible side by side. As advisor:
  **All legs authorized → go to close → CLOSE — ALL AT ONCE.**
> "**One action. Every leg settles together — across every tab at once — cash, units,
> and the asset, in a single private, atomic transaction.**"

### 7 · All-or-nothing — *the failure beat* (20s) — **the clincher**
- **Reset demo**, run back to the close. This time tick **Simulate a failed leg**, fire.
> "If any single leg fails — **the whole thing rolls back. Nothing moves.** No
> half-settled mess, no stranded wire."

### 8 · Prove it was fair — *as Oversight* (15s)
- Finish a clean close. As advisor, **Grant oversight window**. Jump to **Oversight —
  LPAC**.
> "Before the close, the LPAC saw only that a deal existed. **After, a scoped window to
> verify it was fair — without ever seeing the live private inputs.**"

### 9 · The flywheel — *as Advisor* (15s)
- As advisor, **Start deal #02**. Jump to **Secondary Buyer** at pricing.
> "New deal, same buyer. **Their verification carries over — they price in one click, no
> re-onboarding.** Onboarding cost approaches zero. That's the network effect."

---

### The one-line close
> *"The price was set and fairness-validated up front, every leg settled together across
> every seat, no LP saw another LP's hand, the cash was a real stablecoin, and the
> regulator can verify — all in one private, atomic transaction."*

*(Reminder: a UX simulation — no Canton, no wallets, no network. It exists to test
whether the closing-room experience makes sense before any blockchain work.)*
