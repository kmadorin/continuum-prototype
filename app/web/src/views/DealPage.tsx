// Shared Deal Page — the JPM-grade fund product every signed-in role lands on. It
// replaces the old per-role button panels with one document-backed lifecycle:
//
//   Header (fund identity + lifecycle stepper)
//   Sticky KPI stat row (NAV · Clearing · Winning bid · Elections · Units issued)
//   Tab nav: Overview · Valuation · Auction & Elections · Settlement · Documents · Ledger
//
// Everyone sees the SAME structure; the signed-in role only sets emphasis and which
// contextual CTA is enabled. The existing role commands are preserved verbatim — the
// role views mount `embedded` under the tab where their CTA belongs (Task 1 keeps the
// wiring; the rich per-tab designs land in later tasks). The Ledger tab is the
// existing custody Audit trail + Inspector, demoted here.
//
// Stepper/KPI derivation reads the ContinuationDeal + SettlementReceipt from THIS
// party's own ACS projection, so the chrome reflects real on-ledger state, never a
// local flag. NAV (independent) is a placeholder until the Valuation build wires the
// real ValuationReport read (noted below).
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, R, DEMO, shortParty } from '../lib/useLedger';
import { useSession, type Role } from '../state/WalletSession';
import { useInspector } from '../state/Inspector';
import { pick } from './parts';
import Stepper, { type Stage } from '../components/Stepper';
import KpiRow, { type Kpi } from '../components/KpiRow';
import Tabs, { type TabDef } from '../components/Tabs';
import Advisor from './Advisor';
import Buyer from './Buyer';
import ExitingLP from './ExitingLP';
import RollingLP from './RollingLP';
import LPAC from './LPAC';
import Valuer from './Valuer';
import AuditTrail from './AuditTrail';
import ApprovalQueue, { usePendingApprovals } from './ApprovalQueue';
import ValuationTab from './ValuationTab';
import DocumentsTab from './DocumentsTab';

// Independent NAV shown in the KPI row. Placeholder until the Valuation build reads
// the anchored ValuationReport; the clearing $ figure is derived from it so the row
// stays internally consistent (96% of $500.0M = $480.0M).
const NAV_USD = 500_000_000;
const fmtUsdM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

type TabId = 'overview' | 'valuation' | 'auction' | 'settlement' | 'documents' | 'ledger';

// ── lifecycle derivation ──────────────────────────────────────────────────────
const STAGE_LABELS = ['Valuation', 'LPAC Consent', 'Auction', 'Elections', 'Issuance', 'Close'] as const;

/**
 * Map the on-ledger deal state to the six-stage stepper. The ContinuationDeal.stage
 * field is Setup → Consented → Electing → Closed; a SettlementReceipt means Close
 * happened. Because the demo close is one atomic step (issuance + settlement in a
 * single tx), Elections/Issuance/Close all resolve together at close — before that,
 * the active stage is the first not-yet-done one. Ambiguity noted per spec.
 */
export function deriveStages(deal: ActiveContract | null, hasReceipt: boolean): Stage[] {
  const stage = (deal?.args.stage as string | undefined) ?? undefined;
  const hasDeal = !!deal;
  const hasClearing = !!deal?.args.clearingPrice;
  const consented = stage === 'Consented' || stage === 'Electing' || stage === 'Closed';
  const closed = stage === 'Closed' || hasReceipt;

  const done: Record<(typeof STAGE_LABELS)[number], boolean> = {
    Valuation: hasDeal,
    'LPAC Consent': consented,
    Auction: hasClearing,
    Elections: closed,
    Issuance: closed,
    Close: closed,
  };

  const firstOpen = STAGE_LABELS.findIndex((l) => !done[l]);
  return STAGE_LABELS.map((label, i) => ({
    label,
    state: done[label] ? 'done' : i === firstOpen ? 'active' : 'future',
  }));
}

