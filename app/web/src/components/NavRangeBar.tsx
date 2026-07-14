// NAV range bar — one glance says "the negotiated clearing price sits at/inside the
// independent valuation range." A horizontal track spans navLow→navHigh; the midpoint
// NAV is marked above the track, and the clearing price is plotted below it as a
// distinct marker. Pure CSS/SVG — no chart lib. Axis is labelled in $M.
//
// Marker labels anchor left / centre / right by position so they never overflow the
// track at the edges (the clearing price frequently sits at the range floor).
import { fmtM } from '../views/shared';

export type NavRangeBarProps = {
  /** Low end of the independent NAV range (USD). */
  navLow: number;
  /** High end of the independent NAV range (USD). */
  navHigh: number;
  /** Midpoint / headline NAV (USD) — the marked NAV. */
  mid: number;
  /** Negotiated clearing price (USD) plotted as the distinct marker. */
  clearing: number;
  /** Clearing as a fraction of mid (e.g. 0.96) — shown as `96%` when provided. */
  clearingPct?: number;
};

/** Label horizontal anchor from a 0–100 position, keeping tags inside the track. */
function tagShift(pos: number): string {
  // Wide tags ("Clearing · 96% $480.0M") need a generous edge zone: inside it the tag
  // grows inward from the mark instead of centring over it.
  if (pos <= 18) return '0';
  if (pos >= 82) return '-100%';
  return '-50%';
}

export default function NavRangeBar({ navLow, navHigh, mid, clearing, clearingPct }: NavRangeBarProps) {
  const span = navHigh - navLow || 1;
  const clamp = (v: number) => Math.min(100, Math.max(0, ((v - navLow) / span) * 100));
  const midPos = clamp(mid);
  const clearPos = clamp(clearing);
  const pctLabel = clearingPct != null && Number.isFinite(clearingPct) ? `${Math.round(clearingPct * 100)}%` : null;

  const aria =
    `Independent NAV range from ${fmtM(navLow)} to ${fmtM(navHigh)}; ` +
    `headline NAV ${fmtM(mid)}; clearing price ${fmtM(clearing)}` +
    (pctLabel ? ` (${pctLabel} of NAV)` : '') +
    '.';

  return (
    <div className="nrb" role="img" aria-label={aria}>
      {/* NAV marker (above the track) */}
      <div className="nrb-lane nrb-lane-top">
        <div className="nrb-mark nrb-nav" style={{ left: `${midPos}%` }} data-testid="nrb-nav">
          <span className="nrb-tag" style={{ transform: `translateX(${tagShift(midPos)})` }}>
            <span className="nrb-tag-lab">NAV</span>
            <span className="nrb-tag-val mono">{fmtM(mid)}</span>
          </span>
          <span className="nrb-stem" />
        </div>
      </div>

      {/* the range track */}
      <div className="nrb-track" aria-hidden="true">
        <span className="nrb-range" />
        <span className="nrb-node nrb-node-nav" style={{ left: `${midPos}%` }} />
        <span className="nrb-node nrb-node-clear" style={{ left: `${clearPos}%` }} />
      </div>

      {/* clearing marker (below the track) */}
      <div className="nrb-lane nrb-lane-bot">
        <div className="nrb-mark nrb-clear" style={{ left: `${clearPos}%` }} data-testid="nrb-clearing">
          <span className="nrb-stem" />
          <span className="nrb-tag" style={{ transform: `translateX(${tagShift(clearPos)})` }}>
            <span className="nrb-tag-lab">Clearing{pctLabel ? ` · ${pctLabel}` : ''}</span>
            <span className="nrb-tag-val mono accent">{fmtM(clearing)}</span>
          </span>
        </div>
      </div>

      {/* axis */}
      <div className="nrb-axis">
        <span className="nrb-end mono" data-testid="nrb-low">{fmtM(navLow)}</span>
        <span className="nrb-cap">Independent valuation range · $M</span>
        <span className="nrb-end mono" data-testid="nrb-high">{fmtM(navHigh)}</span>
      </div>
    </div>
  );
}
