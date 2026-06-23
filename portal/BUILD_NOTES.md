# Rework plan — object-centric Continuum portal (R1+R2)

## Audit of existing build (against DESIGN STANCE)
- **Keep:** design tokens + base components in `shared/styles.css`; `shared/sync.js` (localStorage + BroadcastChannel). The tie-out math approach in `shared/state.js`.
- **Replace:** `shared/state.js` engine (single buyer / 2 LPs → multi-buyer sealed auction + 8 LPs + clearing/backstop). `shared/shell.js` + `shared/page.js` + per-role JS (lifecycle-rail-as-nav, teaching lede, YOUR MOVE, locked cards) → object-centric `shared/app.js` (sidebar, deal header, section sub-nav, task queue, dense tables).
- **Add:** bid book + auction, investor register, task queue, documents index, activity/audit, settlement legs table, receipts.

## New IA
- Left sidebar (global): Dashboard · Deals · Tasks · Participants · Documents.
- Deal workspace header: vehicle, status pill, progress meter, key figures.
- Section sub-nav: Overview · Participants · Bids/Pricing · Elections · Allocation · Settlement · Documents · Audit.
- Lifecycle = status pill + meter, never nav.

## Engine model
- Stages: setup → bidding → cleared → elections → allocation → approvals → settlement → settled.
- Sealed bids per buyer; advisor opens book; highest qualifying = clearing/lead price; syndicate at clearing backstops overflow.
- 8 LPs elect roll/sell/split at clearing price; default = sell; amend before deadline; peer-private.
- Allocation: per-LP cash/units legs + buyer units + asset transfer; pro-rata + syndicate backstop; ties out (units issued = asset NAV; cash in = cash out).
- Atomic close (all legs) + forced-failure rollback. Flywheel = deal 2, buyer credential reused.

## Hero deal (Meridian CV I), fund NAV 52.0M @ $1.00/unit
- Sell NAV 20.4 + Roll NAV 31.6 = 52.0. Buyers cover 20.4 (lead 16.0 + syndicate 4.4) @ 0.96 → cash 19.584M.
</content>
