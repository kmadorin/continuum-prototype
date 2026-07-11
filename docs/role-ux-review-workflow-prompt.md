# Handoff prompt — per-role UX review + role-scoped views (Fable-orchestrated workflow)

> Paste the block below into a FRESH chat. It runs a multi-agent **Workflow** (you are explicitly
> opting into orchestration — the keyword is in the prompt) with **Fable** as the orchestrating/decision
> model, does a deep per-role UX review of the Continuum app, decides what each role should and should
> NOT see, then implements role-scoped views and redeploys.

---

You are picking up **Continuum** — a live, ILPA-grounded **GP-led continuation-fund settlement app on
Canton devnet**, institutional custody model. It works end-to-end and is deployed. Your job this session
is a **per-role UX review + role-scoped view redesign**, run as a **Fable-orchestrated multi-agent
workflow**. Use the **Workflow** tool (this is an explicit opt-in to orchestration). Prefer **Fable**
(`claude-fable-5`) for the review/decision/synthesis agents; a standard model is fine for mechanical
implementation stages.

## The problem to solve
Every role currently lands on the SAME shared "Deal Page" — full lifecycle stepper (LPAC Consent →
Valuation → Auction → Elections → Issuance → Close), all 5 KPI tiles, and all 6 tabs (Overview ·
Valuation · Auction & Elections · Settlement · Documents · Ledger). The role only changes which embedded
CTA appears inside each tab. So a narrow participant sees far more than their job needs. Example the owner
flagged: the **independent Valuer (Kroll)** — whose ONLY job is to sign & anchor the valuation — sees the
whole deal UI (auction, settlement, elections tabs, the full stepper, all KPIs), when they should see a
focused screen: the valuation **request** + a **submit/sign** action (the report can be preloaded for the
demo; they only sign the transaction). Same likely over-exposure for the exiting/rolling LPs and the buyer.

**Decide, per role, what each seat should SEE and DO — and what is redundant/should be hidden — then
implement role-scoped views** while keeping the product coherent and the custody/auth model unchanged.
The GP/advisor is the orchestrator and legitimately needs the fullest view; the narrow roles (Valuer,
LPs, Buyer, LPAC) should get scoped, purposeful screens.