/** One-liner steering the signed-in role at the current lifecycle stage. */
function whatNext(role: Role, activeLabel: string | null): string {
  if (!activeLabel) return 'Deal closed — the settlement receipt is anchored on-ledger. Verify it in the Ledger tab.';
  const m: Record<string, Partial<Record<Role, string>>> = {
    Valuation: {
      gp: 'Open the closing room, then set the clearing price once the independent valuation is in.',
      valuer: 'Sign and anchor the independent valuation on the Valuation tab — your hash is the reference every seat verifies.',
      lpac: 'Review and verify the valuation + fairness documents on the Valuation tab.',
      buyer: 'Review the independent valuation, then ready your sealed bid.',
      lpExiting: 'Await the independent valuation — your sell decision comes after the price is set.',
      lpRolling: 'Await the independent valuation — weigh roll vs sell once the price is set.',
    },
    'LPAC Consent': {
      gp: 'Awaiting LPAC consent — it advances the deal so you can open elections.',
      lpac: 'Record LPAC consent from your Approval queue to open the room.',
    },
    Auction: {
      gp: 'Set the clearing price and disclose it to the room (Valuation tab).',
      buyer: 'Submit your sealed bid on the Auction & Elections tab — blind to every other buyer.',
      lpExiting: 'The auction is clearing — your election opens next.',
      lpRolling: 'The auction is clearing — your roll/sell election opens next.',
    },
    Elections: {
      gp: 'Open elections, then run the settlement backstage on the Settlement tab.',
      buyer: 'Accept your execution delegation so the GP can settle your unit leg at Close.',
      lpExiting: 'Elect to sell at the clearing price on the Auction & Elections tab.',
      lpRolling: 'Compare roll vs sell, then file your election on the Auction & Elections tab.',
    },
    Issuance: {
      gp: 'Issue units and run the atomic Close on the Settlement tab.',
    },
    Close: {
      gp: 'Run the atomic Close on the Settlement tab — one transaction settles every leg.',
    },
  };
  return m[activeLabel]?.[role] ?? `Awaiting the GP to progress the ${activeLabel} stage.`;
}

// ── activity feed ─────────────────────────────────────────────────────────────
type FeedItem = { text: string; tone: 'ok' | 'info' };

function buildFeed(s: {
  deal: ActiveContract | null;
  elections: ActiveContract[];
  bids: ActiveContract[];
  consents: ActiveContract[];
  valuations: ActiveContract[];
  opinions: ActiveContract[];
  receipts: ActiveContract[];
}): FeedItem[] {
  const f: FeedItem[] = [];
  if (s.deal) f.push({ text: `Continuation vehicle opened — ${String(s.deal.args.cv)}`, tone: 'info' });
  s.valuations.forEach(() => f.push({ text: 'Independent valuation report anchored', tone: 'ok' }));
  s.opinions.forEach(() => f.push({ text: 'Fairness opinion anchored', tone: 'ok' }));
  s.consents.forEach(() => f.push({ text: 'LPAC recorded consent', tone: 'ok' }));
  if (s.deal?.args.clearingPrice) {
    const pct = Math.round(Number(s.deal.args.clearingPrice) * 100);
    f.push({ text: `Clearing price set — ${pct}% of NAV`, tone: 'ok' });
  }
  s.bids.forEach(() => f.push({ text: 'Sealed bid submitted — blind to peers and to the GP', tone: 'info' }));
  for (const e of s.elections) {
    const lp = shortParty(String(e.args.lp));
    const sell = Number(e.args.sellNav) > 0;
    f.push({ text: `${lp} elected to ${sell ? 'SELL' : 'ROLL'}`, tone: 'info' });
  }
  for (const r of s.receipts) {
    f.push({ text: `Settlement receipt issued — ${String(r.args.totalUnits)} CV units`, tone: 'ok' });
  }
  return f.reverse(); // newest lifecycle event first
}

