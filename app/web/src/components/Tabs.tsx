// Deal Page tab nav — Overview · Valuation · Auction & Elections · Settlement ·
// Documents · Ledger. A WAI-ARIA tablist: arrow keys move selection, Home/End jump
// to the ends, and the selected tab owns the roving tabindex so keyboard focus lands
// on it. A tab may carry a small count badge (e.g. the four-eyes approval queue).
import { useRef } from 'react';

export type TabDef = { id: string; label: string; badge?: number };

export default function Tabs({
  tabs,
  current,
  onChange,
}: {
  tabs: TabDef[];
  current: string;
  onChange: (id: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const n = tabs.length;
    const next = (from + delta + n) % n;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(i, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(i, -1);
        break;
      case 'Home':
        e.preventDefault();
        onChange(tabs[0].id);
        refs.current[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        onChange(tabs[tabs.length - 1].id);
        refs.current[tabs.length - 1]?.focus();
        break;
      default:
        break;
    }
  };

  return (
    <div className="deal-tabs" role="tablist" aria-label="Deal sections">
      {tabs.map((t, i) => {
        const selected = t.id === current;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={selected ? 'current' : undefined}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
            {t.badge ? <span className="count">{t.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
