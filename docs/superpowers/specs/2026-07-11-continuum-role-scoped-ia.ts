// Continuum — Role-Scoped Information Architecture (2026-07-11)
// ============================================================
// Source: Fable-orchestrated per-role UX review (6 seat agents) + Fable synthesis.
// Purpose: replace the one-size Deal Page (every seat sees all 6 tabs / 5 KPI tiles /
// full 6-stage stepper) with role-scoped views, WITHOUT touching custody/auth,
// contracts (DAR 1.1.0), or the ledger read/write shapes. Frontend IA/UX only.
//
// Two shells over the existing role views:
//   • FULL   — GP orchestrator: DealPage.tsx (full header, full stepper, all tabs,
//              ledger inspector). The only seat whose Canton projection legitimately
//              spans the lifecycle.
//   • FOCUSED — every other seat: FocusedPage.tsx = minimal fund-identity header +
//              optional 3-cue MiniStepper + optional 1–2 tile KPI strip + the role
//              view mounted with its existing `embedded` sections in task order.
//
// HARD RULE — projection safety: every KPI tile, stepper cue, and feed line must
// derive from an L.myAcs read the seat actually performs. A contract not in the
// seat's projection is REMOVED (never shown Pending-forever, never backed by DEMO
// constants). Sole exception: the valuer's own sign card pre-anchor, where the DEMO
// NAV range is the content being signed, not a claimed on-ledger read.
//
// Naming registry (enforced):
//   'NAV (independent)'        → only a ValuationReport in the viewer's own ACS (gp).
//   'Reference NAV (deal record)' → deal.args.refNav (room-visible on ContinuationDeal).
//   'Clearing price'           → deal.args.clearingPrice everywhere.
//   'Winning bid'              → DELETED globally (vanity derivation, no read backs it).
//   'My position'             → an LP's own stake.
//   Custodians (fixed): Fireblocks — GP Treasury · Kroll Valuation Services ·
//     State Street — LPAC · Copper · Northgate · BNY.

import type { Role } from '../../../app/web/src/state/WalletSession';

export type Layout = 'full' | 'focused';
export type StepperMode = 'full' | 'mini' | 'none';
export type HeaderMode = 'full' | 'minimal' | 'none';
export type TabId = 'overview' | 'valuation' | 'auction' | 'settlement' | 'documents' | 'ledger';

/** A projection-safe 3-cue MiniStepper spec for a focused seat. */
export type MiniStepperSpec = {
  /** ordered cue labels, derived from deal.stage + clearingPrice + the seat's own contracts */
  cues: [string, string, string];
};

export type RoleIA = {
  role: Role;
  seatLabel: string;
  custodian: string;
  layout: Layout;
  header: HeaderMode;
  stepper: StepperMode;
  /** MiniStepper cue labels when stepper === 'mini' */
  miniStepper?: MiniStepperSpec;
  /** KPI tiles to render (labels from the naming registry); [] = no KPI strip */
  kpis: string[];
  /** allowlisted tabs; [] = no tab nav (focused single-column) */
  tabs: TabId[];
  /** role-view `embedded` section keys, in display (task) order */
  sections: string[];
  /** the one thing this seat is here to do */
  primaryAction: string;
  /** promote the four-eyes ApprovalQueue into the body (only where consent releases) */
  approvalQueue: boolean;
  /** Ledger/AuditTrail + KPI inspector (oversight seats only) */
  ledgerInspector: boolean;
  beforeAfter: string;
};

