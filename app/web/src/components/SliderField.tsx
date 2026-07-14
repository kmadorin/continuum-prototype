// SliderField — the system's bounded numeric control. For a value with a known range
// (a % of NAV, a capacity) a slider beats spinner buttons: one big target, no aiming,
// the whole range visible at once. Next to it, a compact numeric field takes exact
// values by keyboard — the two drive the same state. The native input[type=range]
// keeps arrows, Home/End and screen-reader semantics; `format` feeds aria-valuetext.
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
  unit,
  scale = 1,
  precision = 0,
}: {
  id?: string;
  /** Current value, as the string the caller stores. */
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  /** Renders aria-valuetext for the slider, e.g. n => `${Math.round(n*100)}% of NAV`. */
  format?: (n: number) => string;
  disabled?: boolean;
  /** Unit label after the numeric field, e.g. "% of NAV", "$M". */
  unit?: string;
  /** Display scale for the numeric field (stored 0.96 × 100 → shown 96). */
  scale?: number;
  /** Decimals shown in the numeric field. */
  precision?: number;
}) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  const fill = ((safe - min) / (max - min)) * 100;
  const label = format ? format(safe) : String(safe);
  const shown = Number((safe * scale).toFixed(precision));

  const capLabel = (v: number) => String(Number((v * scale).toFixed(precision)));

  return (
    <div className={`slider${disabled ? ' disabled' : ''}`}>
      <button
        type="button"
        className="sl-cap"
        disabled={disabled}
        title="Set to minimum"
        onClick={() => onChange(String(min))}
      >
        {capLabel(min)}
      </button>
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
      <button
        type="button"
        className="sl-cap"
        disabled={disabled}
        title="Set to maximum"
        onClick={() => onChange(String(max))}
      >
        {capLabel(max)}
      </button>
      <span className="sl-entry">
        <input
          className="input sl-num"
          type="number"
          inputMode="decimal"
          aria-label={unit ? `Value, ${unit}` : 'Value'}
          value={shown}
          step={step * scale}
          min={min * scale}
          max={max * scale}
          disabled={disabled}
          onChange={(e) => {
            const d = Number(e.target.value);
            if (Number.isFinite(d)) onChange(String(Math.min(max, Math.max(min, d / scale))));
          }}
        />
        {unit ? <span className="sl-unit">{unit}</span> : null}
      </span>
    </div>
  );
}