export default function DealPage() {
  const L = useLedger();
  const { role } = useSession();
  const inspector = useInspector();
  const [tab, setTab] = useState<TabId>('overview');

  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [receipts, setReceipts] = useState<ActiveContract[]>([]);
  const [elections, setElections] = useState<ActiveContract[]>([]);
  const [bids, setBids] = useState<ActiveContract[]>([]);
  const [consents, setConsents] = useState<ActiveContract[]>([]);
  const [valuations, setValuations] = useState<ActiveContract[]>([]);
  const [opinions, setOpinions] = useState<ActiveContract[]>([]);

  const { items: approvals } = usePendingApprovals();

  // Poll this party's own projection so the stepper + KPI row track real state.
  useEffect(() => {
    let on = true;
    const tick = async () => {
      try {
        const [d, rec, el, sb, cons, val, op] = await Promise.all([
          L.myAcs(R.deal),
          L.myAcs(R.receipt),
          L.myAcs(R.election),
          L.myAcs(R.sealedBid),
          L.myAcs(R.consent),
          L.myAcs(R.valuation),
          L.myAcs(R.opinion),
        ]);
        if (!on) return;
        setDeal(pick(d, (c) => c.args.cv === DEMO.cv));
        setReceipts(rec);
        setElections(el);
        setBids(sb);
        setConsents(cons);
        setValuations(val);
        setOpinions(op);
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
  }, [L]);

  const hasReceipt = receipts.length > 0;
  const stages = deriveStages(deal, hasReceipt);
  const activeLabel = stages.find((s) => s.state === 'active')?.label ?? null;
  const stageName = (deal?.args.stage as string | undefined) ?? undefined;
  const electionsPhase = stageName === 'Electing' || stageName === 'Closed' || hasReceipt;

  // ── KPI tiles ───────────────────────────────────────────────────────────────
  const clearingPct = deal?.args.clearingPrice != null ? Number(deal.args.clearingPrice) : null;
  const clearingUsd = clearingPct != null ? NAV_USD * clearingPct : null;
  const receipt = receipts[0] ?? null;

  const tiles: Kpi[] = [
    {
      label: 'NAV (independent)',
      value: fmtUsdM(NAV_USD),
      sub: 'Independent valuation agent',
      asOf: DEMO.closeDate,
    },
    clearingPct != null
      ? {
          label: 'Clearing price',
          value: `${Math.round(clearingPct * 100)}% of NAV`,
          sub: fmtUsdM(clearingUsd!),
          asOf: DEMO.closeDate,
        }
      : { label: 'Clearing price', value: '— Pending Auction', pending: true },
    clearingPct != null
      ? {
          label: 'Winning bid',
          value: fmtUsdM(clearingUsd!),
          sub: 'Lead buyer selected',
          asOf: DEMO.closeDate,
        }
      : { label: 'Winning bid', value: '— Pending Auction', pending: true },
    electionsPhase
      ? {
          label: 'Elections',
          value: `${elections.length} of 2 responded`,
          sub: 'Roll / Sell — amounts sealed',
          asOf: DEMO.closeDate,
        }
      : { label: 'Elections', value: '— Pending Elections', pending: true },
    receipt
      ? {
          label: 'CV units issued',
          value: Number(receipt.args.totalUnits).toLocaleString(),
          sub: '@ $1.00',
          asOf: DEMO.closeDate,
        }
      : { label: 'CV units issued', value: '— Pending Issuance', pending: true },
  ];

  // ── tabs ──────────────────────────────────────────────────────────────────
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview', badge: approvals.length || undefined },
    { id: 'valuation', label: 'Valuation' },
    { id: 'auction', label: 'Auction & Elections' },
    { id: 'settlement', label: 'Settlement' },
    { id: 'documents', label: 'Documents' },
    { id: 'ledger', label: 'Ledger' },
  ];

  const feed = buildFeed({ deal, elections, bids, consents, valuations, opinions, receipts });

  return (
    <div className="deal-page stack g4">
      {/* Header ---------------------------------------------------------------- */}
      <header className="deal-header">
        <div className="dh-titles">
          <span className="dh-eyebrow">GP-Led Continuation Vehicle</span>
          <h1>Project Continuum CV I, L.P.</h1>
          <p className="dh-sponsor">Sponsor: Fireblocks — GP Treasury</p>
        </div>
        <Stepper stages={stages} size="compact" />
      </header>

      {/* Sticky KPI row -------------------------------------------------------- */}
      <KpiRow tiles={tiles} onInspect={inspector.open} />

      {/* Tab nav --------------------------------------------------------------- */}
      <Tabs tabs={tabs} current={tab} onChange={(id) => setTab(id as TabId)} />

      <div className="deal-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <OverviewTab
            role={role}
            stages={stages}
            whatNext={whatNext(role ?? 'gp', activeLabel)}
            feed={feed}
            hasApprovals={approvals.length > 0}
          />
        )}

        {tab === 'valuation' && (
          <div className="stack g4">
            {role === 'valuer' && <Valuer />}
            <ValuationTab report={pick(valuations)} onNavigate={setTab} />
            {role === 'gp' && <Advisor embedded={['clearing']} />}
            {role === 'lpac' && <LPAC embedded={['governance']} />}
          </div>
        )}

        {tab === 'auction' && (
          <TabActions
            title="Auction & Elections"
            note="Sealed-bid auction and per-LP roll/sell elections. Amounts stay peer-blind until the atomic Close. Your contextual action for this stage is below."
          >
            {role === 'gp' && <Advisor embedded={['elections']} />}
            {role === 'buyer' && <Buyer embedded={['bid']} />}
            {role === 'lpExiting' && <ExitingLP embedded={['election']} />}
            {role === 'lpRolling' && <RollingLP embedded={['election']} />}
            {role === 'lpac' && (
              <p className="hint" style={{ margin: 0 }}>
                Oversight seat — you verify the cleared result after Close, never the live sealed inputs.
              </p>
            )}
            {role === 'valuer' && (
              <p className="hint" style={{ margin: 0 }}>
                Independent valuation agent — your role ends once the valuation is anchored. The auction and
                elections are not in your scope.
              </p>
            )}
          </TabActions>
        )}

        {tab === 'settlement' && (
          <TabActions
            title="Settlement"
            note="The GP issues units through the gate-ceremony — the ledger will not mint until all four proofs are anchored — then fires one atomic Close that moves every leg. Counterparties pre-authorize their legs and read their provenance-backed holding here."
          >
            {role === 'gp' && <Advisor embedded={['ceremony', 'settlement', 'close']} />}
            {role === 'buyer' && <Buyer embedded={['delegation', 'holding']} />}
            {role === 'lpExiting' && <ExitingLP embedded={['preauth', 'holding']} />}
            {role === 'lpRolling' && <RollingLP embedded={['preauth', 'holding']} />}
            {role === 'lpac' && <LPAC embedded={['window']} />}
          </TabActions>
        )}

        {tab === 'documents' && <DocumentsTab />}

        {tab === 'ledger' && <AuditTrail />}
      </div>
    </div>
  );
}