// ── The locked per-role IA ──────────────────────────────────────────────────────
export const ROLE_IA: Record<Role, RoleIA> = {
  gp: {
    role: 'gp',
    seatLabel: 'General Partner — Deal Orchestrator',
    custodian: 'Fireblocks — GP Treasury',
    layout: 'full',
    header: 'full',
    stepper: 'full',
    kpis: ['NAV (independent)', 'Clearing price', 'Elections (count only)', 'CV units issued'],
    tabs: ['overview', 'valuation', 'auction', 'settlement', 'documents', 'ledger'],
    sections: ['clearing', 'elections', 'settlement', 'ceremony', 'close'],
    primaryAction: 'Advance the deal to the atomic Close',
    approvalQueue: true,
    ledgerInspector: true,
    beforeAfter:
      'Full Deal Page minus every duplicate: 4 KPI tiles (Winning-bid deleted), one Close surface (the ceremony gate), GP-voice guidance only.',
  },
  valuer: {
    role: 'valuer',
    seatLabel: 'Independent Valuation Agent',
    custodian: 'Kroll Valuation Services',
    layout: 'focused',
    header: 'minimal',
    stepper: 'none',
    kpis: [],
    tabs: [],
    sections: ['sign-anchor'],
    primaryAction: 'Sign & anchor the independent valuation',
    approvalQueue: false,
    ledgerInspector: false,
    beforeAfter:
      'Was: 6-tab page, 4/5 KPIs Pending-forever, sign card buried under Valuation. Now: one screen — identity + sign-and-anchor card → immutable anchored state.',
  },
  lpac: {
    role: 'lpac',
    seatLabel: 'LP Advisory Committee — Governance & Fairness',
    custodian: 'State Street — LPAC',
    layout: 'focused',
    header: 'minimal',
    stepper: 'mini',
    miniStepper: { cues: ['Pre-consent', 'Consented', 'Closed'] },
    // NAV (independent) is NOT projected to lpac (ValuationReport observers = agent+gp),
    // so it is dropped — the DocVerify card carries the NAV figure. Clearing is room-visible.
    kpis: ['Clearing price'],
    tabs: ['documents', 'ledger'],
    sections: ['governance', 'window'],
    primaryAction: 'Record LPAC consent',
    approvalQueue: true,
    ledgerInspector: true,
    beforeAfter:
      'Was: consent hid in an Overview queue, docs under Valuation, window behind a GP Settlement tab. Now: one governance screen (review queue + promoted ApprovalQueue → RecordConsent, then fairness window) + slim Documents/Ledger tabs.',
  },
  buyer: {
    role: 'buyer',
    seatLabel: 'Lead Buyer',
    custodian: 'Copper',
    layout: 'focused',
    header: 'minimal',
    stepper: 'mini',
    miniStepper: { cues: ['Bid open', 'Price disclosed', 'Closed'] },
    kpis: ['Clearing price'],
    tabs: [],
    sections: ['bid', 'delegation', 'holding'],
    primaryAction: 'Submit sealed bid',
    approvalQueue: false,
    ledgerInspector: false,
    beforeAfter:
      'Was: bid under Auction, delegation/holding under Settlement, 4 Pending tiles. Now: bid → delegation → holding, with the Clearing tile whose sealed→disclosed flip is the privacy story.',
  },
  lpExiting: {
    role: 'lpExiting',
    seatLabel: 'Exiting Limited Partner',
    custodian: 'Northgate',
    layout: 'focused',
    header: 'minimal',
    stepper: 'mini',
    miniStepper: { cues: ['Price set', 'Elected', 'Settled'] },
    kpis: ['My position', 'Clearing price'],
    tabs: [],
    sections: ['election', 'preauth', 'holding'],
    primaryAction: 'Elect to sell at the clearing price',
    approvalQueue: false,
    ledgerInspector: false,
    beforeAfter:
      'Was: election under Auction, pre-auth/proceeds under Settlement, mostly-Pending KPIs. Now: My Position + sell election → pre-authorize → USDC proceeds; tiles = My position + Clearing price.',
  },
  lpRolling: {
    role: 'lpRolling',
    seatLabel: 'Rolling Limited Partner',
    custodian: 'BNY',
    layout: 'focused',
    header: 'minimal',
    stepper: 'mini',
    miniStepper: { cues: ['Price set', 'Elected', 'Closed'] },
    kpis: ['My position', 'Clearing price'],
    tabs: [],
    sections: ['election', 'preauth', 'holding'],
    primaryAction: 'Elect to roll your stake',
    approvalQueue: false,
    ledgerInspector: false,
    beforeAfter:
      'Was: SellVsRoll buried under Auction with DEMO-constant inputs, rolled units under Settlement, a NAV tile the projection could never fill. Now: SellVsRoll fed by real deal fields (clearingPrice + Reference NAV from deal.args.refNav) → roll election → pre-auth → rolled units; mirrors lpExiting chrome.',
  },
};

// ── Cross-role coherence rules (from synthesis sharedNotes) ─────────────────────
export const SHARED_NOTES = [
  'Two shells only: DealPage (gp) and FocusedPage (all other seats). App.tsx branches on role; role views + commands stay verbatim (custody/auth + DAR 1.1.0 untouched, browser holds no key).',
  'Projection-safety (hard): every KPI tile / stepper cue / feed line derives from an L.myAcs read the seat already performs. Not in projection → removed, never Pending-forever, never DEMO-backed. Exception: valuer sign card pre-anchor.',
  "Naming registry: 'NAV (independent)' = ValuationReport in viewer's own ACS; 'Reference NAV (deal record)' = deal.args.refNav; 'Clearing price' everywhere; 'Winning bid' deleted globally; 'My position' = LP own stake.",
  'MiniStepper = one new component, per-seat 3-cue labels, derived from deal.stage + clearingPrice + the seat own election/holding/receipt. Same visual language as Stepper (done/active/future, aria-current, no color-only encoding).',
  'Oversight tooling (AuditTrail + KPI inspector) only for gp (Ledger tab) and lpac (slim Ledger tab). ApprovalQueue only where four-eyes items route: GP Overview + LPAC governance. Recent-activity feed is GP-only and amount-free.',
  'Portal constraints carry into FocusedPage: no gradients, no emoji, existing card/panel/callout classes, visible focus, tablist/tabpanel semantics on the lpac two-tab strip.',
  "Privacy is shown, not just enforced: keep sealed→disclosed transitions visible with copy explaining WHY a figure is absent ('amounts sealed — peer-blind until Close'), so empty states read as Canton sub-transaction privacy, not missing data.",
] as const;
