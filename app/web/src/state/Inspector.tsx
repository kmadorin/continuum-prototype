// Ledger Inspector wiring (custody build). A single slide-over drawer, opened from
// ANY updateId — toast success lines, the Audit tab — that fetches the committed
// transaction tree (`GET /ledger/update/:updateId`, scoped to the session party)
// and renders it as the "not a mock" on-chain proof.
//
// `useInspector().open(updateId)` opens the drawer. The context tolerates a MISSING
// provider (default no-op) so any component — including unit-tested views — can call
// `open()` without being wrapped here.
//
// SECURITY: read-only. The drawer only GETs a committed update as the session party;
// no key material is touched, and the transport token stays server-side.
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import LedgerInspector from '../views/LedgerInspector';

export type InspectorApi = {
  /** Open the drawer on a committed update. */
  open: (updateId: string) => void;
};

// Default is a working no-op so `useInspector()` never throws outside a provider.
const C = createContext<InspectorApi>({ open: () => {} });

export function InspectorProvider({ children }: { children: ReactNode }) {
  const [updateId, setUpdateId] = useState<string | null>(null);

  const open = useCallback((id: string) => {
    if (id) setUpdateId(id);
  }, []);
  const close = useCallback(() => setUpdateId(null), []);

  const api = useMemo<InspectorApi>(() => ({ open }), [open]);

  return (
    <C.Provider value={api}>
      {children}
      {updateId ? <LedgerInspector updateId={updateId} onClose={close} /> : null}
    </C.Provider>
  );
}

export function useInspector(): InspectorApi {
  return useContext(C);
}
