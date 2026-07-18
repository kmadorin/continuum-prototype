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
import { useLedger, R, DEMO, custodians, shortParty } from '../lib/useLedger';
import { useSession, type Role } from '../state/WalletSession';
import { useInspector } from '../state/Inspector';
import { pick } from './parts';
import Stepper, { type Stage } from '../components/Stepper';
import KpiRow, { type Kpi } from '../components/KpiRow';
import { type TabDef } from '../components/Tabs';
import Shell from '../components/Shell';
import Advisor from './Advisor';
import AuditTrail from './AuditTrail';
import ApprovalQueue, { usePendingApprovals } from './ApprovalQueue';
import ValuationTab from './ValuationTab';
import DocumentsTab from './DocumentsTab';

const fmtUsdM = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;

type TabId = 'overview' | 'valuation' | 'auction' | 'settlement' | 'documents' | 'ledger';

// ── lifecycle derivation ──────────────────────────────────────────────────────
const STAGE_LABELS = ['LPAC Consent', 'Valuation', 'Auction', 'Elections', 'Issuance', 'Close'] as const;

/**
 * Map the on-ledger deal state to the six-stage stepper, in ILPA order: LPAC waives
 * the conflict / blesses the PROCESS before it runs (it does not approve the price),
 * so LPAC Consent leads, then the independent Valuation validates, then the Auction
 * discovers the price. The ContinuationDeal.stage field is Setup → Consented →
 * Electing → Closed; a SettlementReceipt means Close happened. Each stage's `done`
 * is set independently from real on-ledger facts (consent, a ValuationReport in this
 * seat's ACS, a clearing price, a receipt); active = first not-done in display order.
 */
