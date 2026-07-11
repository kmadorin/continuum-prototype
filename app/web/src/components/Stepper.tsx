// Lifecycle stepper — the deal's spine across every role's Deal Page. Renders the
// fixed pipeline `Valuation → LPAC Consent → Auction → Elections → Issuance → Close`
// with each stage in one of three states: `done` (checked), `active` (lit — the
// stage the deal is currently in), or `future` (greyed). The caller derives the
// states from on-ledger deal state; this component is pure presentation.
//
// Accessible: rendered as an ordered list with `aria-current="step"` on the active
// stage, so assistive tech announces the position in the flow.
import type { CSSProperties } from 'react';

export type StageState = 'done' | 'active' | 'future';
export type Stage = { label: string; state: StageState };

const Check = () => (
  <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
    <path d="M2 6.2 4.6 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * @param stages ordered pipeline stages with their resolved state.
 * @param size   `compact` (header chrome) or `large` (Overview tab).
 */
export default function Stepper({
  stages,
  size = 'compact',
  style,
}: {
  stages: Stage[];
  size?: 'compact' | 'large';
  style?: CSSProperties;
}) {
  return (
    <ol className={`lifecycle ${size}`} aria-label="Deal lifecycle" style={style} data-testid="lifecycle-stepper">
      {stages.map((s, i) => (
        <li
          key={s.label}
          className={`lc-step ${s.state}`}
          aria-current={s.state === 'active' ? 'step' : undefined}
          data-testid={`lc-step-${s.state}`}
        >
          <span className="lc-num" aria-hidden="true">
            {s.state === 'done' ? <Check /> : i + 1}
          </span>
          <span className="lc-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
