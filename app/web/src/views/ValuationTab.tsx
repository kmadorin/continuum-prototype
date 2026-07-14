// Valuation tab — the JPM-style institutional presentation of the INDEPENDENT
// valuation. Four surfaces:
//   1. Valuer identity card — Kroll + "Independent Valuation Agent" badge, as-of
//      date, and the on-chain agent party (short).
//   2. NAV range bar — navLow→navHigh with the headline NAV and the negotiated
//      clearing price plotted; one glance shows price sits at/inside the range.
//   3. Document card — the signed Valuation Report: sha256 (copy), View, and
//      Verify-on-ledger (green ✓ on hash match, neutral pending if not anchored).
//   4. Provenance strip — the CV units issued under the IssuanceBasis that
//      references this report's hash → jumps to the Settlement tab.
//
// Numbers come from THIS party's on-chain ValuationReport when observable; if the
// current role can't see it, we fall back to the manifest + the spec's range and
// note the fallback (never stall). SECURITY: read-only + the verify GET.
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { custodians, DEMO } from '../lib/useLedger';
import { shortParty } from '../lib/useLedger';
import { fetchManifest, type DocManifestEntry } from '../lib/docs';
import { fmtM } from './shared';
import NavRangeBar from '../components/NavRangeBar';
import { HashChip, VerifyBadge, useVerify } from '../components/DocVerify';

// Fallbacks when the on-chain report isn't in this party's projection (spec §3).
const FALLBACK = {
  navLow: 480_000_000,
  navHigh: 520_000_000,
  asOfDate: '2026-06-30',
  agent: '',
} as const;
const CLEARING_PCT = 0.96;
const VALUER_NAME = 'Kroll Valuation Services';
const DOC_NAME = 'valuation-report';
const UNITS_ISSUED = Number(DEMO.psaPrice); // 480,000,000 units @ $1.00 — the PSA price

