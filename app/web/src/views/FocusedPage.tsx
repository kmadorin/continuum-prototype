// FocusedPage — the role-scoped shell for every NARROW seat (valuer, buyer,
// lpExiting, lpRolling, lpac). The GP keeps the full DealPage; everyone else lands
// here: a minimal fund-identity header, an optional 3-cue MiniStepper, an optional
// 1–2 tile KPI strip, then the role's OWN view mounted with its existing `embedded`
// sections in task order. No tabs, no lifecycle-wide chrome, no data the seat's
// Canton projection cannot hold.
//
// Projection safety (hard rule): every KPI tile and stepper cue below derives ONLY
// from an L.myAcs read this seat actually performs (deal, its own election / holding
// / receipt). A contract not in the seat's projection is never rendered as
// Pending-forever and never sourced from DEMO constants. Custody/auth and the
// ledger command shapes are untouched — this is chrome, the role views do the work.
//
// Spec: docs/superpowers/specs/2026-07-11-continuum-role-scoped-ia.ts
import { useEffect, useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, R, DEMO, positionNav, atClearing } from '../lib/useLedger';
import { useSession, type Role } from '../state/WalletSession';
import { useInspector } from '../state/Inspector';
import { pick } from './parts';
import Stepper, { type Stage } from '../components/Stepper';
import KpiRow, { type Kpi } from '../components/KpiRow';
import Tabs, { type TabDef } from '../components/Tabs';
import Buyer from './Buyer';
import ExitingLP from './ExitingLP';
import RollingLP from './RollingLP';
import LPAC from './LPAC';
import Valuer from './Valuer';
import AuditTrail from './AuditTrail';
import DocumentsTab from './DocumentsTab';
import ApprovalQueue, { usePendingApprovals } from './ApprovalQueue';

const fmtUsdM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
const LP_POSITION_NAV = Number(DEMO.interestNav); // an LP's own stake — its own record

// The projection-safe facts every focused seat derives its chrome from.
type Facts = {
  deal: ActiveContract | null;
  hasReceipt: boolean;
  ownElection: boolean;
  ownUnits: number;
  ownUsdc: number;
};

/** Three-cue mini lifecycle for a focused seat — projection-safe per role. */
function miniStages(role: Role, f: Facts): Stage[] {
  const stage = (f.deal?.args.stage as string | undefined) ?? undefined;
  const priceSet = !!f.deal?.args.clearingPrice;
  const consented = stage === 'Consented' || stage === 'Electing' || stage === 'Closed';
  const closed = stage === 'Closed' || f.hasReceipt;

  const build = (cues: [string, string, string], done: [boolean, boolean, boolean]): Stage[] => {
    const first = done.findIndex((d) => !d);
    return cues.map((label, i) => ({
      label,
      state: done[i] ? 'done' : i === first ? 'active' : 'future',
    }));
  };

  switch (role) {
    case 'buyer':
      return build(['Bid open', 'Price disclosed', 'Closed'], [priceSet, closed || f.ownUnits > 0, closed || f.ownUnits > 0]);
    case 'lpExiting':
      return build(['Price set', 'Elected', 'Settled'], [priceSet, f.ownElection, closed || f.ownUsdc > 0]);
    case 'lpRolling':
      return build(['Price set', 'Elected', 'Closed'], [priceSet, f.ownElection, closed || f.ownUnits > 0]);
    case 'lpac':
      return build(['Pre-consent', 'Consented', 'Closed'], [consented, closed, closed]);
    default:
      return [];
  }
}

/** KPI tiles for a focused seat — Clearing (all but valuer) + My position (LPs). */
function focusedTiles(role: Role, f: Facts): Kpi[] {
  const tiles: Kpi[] = [];
  if (role === 'lpExiting' || role === 'lpRolling') {
    tiles.push({
      label: 'My position',
      value: fmtUsdM(positionNav(role)),
      sub: 'Your stake — own record',
      asOf: DEMO.closeDate,
    });
  }
  if (role !== 'valuer') {
    // The clearing price is a DEAL fact, so its sub-line is the deal-level figure — the
    // same number on every seat. What it means for you personally is the "My position"
    // tile and the sell-vs-roll panel; conflating the two put an LP's proceeds on the
    // buyer's and the LPAC's screen.
    const pct = f.deal?.args.clearingPrice != null ? Number(f.deal.args.clearingPrice) : null;
    const refNav = f.deal?.args.refNav != null ? Number(f.deal.args.refNav) : null;
    tiles.push(
      pct != null
        ? {
            label: 'Clearing price',
            value: `${Math.round(pct * 100)}% of NAV`,
            sub: refNav != null ? `${fmtUsdM(atClearing(refNav, pct))} purchase price` : undefined,
            asOf: DEMO.closeDate,
          }
        : { label: 'Clearing price', value: '— Pending Auction', pending: true },
    );
  }
  return tiles;
}

