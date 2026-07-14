// Sticky KPI stat row — the JPM-style fund header numbers, always visible above the
// tab content. Every tile is "as of" a date and carries a shield that deep-links to
// the on-ledger anchor (the Ledger Inspector) when a relevant updateId exists. Before
// a stage completes a tile shows a muted `— Pending [stage]` value.
//
// Pure presentation: the Deal Page derives the tile values from on-chain state and
// passes them in. `onInspect` is wired to `useInspector().open`; a tile with no
// `updateId` renders the shield as a disabled, non-interactive marker (no-op).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export type Kpi = {
  label: string;
  /** Big mono value, or the pending placeholder text. */
  value: ReactNode;
  /** Secondary line under the value (e.g. `$480.0M`, `@ $1.00`). */
  sub?: string;
  /** "as of" date; rendered with the "as of" prefix. */
  asOf?: string;
  /** Muted styling for a not-yet-produced value. */
  pending?: boolean;
  /** If present + onInspect provided, the shield opens the on-ledger anchor. */
  updateId?: string;
};

const Shield = () => (
  <svg viewBox="0 0 14 16" width="13" height="14" aria-hidden="true" focusable="false">
    <path d="M7 1 1.5 3.2v4.3c0 3.2 2.3 6.1 5.5 7 3.2-.9 5.5-3.8 5.5-7V3.2L7 1Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M4.6 8 6.3 9.7 9.6 6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function KpiRow({
  tiles,
  onInspect,
  variant = 'grid',
}: {
  tiles: Kpi[];
  onInspect?: (updateId: string) => void;
  /** `grid` = the GP's sticky full-width row (columns sized to tile count);
   *  `strip` = a focused seat's compact left-aligned strip of 1–2 tiles. */
  variant?: 'grid' | 'strip';
}) {
  // Rounded cards at rest; once the row pins under the header it morphs into the
  // compact chrome strip. A zero-height sentinel above the row tells us which state
  // we are in (jsdom has no IntersectionObserver — then it simply never sticks).
  const sentinel = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  const [spacer, setSpacer] = useState(0);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || variant !== 'grid' || typeof IntersectionObserver === 'undefined') return;
    const headH = parseFloat(getComputedStyle(el).getPropertyValue('--head-h')) || 84;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      rootMargin: `-${Math.ceil(headH) + 1}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [variant]);
  // The compact state is SHORTER than the resting card. Without compensation that
  // height loss shortens the document, the sentinel re-enters its threshold, and the
  // row flaps stuck/unstuck forever. A spacer keeps the document height constant —
  // which also requires the morph to snap its layout properties (no padding/font
  // transitions), so the measurement here is exact, not mid-animation.
  const restH = useRef(0);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || variant !== 'grid') return;
    if (!stuck) {
      restH.current = row.offsetHeight;
      setSpacer(0);
    } else if (restH.current) {
      setSpacer(Math.max(0, restH.current - row.offsetHeight));
    }
  }, [stuck, tiles.length, variant]);

  return (
    <>
    {variant === 'grid' ? <div ref={sentinel} aria-hidden="true" /> : null}
    <div
      ref={rowRef}
      className={`kpi-row${variant === 'strip' ? ' strip' : ''}${stuck ? ' stuck' : ''}`}
      role="group"
      aria-label="Deal key figures"
      data-testid="kpi-row"
      style={variant === 'grid' ? ({ '--kpi-cols': tiles.length } as CSSProperties) : undefined}
    >
      {tiles.map((t) => {
        const canInspect = !!t.updateId && !!onInspect;
        return (
          <div className={`kpi-tile${t.pending ? ' pending' : ''}`} key={t.label} data-testid="kpi-tile">
            <div className="kpi-top">
              <span className="kpi-label">{t.label}</span>
              <button
                type="button"
                className="kpi-shield"
                disabled={!canInspect}
                aria-label={canInspect ? `Verify ${t.label} on-ledger` : `${t.label} — no on-ledger anchor yet`}
                title={canInspect ? 'Verify on-ledger' : 'No on-ledger anchor yet'}
                onClick={canInspect ? () => onInspect!(t.updateId!) : undefined}
              >
                <Shield />
              </button>
            </div>
            <div className="kpi-value mono">{t.value}</div>
            {t.sub ? <div className="kpi-sub">{t.sub}</div> : null}
            {t.asOf ? <div className="kpi-asof">as of {t.asOf}</div> : null}
          </div>
        );
      })}
    </div>
    {variant === 'grid' && spacer > 0 ? <div style={{ height: spacer }} aria-hidden="true" /> : null}
    </>
  );
}