// Overview tab: large stepper + what-happens-next + recent activity, plus the
// four-eyes Approval queue when this party has items awaiting its signature.
function OverviewTab({
  role,
  stages,
  whatNext,
  feed,
  hasApprovals,
}: {
  role: Role | null;
  stages: Stage[];
  whatNext: string;
  feed: FeedItem[];
  hasApprovals: boolean;
}) {
  return (
    <div className="stack g4">
      <div className="card">
        <h2>Lifecycle</h2>
        <Stepper stages={stages} size="large" style={{ marginTop: 14 }} />
      </div>

      <div className="callout">
        <div className="ct">What happens next{role ? ` · ${role}` : ''}</div>
        <p>{whatNext}</p>
      </div>

      {hasApprovals && (
        <div>
          <ApprovalQueue />
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Recent activity</h2>
          <span className="ph-meta">{feed.length ? `${feed.length} event${feed.length === 1 ? '' : 's'}` : 'nothing yet'}</span>
        </div>
        <div className="panel-body flush">
          {feed.length ? (
            <ul className="activity">
              {feed.map((f, i) => (
                <li key={`${f.text}-${i}`} className={f.tone}>
                  <span className="a-dot" aria-hidden="true" />
                  <span className="a-text">{f.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint" style={{ padding: 18, margin: 0 }}>
              No on-ledger activity in your projection yet. As the deal progresses, each event you can see appears here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// A titled action surface for the Valuation / Auction / Settlement tabs: a short
// scaffold note (what the rich build adds) followed by the role's contextual CTA.
function TabActions({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="stack g4">
      <div className="panel">
        <div className="panel-head">
          <h2>{title}</h2>
          <span className="ph-meta">actions</span>
        </div>
        <div className="panel-body">
          <p className="hint" style={{ marginTop: 0 }}>
            {note}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