export function deriveStages(
  deal: ActiveContract | null,
  hasReceipt: boolean,
  hasValuation: boolean,
): Stage[] {
  const stage = (deal?.args.stage as string | undefined) ?? undefined;
  const hasClearing = !!deal?.args.clearingPrice;
  const consented = stage === 'Consented' || stage === 'Electing' || stage === 'Closed';
  const closed = stage === 'Closed' || hasReceipt;

  const done: Record<(typeof STAGE_LABELS)[number], boolean> = {
    'LPAC Consent': consented,
    Valuation: hasValuation,
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
      valuer: 'The GP opened the closing room — that is the request for your independent valuation. Sign and anchor it on the Valuation tab; your hash becomes the reference every seat verifies.',
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
      // Elections is the ACTIVE stage — they are already open. Telling the GP to open them is
      // the stalest possible instruction at exactly the wrong moment.
      gp: 'Elections are open — LPs file privately; you see only that they filed. Run the settlement backstage on the Settlement tab.',
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
  // Both feeds are built from the CONTENTLESS markers — the only thing the GP can see. The
  // amounts behind them are in contracts the GP is not a stakeholder of, which is the point:
  // the organizer of the auction cannot read the auction.
  s.bids.forEach((b) =>
    f.push({ text: `${shortParty(String(b.args.buyer))} filed a sealed bid — amount blind to you`, tone: 'info' }),
  );
  s.elections.forEach((e) =>
    f.push({ text: `${shortParty(String(e.args.lp))} filed an election — roll/sell sealed`, tone: 'info' }),
  );
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
  // Values popping in one poll after mount shifted the whole page. The KPI row shows
  // equal-sized skeletons until the first read lands AND a short floor elapses, then
  // swaps once — same tile heights, no jump.
  const [loaded, setLoaded] = useState(false);
  const [minShown, setMinShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinShown(true), 500);
    return () => clearTimeout(t);
  }, []);
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
        // Elections + bids come from the MARKERS (ElectionFiled / BidFiled), never from the
        // private LPElection / SealedBid: those have a single signatory and no observers, so
        // this seat could poll them forever and always read zero — which is exactly what the
        // deal page used to do ("0 of 2 responded" with both elections filed).
        const [d, rec, el, sb, cons, val, op] = await Promise.all([
          L.myAcs(R.deal),
          L.myAcs(R.receipt),
          L.myAcs(R.electionFiled),
          L.myAcs(R.bidFiled),
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
        setLoaded(true);
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
  const stages = deriveStages(deal, hasReceipt, valuations.length > 0);
  const activeLabel = stages.find((s) => s.state === 'active')?.label ?? null;
  const stageName = (deal?.args.stage as string | undefined) ?? undefined;
  const electionsPhase = stageName === 'Electing' || stageName === 'Closed' || hasReceipt;

  // ── KPI tiles ───────────────────────────────────────────────────────────────
  const clearingPct = deal?.args.clearingPrice != null ? Number(deal.args.clearingPrice) : null;
  // NAV (independent): read from the on-chain ValuationReport once the valuer anchors it
  // (gp/valuer observe it). Pending until then — the valuation is a real gated step, not pre-baked.
  const valuation = valuations[0] ?? null;
  const navMid =
    valuation != null ? (Number(valuation.args.navLow) + Number(valuation.args.navHigh)) / 2 : null;
  const clearingUsd = clearingPct != null && navMid != null ? navMid * clearingPct : null;
  const receipt = receipts[0] ?? null;

  const tiles: Kpi[] = [
    navMid != null
      ? {
          label: 'NAV (independent)',
          value: fmtUsdM(navMid),
          sub: 'Kroll Valuation Services',
          asOf: (valuation!.args.asOfDate as string) || DEMO.closeDate,
        }
      : { label: 'NAV (independent)', value: '— Pending Valuation', pending: true },
    clearingPct != null
      ? {
          label: 'Clearing price',
          value: `${Math.round(clearingPct * 100)}% of NAV`,
          ...(clearingUsd != null ? { sub: fmtUsdM(clearingUsd) } : {}),
          asOf: DEMO.closeDate,
        }
      : {
          label: 'Clearing price',
          value: '— Pending Auction',
          pending: true,
          // Pre-clearing, the count of filed bids is everything the organizer of the auction
          // is entitled to know — and, until now, more than it could see.
          ...(bids.length ? { sub: `${bids.length} sealed ${bids.length === 1 ? 'bid' : 'bids'} filed — amounts blind` } : {}),
        },
    electionsPhase
      ? {
          label: 'Elections',
          value: `${elections.length} of 2 responded`,
          sub: 'Roll / Sell — amounts sealed',
          asOf: DEMO.closeDate,
        }
      : { label: 'Elections', value: '— Pending Elections', pending: true },
    receipt
      ? (() => {
          // The receipt is authoritative when it carries the count; some ledger
          // projections omit `totalUnits`, so never let Number(undefined) → "NaN"
          // reach the tile. Units are issued @ $1.00 ≡ the clearing USD, so fall
          // back to that (matches the on-ledger PSA price) before giving up to "—".
          const fromReceipt = Number(receipt.args.totalUnits);
          const units = Number.isFinite(fromReceipt)
            ? fromReceipt
            : clearingUsd != null
              ? Math.round(clearingUsd)
              : null;
          return {
            label: 'CV units issued',
            value: units != null ? units.toLocaleString() : '—',
            sub: '@ $1.00',
            asOf: DEMO.closeDate,
          };
        })()
      : { label: 'CV units issued', value: '— Pending Issuance', pending: true },
  ];

  // ── sections (sidebar nav) ────────────────────────────────────────────────
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
    <Shell
      nav={tabs}
      current={tab}
      onNav={(id) => setTab(id as TabId)}
      navLabel="Deal"
      eyebrow="GP-led continuation vehicle"
      title="Project Continuum CV I, L.P."
      // The sponsor is the advisory firm running the deal. Fireblocks is the CUSTODIAN that
      // holds this seat's key — that lives in the sidebar identity, not on the sponsor line.
      subtitle="Sponsor: Whitfield Advisory · Meridian Growth Fund III"
      headSide={<Stepper stages={stages} size="compact" />}
      status={
        !loaded || !minShown ? (
          <span className="sd-ghost" aria-hidden="true" />
        ) : stageName ? (
          <span className="chip sealed">{stageName}</span>
        ) : (
          <span className="sd-none">—</span>
        )
      }
    >
      {/* Sticky KPI row -------------------------------------------------------- */}
      <KpiRow tiles={tiles} onInspect={inspector.open} loading={!loaded || !minShown} />

      <div className="deal-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <OverviewTab
            role={role}
            whatNext={whatNext(role ?? 'gp', activeLabel)}
            feed={feed}
            hasApprovals={approvals.length > 0}
          />
        )}

        {tab === 'valuation' && (
          <div className="stack g4">
            <ValuationTab report={pick(valuations)} onNavigate={setTab} />
            <Advisor embedded={['clearing']} />
          </div>
        )}

        {tab === 'auction' && (
          <TabActions
            title="Auction & Elections"
            note="Sealed-bid auction and per-LP roll/sell elections. Amounts stay peer-blind — you see only that a bid or election was filed, never the figures, until the atomic Close. Open elections once the deal is Consented."
          >
            <Advisor embedded={['elections']} />
          </TabActions>
        )}

        {tab === 'settlement' && (
          <TabActions
            title="Settlement"
            note="Issue units through the gate-ceremony — the ledger will not mint until all four proofs are anchored — then fire one atomic Close that moves every leg. Counterparties pre-authorize their legs in their own seats."
          >
            <Advisor embedded={['ceremony', 'settlement']} />
          </TabActions>
        )}

        {tab === 'documents' && <DocumentsTab />}

        {tab === 'ledger' && <AuditTrail />}
      </div>
    </Shell>
  );
}