function SeatBody({ role }: { role: Role }) {
  const { items: approvals } = usePendingApprovals();
  const [subTab, setSubTab] = useState<'documents' | 'ledger'>('documents');

  switch (role) {
    case 'valuer':
      return <Valuer />;
    case 'buyer':
      return <Buyer embedded={['bid', 'delegation', 'holding']} />;
    case 'lpExiting':
      return <ExitingLP embedded={['election', 'preauth', 'holding']} />;
    case 'lpRolling':
      return <RollingLP embedded={['election', 'preauth', 'holding']} />;
    case 'lpac': {
      const tabs: TabDef[] = [
        { id: 'documents', label: 'Documents' },
        { id: 'ledger', label: 'Ledger' },
      ];
      return (
        <div className="stack g4">
          <LPAC embedded={['governance']} />
          {approvals.length > 0 && <ApprovalQueue />}
          <LPAC embedded={['window']} />
          <Tabs tabs={tabs} current={subTab} onChange={(id) => setSubTab(id as 'documents' | 'ledger')} />
          <div className="deal-panel" role="tabpanel" id={`panel-${subTab}`} aria-labelledby={`tab-${subTab}`}>
            {subTab === 'documents' ? <DocumentsTab /> : <AuditTrail />}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

export default function FocusedPage() {
  const L = useLedger();
  const { role } = useSession();
  const inspector = useInspector();

  const [facts, setFacts] = useState<Facts>({ deal: null, hasReceipt: false, ownElection: false, ownUnits: 0, ownUsdc: 0 });

  // Poll only what the chrome needs: the deal (stage + clearing) plus this seat's own
  // election / holdings / receipt. The role view does its own richer reads.
  useEffect(() => {
    if (!role) return;
    let on = true;
    const tick = async () => {
      try {
        const [d, rec, el, h] = await Promise.all([
          L.myAcs(R.deal),
          L.myAcs(R.receipt),
          L.myAcs(R.election),
          L.myAcs(R.holding),
        ]);
        if (!on) return;
        const units = h.filter((c) => c.args.owner === L.me && c.args.instId === DEMO.unit).reduce((s, c) => s + Number(c.args.amount), 0);
        const usdc = h.filter((c) => c.args.owner === L.me && c.args.instId === DEMO.usdc).reduce((s, c) => s + Number(c.args.amount), 0);
        setFacts({
          deal: pick(d, (c) => c.args.cv === DEMO.cv) ?? pick(d),
          hasReceipt: rec.length > 0,
          ownElection: !!pick(el, (c) => c.args.lp === L.me),
          ownUnits: units,
          ownUsdc: usdc,
        });
      } catch {
        /* transient read error — next tick retries */
      }
    };
    void tick();
    const id = setInterval(tick, 3000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [L, role]);

  if (!role) return null;

  const stages = role === 'valuer' ? [] : miniStages(role, facts);
  const tiles = focusedTiles(role, facts);
  const oversight = role === 'lpac';

  return (
    <div className="deal-page focused-page stack g4">
      <header className="deal-header focused-header">
        <div className="dh-titles">
          <span className="dh-eyebrow">GP-Led Continuation Vehicle</span>
          <h1>Project Continuum CV I, L.P.</h1>
        </div>
        {stages.length > 0 && <Stepper stages={stages} size="compact" />}
      </header>

      {tiles.length > 0 && <KpiRow tiles={tiles} variant="strip" onInspect={oversight ? inspector.open : undefined} />}

      <div className="deal-panel">
        <SeatBody role={role} />
      </div>
    </div>
  );
}