## Where things are (read these first)
- Repo: `/Users/kirillmadorin/Projects/hackathons/canton/continuum-prototype`, git branch **`integration`**
  (do NOT push; commit locally). App code under `app/` (`app/web` = React+TS+Vite frontend; `app/custody`
  = the Hono custody backend; `app/ledger-client` = the JSON Ledger API client; `app/scripts` = devnet
  flows). Deployed live at **https://continuum-custody.fly.dev/** (fly.io; `cd app && fly deploy --app
  continuum-custody` to redeploy; single machine).
- **Memory** (full project state, read it): the assistant's auto-memory file
  `continuum-devnet-app-phase.md` — architecture, custody model, the fund-product redesign, deploy details.
- **Specs** (authoritative, read the relevant ones):
  - `docs/superpowers/specs/2026-07-11-continuum-fund-product-spec.md` — the deal-as-lifecycle IA, tabs,
    per-role journeys, valuation/docs/mint provenance.
  - `docs/superpowers/specs/2026-07-11-continuum-custody-spec.md` — the custody backend (login, per-party
    signing, enforcement, audit, approval queue, ledger inspector). AUTH IS OUT OF SCOPE for this review.
  - `docs/contract-ui-role-map.md` — every role's on-chain actions + reads, mapped to the deployed Daml.
  - `docs/superpowers/specs/2026-07-09-continuum-onchain-spec.md` — the contracts + ILPA economics.
- **Domain grounding**: `Continuation-Funds-Considerations-for-Limited-Partners-and-General-Partners.pdf`
  (repo root — ILPA May-2023 guidance). Canonical stages + the truth that **the competitive auction
  discovers the price; the valuation + fairness opinion validate it**; LPAC waives the conflict BEFORE the
  process runs (not the price). Also web: ILPA GP-led secondary guidance, CFA "Continuation Funds: Ethics
  in Private Markets."
- **Design system**: portal tokens already in `app/web/src/styles.css` (Archivo + IBM Plex Mono, dark
  institutional, one accent, 8px rhythm). Principles: content discipline, no gradient/emoji slop, accessible
  focus/loading/pending/disabled states, density-with-whitespace, minimal motion. (Ref repo the owner likes:
  github.com/Trystan-SA/claude-design-system-prompt.)

## The 6 roles + their real jobs (custodian tenants; each signs its own Canton txs)
Demo logins = username/password `<role>`/`<role>-demo`:
- **GP / Advisor** — Fireblocks — GP Treasury. Runs the deal: opens the room (= requests valuation), sets
  clearing price, opens elections, runs the issuance gate-ceremony + atomic Close. **Needs the fullest view
  + the stepper + all KPIs.**
- **Valuer** — Kroll Valuation Services. ONE job: sign & anchor the independent `ValuationReport` (NAV
  range, doc sha256). Then read-only. **Should see a focused request→sign screen, not the whole deal.**
- **LPAC** — State Street Digital. Reviews valuation + fairness, records the conflict **waiver** (four-eyes
  approval queue), then oversight/read-only. **Governance-scoped view.**
- **Buyer** — Copper — Northbeam Secondaries. Diligence on the valuation → submit sealed bid → accept
  settlement authority → post-close Holding receipt. **Buyer-scoped view.**
- **Exiting LP** — Northgate — Calder Family Office. My Position → elect SELL → proceeds. **LP-scoped.**
- **Rolling LP** — BNY — Hawthorn Pension. My Position + Sell-vs-Roll comparison → elect ROLL → new-units
  Holding receipt. **LP-scoped.**

## Current frontend structure (what to review/refactor)
- `app/web/src/views/DealPage.tsx` — the shared Deal Page: builds `tabs: TabDef[]` IDENTICALLY for all
  roles (line ~262), renders the stepper (`components/Stepper.tsx`), KPI row (`components/KpiRow.tsx`),
  tab nav (`components/Tabs.tsx`), and per-tab role components. **This identical-tabs-for-all is the root
  of the over-exposure.**
- Role view components: `app/web/src/views/{Advisor,Buyer,ExitingLP,RollingLP,LPAC,Valuer}.tsx`
  (mounted `embedded` per tab), `ValuationTab.tsx`, `DocumentsTab.tsx`, `ApprovalQueue.tsx`,
  `AuditTrail.tsx`, `LedgerInspector.tsx`, `SellVsRoll.tsx`, `IssueUnitsGate.tsx`, `HoldingReceipt.tsx`.
- State/hooks: `state/WalletSession.tsx` (`useSession` → role/party/custodianName), `lib/useLedger.ts`
  (`useLedger` → `me`, `myAcs`, `acsOf`, `submit`, `T`/`R` template maps, `counter`, `custodians`, `DEMO`),
  `state/{Toast,Inspector}.tsx`. Backend endpoints: `/auth/login`,`/me`,`/action`,`/api/v2/*` (per-party
  reads proxy),`/registry`,`/audit`,`/docs/manifest`,`/docs/:name`,`/verify/:name`,`/ledger/update/:id`.

## What the workflow should produce
1. **Per-role deep review (parallel, one Fable agent per role):** for each of the 6 roles, decide —
   given its real job (above) + ILPA + the custody model — exactly what that seat should SEE (which of:
   header, stepper, which KPI tiles, which tabs, which sections/CTAs, the ledger inspector/audit) and what
   is REDUNDANT and should be hidden. Ground each decision in the role's actual on-chain reads/actions
   (`contract-ui-role-map.md`) and its Canton projection (a party can't see contracts it isn't a stakeholder
   of anyway). Output a structured per-role IA: `{ role, sees: {...}, hidden: [...], primaryAction, layout }`.
2. **Synthesis (Fable):** reconcile into a coherent per-role IA that keeps ONE design language and shared
   components (don't fork the app), decides the mechanism (e.g. a role→tab/section allowlist + a "focused"
   layout for narrow roles like the Valuer vs the "full" Deal Page for the GP), and resolves tensions
   (product coherence vs role simplicity). Write it to a short spec:
   `docs/superpowers/specs/2026-07-11-continuum-role-scoped-ia.md`.
3. **Implementation (subagents, per role or per component):** refactor `DealPage.tsx` so tabs/KPIs/stepper
   are scoped by role; give the Valuer (and other narrow roles) a focused view (Valuer = the valuation
   request + sign/submit action + the deal identity; report preloaded for demo; sign the tx). Keep the GP
   full. Reuse existing components; portal design; accessible; NO changes to custody/auth/ledger-client/
   contracts. Keep tests green (`cd app/web && npx vitest run`; currently ~63 pass) and `npm run build` clean.
4. **Verify + redeploy:** build, run the app, sanity-check each role's scoped view, then `fly deploy`.
   Report what each role now sees vs before.

## Hard constraints
- Custody/auth model, contracts (DAR 1.1.0), ledger-client, and the backend are OUT OF SCOPE — do not
  change them. This is a frontend IA/UX refactor only (a role→view mechanism), plus optional copy tweaks.
- Keep it SIMPLE for non-crypto users; each seat should feel purposeful, not a generic action list.
- Event-driven off on-chain state (the ledger is the coordinator; no cross-tab sync). Respect Canton
  projection (roles only observe their own contracts).
- SECURITY: the browser holds NO signing key (custody backend signs). Never introduce client-side keys;
  never log/persist secrets. `.gitignore` already blocks `custody-keys*.json`/`.env`.
- Portal design tokens; no gradient/emoji; accessible; minimal motion.

## Deliverables of this session
(1) The per-role IA decision spec `docs/superpowers/specs/2026-07-11-continuum-role-scoped-ia.md`;
(2) implemented role-scoped views (esp. a focused Valuer screen) on `integration`, build + tests green;
(3) redeployed to https://continuum-custody.fly.dev/; (4) a short report: per role, what it now sees vs
the old full-deal view, and any tensions you resolved. Do NOT push to a git remote.
