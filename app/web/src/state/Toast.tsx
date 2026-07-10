// Lightweight toast surface (custody build). Every ledger action shows a toast:
// "signing via <custodian>…" (pending) → "committed · updateId <short>" (success)
// or the error. No external lib. useToast tolerates a MISSING provider (returns a
// no-op) so persona views can be unit-tested without wrapping in ToastProvider.
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'pending' | 'success' | 'error';

export type ToastApi = {
  /** Show a toast; returns its id (use with `update`). */
  show: (message: string, kind?: ToastKind) => number;
  /** Replace a toast's message/kind (e.g. pending → success). */
  update: (id: number, message: string, kind: ToastKind) => void;
};

type ToastItem = { id: number; message: string; kind: ToastKind };

// Default is a working no-op so `useToast()` never throws outside a provider.
const C = createContext<ToastApi>({ show: () => 0, update: () => {} });

const AUTO_DISMISS_MS: Record<ToastKind, number | null> = {
  pending: null, // stays until updated
  success: 5000,
  error: 8000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
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
      update(id, message, kind) {
        setItems((xs) => xs.map((x) => (x.id === id ? { ...x, message, kind } : x)));
        arm(id, kind);
      },
    }),
    [arm],
  );

  return (
    <C.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status" onClick={() => dismiss(t.id)}>
            {t.kind === 'pending' ? <span className="toast-spinner" aria-hidden="true" /> : null}
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </C.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(C);
}