// On-chain NAV is expressed in the demo's scaled units; the report carries the
// institutional figures directly (navLow 480000000.0 / navHigh 520000000.0).
const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function PdfGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" className="doc-glyph">
      <path
        d="M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5H6A.5.5 0 0 1 5.5 21V3A.5.5 0 0 1 6 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M14 2.5V6.5H18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8.5 13h7M8.5 16h7M8.5 10h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default function ValuationTab({
  report,
  onNavigate,
}: {
  /** This party's on-chain ValuationReport (latest), or null if unobservable. */
  report: ActiveContract | null;
  /** Switch the Deal Page to another tab (used by the provenance strip). */
  onNavigate?: (tab: 'settlement') => void;
}) {
  const [manifest, setManifest] = useState<DocManifestEntry | null>(null);
  const [manifestErr, setManifestErr] = useState(false);
  const { state, result, run } = useVerify(DOC_NAME);

  useEffect(() => {
    let on = true;
    fetchManifest()
      .then((m) => on && setManifest(m.find((d) => d.name === DOC_NAME) ?? null))
      .catch(() => on && setManifestErr(true));
    return () => {
      on = false;
    };
  }, []);

  const a = report?.args ?? {};
  const onChain = report != null;
  const navLow = num(a.navLow, FALLBACK.navLow);
  const navHigh = num(a.navHigh, FALLBACK.navHigh);
  const mid = (navLow + navHigh) / 2;
  const clearing = mid * CLEARING_PCT;
  const asOfDate = (a.asOfDate as string) || manifest?.date || FALLBACK.asOfDate;
  const agentParty = (a.agent as string) || FALLBACK.agent;
  // Resolve the valuer's display name from the registry custodians if a valuer
  // tenant exists; otherwise the independent agent is Kroll (manifest signer).
  const valuerName =
    Object.values(custodians).find((n) => /kroll/i.test(n)) || manifest?.signer || VALUER_NAME;
  const contentHash = (a.contentHash as string) || manifest?.sha256 || '';

  return (
    <div className="stack g4">
      {/* 1 · valuer identity ------------------------------------------------- */}
      <div className="card val-identity">
        <div className="val-id-top">
          <div className="stack" style={{ gap: 6 }}>
            <span className="chip ok val-badge">Independent Valuation Agent</span>
            <h2 style={{ marginTop: 6 }}>{valuerName}</h2>
            {!onChain && <span className="chip pending val-badge">Awaiting signature &amp; anchor</span>}
          </div>
          <div className="val-id-figs">
            <div className="vif">
              <span className="vif-lab">Valuation as of</span>
              <span className="vif-val mono">{asOfDate}</span>
            </div>
            <div className="vif">
              <span className="vif-lab">Agent party</span>
              <span className="vif-val mono" title={agentParty || undefined}>
                {agentParty ? shortParty(agentParty) : '—'}
              </span>
            </div>
          </div>
        </div>
        {!onChain && (
          <p className="hint" style={{ margin: 0 }}>
            Awaiting the independent valuation — requested when the deal opened. The range below is
            indicative until Kroll signs and anchors the report on-ledger
            {manifestErr ? ' (manifest unavailable; spec range)' : ''}.
          </p>
        )}
      </div>

      {/* 2 · NAV range bar --------------------------------------------------- */}
      <div className="panel">
        <div className="panel-head">
          <h2>Independent NAV range{onChain ? '' : ' (indicative)'}</h2>
          <span className="ph-meta">
            NAV {fmtM(mid)} · clearing {fmtM(clearing)} ({Math.round(CLEARING_PCT * 100)}%)
          </span>
        </div>
        <div className="panel-body">
          <NavRangeBar navLow={navLow} navHigh={navHigh} mid={mid} clearing={clearing} clearingPct={CLEARING_PCT} />
          <p className="hint" style={{ margin: '16px 0 0' }}>
            {onChain ? (
              <>
                The negotiated clearing price of {fmtM(clearing)} sits at the floor of the independent range
                ({fmtM(navLow)}–{fmtM(navHigh)}) — {Math.round(CLEARING_PCT * 100)}% of the {fmtM(mid)} headline NAV.
              </>
            ) : (
              <>
                Indicative range pending anchoring ({fmtM(navLow)}–{fmtM(navHigh)}). The figures become
                the on-ledger reference once Kroll signs and anchors the report.
              </>
            )}
          </p>
        </div>
      </div>

      {/* 3 · valuation document card — SIGNED & ANCHORED vs AWAITING ---------- */}
      {onChain ? (
        <div className="panel">
          <div className="panel-head">
            <h2>Signed valuation report</h2>
            <span className="ph-meta">Deal Formation</span>
          </div>
          <div className="panel-body">
            <div className="doc-card">
              <span className="doc-icon" aria-hidden="true">
                <PdfGlyph />
              </span>
              <div className="doc-main">
                <div className="doc-title">Valuation Report — Project Continuum CV I, L.P.</div>
                <div className="doc-meta mono">
                  Signed by {valuerName} · {asOfDate}
                </div>
                <div className="doc-hash-row">
                  <span className="doc-hash-lab">sha256</span>
                  {contentHash ? <HashChip hash={contentHash} /> : <span className="hint">no hash available</span>}
                </div>
              </div>
            </div>
            <div className="doc-actions">
              <a className="btn ghost" href={`/docs/${DOC_NAME}`} target="_blank" rel="noopener noreferrer">
                View report
              </a>
              <button type="button" className="btn" onClick={run} disabled={state === 'loading'}>
                {state === 'loading' ? 'Verifying…' : 'Verify on-ledger'}
              </button>
              <VerifyBadge state={state} result={result} />
            </div>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>Independent valuation</h2>
            <span className="ph-meta">Deal Formation</span>
          </div>
          <div className="panel-body">
            <div className="doc-card">
              <span className="doc-icon" aria-hidden="true">
                <PdfGlyph />
              </span>
              <div className="doc-main">
                <div className="doc-title">Valuation Report — Project Continuum CV I, L.P.</div>
                <div className="doc-meta">
                  <span className="chip pending">Awaiting</span>
                </div>
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  Awaiting independent valuation — Kroll will sign and anchor it; requested when the deal
                  opened. No signer or on-ledger hash exists until then.
                </p>
              </div>
            </div>
            <div className="doc-actions">
              <a className="btn ghost" href={`/docs/${DOC_NAME}`} target="_blank" rel="noopener noreferrer">
                View draft
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 4 · provenance strip (only once the report is anchored) ------------- */}
      {onChain && (
        <div className="callout val-provenance">
          <div className="ct">Provenance</div>
          <p>
            {UNITS_ISSUED.toLocaleString()} CV units were issued under an IssuanceBasis referencing this report's
            hash.{' '}
            <button type="button" className="link-mono" onClick={() => onNavigate?.('settlement')}>
              View the settlement <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
