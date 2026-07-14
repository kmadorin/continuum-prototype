// NumberField — the system's numeric input. The UA spinner is gone (it ignores every
// design token the app has); in its place: an integrated affix (prefix/suffix), a pair
// of custom steppers driving the input's own stepUp/stepDown (so step/min/max still
// come from the platform), and one focus ring around the whole group.
import { useRef } from 'react';

const Chevron = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true" focusable="false">
    <path
      d={up ? 'M1 4 4 1l3 3' : 'M1 1l3 3 3-3'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function NumberField({
  id,
  value,
  onChange,
  step = 0.01,
  min,
  max,
  prefix,
  suffix,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  step?: number | string;
  min?: number | string;
  max?: number | string;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Drive the input's native stepping so min/max/step clamping stays the platform's.
  const bump = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el || disabled) return;
    if (dir > 0) el.stepUp();
    else el.stepDown();
    onChange(el.value);
    el.focus({ preventScroll: true });
  };

  return (
    <div className={`numfield${disabled ? ' disabled' : ''}`}>
      {prefix ? <span className="nf-affix">{prefix}</span> : null}
      <input
        ref={ref}
        id={id}
        className="nf-input"
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="nf-steppers">
        <button type="button" tabIndex={-1} className="nf-step" aria-label="Increase" disabled={disabled} onClick={() => bump(1)}>
          <Chevron up />
        </button>
        <button type="button" tabIndex={-1} className="nf-step" aria-label="Decrease" disabled={disabled} onClick={() => bump(-1)}>
          <Chevron />
        </button>
      </span>
      {suffix ? <span className="nf-affix">{suffix}</span> : null}
    </div>
  );
}
