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

type ToastItem = { id: number; message: string; kind: ToastKind; updateId?: string };

// Default is a working no-op so `useToast()` never throws outside a provider.
const C = createContext<ToastApi>({ show: () => 0, update: () => {} });

const AUTO_DISMISS_MS: Record<ToastKind, number | null> = {
  pending: null, // stays until updated
  success: 5000,
  error: 8000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const inspector = useInspector();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const arm = useCallback(
    (id: number, kind: ToastKind) => {
      const prev = timers.current.get(id);
      if (prev) clearTimeout(prev);
      const ms = AUTO_DISMISS_MS[kind];
      if (ms != null) timers.current.set(id, setTimeout(() => dismiss(id), ms));
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
      {/* Newest toast in front; older ones peek behind it, scaled and lifted (hover the
          stack to fan it out). `--n` is the distance from the newest. */}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((t, idx) => {
          const n = items.length - 1 - idx;
          return (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role="status"
            data-behind={n > 0 || undefined}
            style={{ '--n': n, zIndex: 60 - n, opacity: n > 2 ? 0 : undefined } as React.CSSProperties}
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
