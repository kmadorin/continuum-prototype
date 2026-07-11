# Continuum — Fund-Product Redesign Spec (deal-as-lifecycle, JPM-grade)

**Date:** 2026-07-11 · **Status:** Approved (owner + Fable) → executing on `integration`
**Builds on** the custody app (`2026-07-11-continuum-custody-spec.md`), already live at
https://continuum-custody.fly.dev/. This is a UX/product layer, not an auth change.
**Reference:** J.P. Morgan OnChain Liquidity MMF page (fund header · sticky KPI stat row · tab nav ·
Documents accordion). **Design principles:** portal tokens (Archivo + IBM Plex Mono, dark institutional,
one accent, 8px rhythm), content discipline, no gradient/emoji slop, accessible focus/loading/disabled/pending
states, density-with-whitespace, minimal motion.

## Reframe
Organize the UI around **the deal as a document-backed lifecycle**, not around per-role action buttons.
Every number on screen is "as of" a date and traces to a hash on the ledger.

## 1. Shared Deal Page (all roles land here; role sets emphasis + the one actionable CTA)
- **Header:** `Project Continuum CV I, L.P.` · GP-Led Continuation Vehicle · Sponsor: Fireblocks GP ·
  a **lifecycle stepper**: `Valuation → LPAC Consent → Auction → Elections → Issuance → Close` (current stage lit).
- **Sticky KPI stat row** (each with "as of DATE" + a shield icon → ledger verify): **NAV (independent)**
  $500.0M · **Clearing Price** 96% ($480.0M) · **Winning Bid** · **Elections** Roll%/Sell% · **CV Units Issued**
  4,800,000 @ $1.00. Before a stage completes → `— Pending [stage]`.
- **Tabs:** Overview · Valuation · Auction & Elections · Settlement · Documents · Ledger (the existing Inspector, demoted).
- Kill per-role button panels → **≤1 contextual CTA** per stage on the relevant tab.

## 2. Per-role journeys
- **GP (Fireblocks):** full stepper + all elections + docs. CTAs by stage: Set clearing (Valuation) → Open elections (Auction) → **Issue units & Close** (Settlement, hero). Cmds: `SetClearing`,`OpenElections`, mint+`Close`.
- **Buyer (Copper):** Valuation tab = diligence room; own SealedBid only; post-close **My Holding** w/ provenance. Cmds: `SealedBid`, propose-accept.
- **Exiting LP (Northgate):** **My Position** (stake, proceeds = stake×96%), valuation summary, own election. Cmd: `LPElection(Sell)`.
- **Rolling LP (BNY):** My Position + **Sell-vs-Roll comparison** (proceeds vs CV units) — the product-thinking moment. Cmd: `LPElection(Roll)`.
- **LPAC (State Street):** **review queue** (Valuation + Fairness side-by-side + hashes) → Record consent (four-eyes queue) → then read-only "oversight mode." Cmd: `RecordConsent`.
- **Valuer (Kroll) — NEW 6th role:** minimal screen — sign/anchor the `ValuationReport` (NAV range + doc hash) → read-only.

## 3. Valuation tab + Documents (JPM-style)
- **Valuation tab:** valuer identity + "Independent Valuation Agent" badge; **NAV range bar** (low–mid–high) with
  the 96% clearing price plotted (one glance: price inside the independent range); document card (PDF icon, title,
  signed-by, date, **sha256** truncated+copyable, `View PDF` + `Verify on-ledger`); provenance strip
  "4,800,000 CV units issued under IssuanceBasis #… referencing this report's hash."
- **Documents tab:** accordion — *Deal Formation* (Valuation Report, Fairness Opinion) · *Process Certifications*
  (LPAC Consent, Auction Certificate) · *Settlement* (PSA, IssuanceBasis/Disclosure). Each row: icon · title · signer
  party · date · hash chip · `Verify`. Not-yet-produced docs → greyed "Pending — produced at [stage]."
- **Verify-on-ledger:** backend recomputes sha256 of the stored PDF, matches it to the anchored `contentHash` on
  the contract → "Hash matches on-chain anchor · contract #…, tx …".

## 4. Provenance chain (the institutional pitch)
`Holding → IssuanceBasis → {valuationHash, fairnessHash, auctionCertHash} → documents`.
- Mint CV units with `meta_` carrying `continuum/valuation-sha256` + `continuum/issuance-basis` (on-chain link;
  the on-chain spec §4.3 already intends this — close-wallets.ts currently mints with empty meta_, fix it).
- `IssuanceBasis` references the ValuationReport/Fairness/AuctionCert cids (already does) whose `contentHash`
  fields carry the doc hashes. UI resolves the chain; click a minted unit → drawer: "Issued under IssuanceBasis #…
  · Valuation sha256 a3f9… ✓ · Fairness ✓ · Auction ✓ · mint tx updateId …" + `Open report` + `Inspect mint tx`.

## 5. Mint = hero moment
- **GP "Issue Units" gate-ceremony card** (Settlement tab): 4 LIVE check-lines (✓ valuation anchored `a3f9…`
  Kroll · ✓ fairness · ✓ LPAC consent · ✓ auction 96%) → `[Issue units against this basis]` (disabled if any
  gate unmet). On confirm → success w/ mint tx updateId + `Inspect transaction`; KPI "CV Units Issued" flips
  Pending→live. One animation budget: checkmarks resolving + unit count-up.
- **Buyer/Roller Holding receipt:** `4,800,000 CV units · cost $460.8M · 96.0% of independent NAV` + provenance
  line "Issued under Valuation Report sha256 a3f9… ✓ verified" + `View report` + `Inspect mint tx`.
- Sequence the demo to end on **Close** (3-leg diagram → one atomic updateId).

## 6. Backend additions
- 6th custody tenant **Kroll Valuation Services** (valuer; signs `ValuationReport`, signatory ≠ gp ≠ lpac). Login `valuer`/`valuer-demo`.
- Sample PDFs (Valuation Report on Kroll letterhead; Fairness Opinion; PSA) generated + their real **sha256**
  used as the on-chain `contentHash` when creating the anchor contracts. Backend serves the PDFs + a `/verify`
  endpoint (recompute sha256, compare to on-chain).
- Mint step sets CV-unit `meta_` = valuation hash + issuance-basis id.
- No Daml contract change required (ValuationReport already `signatory agent`; IssuanceBasis already references cids;
  Holding.meta_ already a TextMap). Only the FLOW (who signs valuation + what meta_ the mint carries) changes.

## 7. Build order (Fable) — each independently demoable
1. **Deal Page shell** (header + stepper + KPI row + tab scaffold, shared). Highest leverage.
2. **Valuation tab + Documents accordion + Verify** (+ generate the sample Valuation Report PDF).
3. **Mint ceremony card + Holding-provenance card** (+ mint meta_ + Holding→basis→hash resolution).
4. **Valuer 6th tenant** (Kroll) — timeboxed ~1-2h; fallback = relabel.
5. **Per-role strip-down** (My Position + one CTA; Sell-vs-Roll for BNY; LPAC oversight mode).

## 8. Do NOT build
Performance/Fees tab (no history — fake charts hurt credibility), notifications/email, mobile, deal editing,
liquidation variant, reworking the Ledger Inspector (done — just deep-link into it).
