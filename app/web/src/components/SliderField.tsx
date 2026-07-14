// SliderField — the system's bounded numeric control. For a value with a known range
// (a % of NAV, a capacity) a slider beats spinner buttons: one big target, no aiming,
// the whole range visible at once. The readout is live and tabular; the native
// input[type=range] keeps keyboard arrows, Home/End and screen-reader semantics.
import type { CSSProperties } from 'react';

export default function SliderField({
  id,
  value,
  onChange,
  min,
  max,
  step,
  format,
  disabled,
}: {
  id?: string;
  /** Current value, as the string the caller stores. */
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  /** Render the readout (and aria-valuetext), e.g. n => `${Math.round(n*100)}% of NAV`. */
  format?: (n: number) => string;
  disabled?: boolean;
}) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  const fill = ((safe - min) / (max - min)) * 100;
  const label = format ? format(safe) : String(safe);

  return (
    <div className={`slider${disabled ? ' disabled' : ''}`}>
      <input
        id={id}
        type="range"
        className="sl-input"
        min={min}
        max={max}
        step={step}
        value={safe}
        disabled={disabled}
        aria-valuetext={label}
        onChange={(e) => onChange(e.target.value)}
        style={{ '--fill': `${fill}%` } as CSSProperties}
      />
      <output className="sl-value mono" htmlFor={id} aria-hidden="true">
        {label}
      </output>
    </div>
  );
}