// Overview tab: what-happens-next + recent activity, plus the four-eyes Approval
// queue when this party has items awaiting its signature. (The stepper lives in the
// page header — it used to be repeated here verbatim.)
function OverviewTab({
  role,
  whatNext,
  feed,
  hasApprovals,
}: {
  role: Role | null;
  whatNext: string;
  feed: FeedItem[];
  hasApprovals: boolean;
}) {
  // The header already carries the stepper; repeating it verbatim in a "Lifecycle" card said
  // the same thing twice and pushed the only thing the Overview adds — what to do next, and
  // what just happened — below the fold.
  // Two columns on wide screens: your move (and anything awaiting your signature)
  // on the left, the projection's event feed on the right.
  return (
    <div className="cols-main-side">
      <div className="col">
        <div className="callout">
          <div className="ct">What happens next{role ? ` · ${role}` : ''}</div>
          <p>{whatNext}</p>
        </div>

        {hasApprovals && <ApprovalQueue />}

        <ParticipantsPanel />
      </div>

      <div className="col">
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
    </div>
  );
}

// Participants & visibility — who is in the room, which custodian signs for them,
// and what the LEDGER lets each of them see. The visibility column is the privacy
// model stated as fact (Daml signatories/observers), not aspiration: it is exactly
// what this demo proves when you open two seats side by side.
const PARTICIPANTS: Array<{ role: keyof typeof custodians; seat: string; sees: string }> = [
  { role: 'gp', seat: 'Advisor / Organizer', sees: 'Deal state, proofs — never sealed bids or elections' },
  { role: 'valuer', seat: 'Independent valuer', sees: 'Its own valuation and anchor hash only' },
  { role: 'lpac', seat: 'LPAC oversight', sees: 'Bid markers, fairness scope — never amounts pre-close' },
  { role: 'buyer', seat: 'Secondary buyer', sees: 'Its own bid and leg — no other bids or elections' },
  { role: 'lpExiting', seat: 'Exiting LP', sees: 'Its own election and cash leg — no peer elections' },
  { role: 'lpRolling', seat: 'Rolling LP', sees: 'Its own election and rolled units — no peer elections' },
];

function ParticipantsPanel() {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Participants &amp; visibility</h2>
        <span className="ph-meta">enforced by the ledger, not the app</span>
      </div>
      <div className="panel-body flush">
        <table className="data">
          <thead>
            <tr>
              <th>Seat</th>
              <th>Signing custodian</th>
              <th>Sees</th>
            </tr>
          </thead>
          <tbody>
            {PARTICIPANTS.map((p) => (
              <tr key={p.role}>
                <td className="nm">{p.seat}</td>
                <td>{custodians[p.role] ?? '—'}</td>
                <td className="mute">{p.sees}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
