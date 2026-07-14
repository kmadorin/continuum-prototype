// Lightweight toast surface (custody build). Every ledger action shows a toast:
// "signing via <custodian>…" (pending) → "committed · updateId <short>" (success)
// or the error. No external lib. useToast tolerates a MISSING provider (returns a
// no-op) so persona views can be unit-tested without wrapping in ToastProvider.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useInspector } from './Inspector';

export type ToastKind = 'pending' | 'success' | 'error';

export type ToastApi = {
  /** Show a toast; returns its id (use with `update`). */
  show: (message: string, kind?: ToastKind) => number;
  /** Replace a toast's message/kind (e.g. pending → success). Pass the committed
   *  `updateId` to make the toast an "Inspect" affordance opening the Ledger Inspector. */
  update: (id: number, message: string, kind: ToastKind, updateId?: string) => void;
};

type ToastItem = { id: number; message: string; kind: ToastKind; updateId?: string; leaving?: boolean };

// Default is a working no-op so `useToast()` never throws outside a provider.
const C = createContext<ToastApi>({ show: () => 0, update: () => {} });

const AUTO_DISMISS_MS: Record<ToastKind, number | null> = {
  pending: null, // stays until updated
  success: 9000,
  error: 14000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const inspector = useInspector();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  // Per-toast timer with its deadline, so hover can pause and resume with the
  // exact remaining time (the CSS countdown bar pauses in lockstep via :hover).
  const timers = useRef<Map<number, { t: ReturnType<typeof setTimeout> | null; until: number }>>(new Map());

  // Leaving is a fade, not a pop: mark it, let the CSS fade-out play, then drop it.
  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    const e = timers.current.get(id);
    if (e?.t) clearTimeout(e.t);
    timers.current.delete(id);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 220);
  }, []);

  const arm = useCallback(
    (id: number, kind: ToastKind) => {
      const prev = timers.current.get(id);
      if (prev?.t) clearTimeout(prev.t);
      const ms = AUTO_DISMISS_MS[kind];
      if (ms != null) timers.current.set(id, { t: setTimeout(() => dismiss(id), ms), until: Date.now() + ms });
      else timers.current.delete(id);
    },
    [dismiss],
  );

  /** Hover in: freeze the clock, remember what's left. */
  const pause = useCallback((id: number) => {
    const e = timers.current.get(id);
    if (!e?.t) return;
    clearTimeout(e.t);
    timers.current.set(id, { t: null, until: Math.max(0, e.until - Date.now()) });
  }, []);

  /** Hover out: restart with exactly what was left. */
  const resume = useCallback(
    (id: number) => {
      const e = timers.current.get(id);
      if (!e || e.t) return;
      const remaining = e.until; // "ms left" while paused
      timers.current.set(id, { t: setTimeout(() => dismiss(id), remaining), until: Date.now() + remaining });
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show(message, kind = 'pending') {
        const id = nextId.current++;
        setItems((xs) => [...xs, { id, message, kind }]);
        arm(id, kind);
        return id;
      },
      update(id, message, kind, updateId) {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, message, kind, updateId } : x)));
        arm(id, kind);
      },
    }),
    [arm],
  );

  return (
    <C.Provider value={api}>
      {children}
      {/* A plain column, newest at the bottom. Each toast wears its own countdown: the
          hairline at its foot drains over the dismiss window, then it leaves alone.
          Keyed by id+kind so a pending→success update restarts both animations. */}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((t) => {
          const life = AUTO_DISMISS_MS[t.kind];
          return (
          <div
            key={`${t.id}-${t.kind}`}
            className={`toast toast-${t.kind}${t.leaving ? ' leaving' : ''}`}
            role="status"
            style={life != null ? ({ '--life': `${life}ms` } as React.CSSProperties) : undefined}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
          >
            {t.kind === 'pending' ? <span className="toast-spinner" aria-hidden="true" /> : null}
            <span className="toast-msg" onClick={() => dismiss(t.id)}>
              {t.message}
            </span>
            {t.updateId ? (
              <button
                type="button"
                className="toast-inspect"
                onClick={(e) => {
                  e.stopPropagation();
                  inspector.open(t.updateId!);
                }}
              >
                Inspect
              </button>
            ) : null}
          </div>
          );
        })}
      </div>
    </C.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(C);
}
