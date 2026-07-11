// GP "Issue Units" gate-ceremony — the HERO moment. A prominent Settlement-tab card
// that reads FOUR live on-chain proofs for this deal (independent valuation, fairness
// opinion, LPAC consent, auction certificate) and renders each as a resolving ✓/✗
// check-line. The [Issue units against this basis] button is ENABLED only when all
// four proofs pass AND an IssuanceBasis exists — embodying "the ledger will not let
// the GP mint units without these four proofs."
//
// This is PRESENTATION ONLY: the actual on-chain issuance/close is the EXISTING GP
// settlement action (`onIssue` is wired to Advisor's `close()` handler). On success
// the card flips to a settled state with the mint/close updateId + Inspect button and
// the issued-unit number counts up.
//
// Motion budget (the one animation): the checkmarks resolve in and the unit number
// counts up on success. Both respect `prefers-reduced-motion`.
//
// SECURITY: read-only presentation; no key material, no direct submits.
import { useEffect, useRef, useState } from 'react';

export type GateCheck = {
  key: string;
  /** The proof requirement, e.g. "Independent valuation anchored". */
  label: string;
  /** True once the corresponding contract is observed in the GP's ACS. */
  ok: boolean;
  /** The on-chain fact when present (sha256 / clearing %), or a "missing" hint. */
  fact: string;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** Ease a number from 0→target once `run` turns true; instant under reduced-motion. */
function useCountUp(target: number, run: boolean, ms = 850): number {
  const [n, setN] = useState(run ? 0 : target);
  const raf = useRef(0);
  useEffect(() => {
    if (!run) {
      setN(target);
      return;
    }
    if (prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
      setN(target);
      return;
    }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, run, ms]);
  return n;
}

const CheckGlyph = ({ ok }: { ok: boolean }) =>
  ok ? (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M3 8.4 6.3 11.6 13 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );

export default function IssueUnitsGate({
  unitsToIssue,
  unitPrice = '$1.00',
  checks,
  hasBasis,
  busy,
  issued,
  issuedUnits,
  updateId,
  onIssue,
  onInspect,
}: {
  /** Units to be minted (read from IssuanceBasis/PSA, else the demo default). */
  unitsToIssue: number;
  unitPrice?: string;
  checks: GateCheck[];
  /** An IssuanceBasis for this deal exists in the GP's ACS. */
  hasBasis: boolean;
  /** The issuance/close submit is in flight. */
  busy: boolean;
  /** A SettlementReceipt is present → the ceremony resolved. */
  issued: boolean;
  /** Units on the receipt (drives the count-up); falls back to `unitsToIssue`. */
  issuedUnits?: number;
  /** The mint/close updateId, once captured in-session. */
  updateId?: string | null;
  /** Fires the EXISTING GP settlement/close action. */
  onIssue: () => void;
  onInspect?: (updateId: string) => void;
}) {
  const passed = checks.filter((c) => c.ok).length;
  const allOk = checks.length > 0 && passed === checks.length;
  const canIssue = allOk && hasBasis && !busy && !issued;
  const count = useCountUp(issuedUnits ?? unitsToIssue, issued);

  const hint = !allOk
    ? `${passed} of ${checks.length} proofs anchored — the ledger will not mint units until all four are on-chain.`
    : !hasBasis
      ? 'All four proofs anchored — assemble the issuance basis below to unlock issuance.'
      : 'All four proofs anchored and the issuance basis is assembled.';

  return (
    <div className="card gate-card" data-testid="issue-units-gate">
      <div className="gate-head">
        <span className="gate-eyebrow">Issuance gate</span>
        <h2>
          Issue <span className="mono">{unitsToIssue.toLocaleString()}</span> CV units @ {unitPrice}
        </h2>
        <p className="gate-sub">
          Price discovered by competitive auction (Copper's winning bid), validated against Kroll's
          independent valuation and the fairness opinion.
        </p>
      </div>

      <ul className="gate-checks" aria-label="Issuance preconditions">
        {checks.map((c) => (
          <li key={c.key} className={`gate-check ${c.ok ? 'ok' : 'miss'}`} data-testid="gate-check">
            <span className="gc-mark" aria-hidden="true">
              <CheckGlyph ok={c.ok} />
            </span>
            <span className="gc-body">
              <span className="gc-label">{c.label}</span>
              <span className={`gc-fact mono ${c.ok ? '' : 'miss'}`}>{c.ok ? c.fact : 'missing'}</span>
            </span>
            <span className="gc-state mono" aria-hidden="true">
              {c.ok ? '✓' : '✗'}
            </span>
          </li>
        ))}
      </ul>

      {issued ? (
        <div className="gate-success" data-testid="gate-success">
          <span className="chip ok">CV units issued</span>
          <div className="gate-count mono" aria-live="polite">
            {count.toLocaleString()} CV units
          </div>
          <p className="hint" style={{ margin: 0 }}>
            One atomic transaction minted the units against the anchored basis — no proof, no mint.
          </p>
          {updateId ? (
            <div className="actions" style={{ marginTop: 4 }}>
              <button type="button" className="btn ghost" onClick={() => onInspect?.(updateId)}>
                Inspect transaction
              </button>
              <span className="hint mono">updateId {updateId.length > 14 ? `${updateId.slice(0, 10)}…${updateId.slice(-4)}` : updateId}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="gate-foot">
          <button
            type="button"
            className="btn gate-issue"
            disabled={!canIssue}
            aria-disabled={!canIssue}
            onClick={onIssue}
          >
            {busy ? 'Issuing…' : 'Issue units against this basis'}
          </button>
          <p className="hint" style={{ margin: 0 }}>
            {hint}
          </p>
        </div>
      )}
    </div>
  );
}
