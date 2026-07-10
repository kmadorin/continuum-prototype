// Shared building blocks for the five custody-signed persona views.
// Pure UI + a tiny async-action hook; no ledger specifics live here.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';

/** Newest contract matching `pred` (ACS order is oldest→newest), or null. */
export function pick(
  contracts: ActiveContract[],
  pred: (c: ActiveContract) => boolean = () => true,
): ActiveContract | null {
  const hits = contracts.filter(pred);
  return hits.length ? hits[hits.length - 1] : null;
}

/**
 * One-at-a-time async actions with busy/error/note surface. `run(label, fn)`
 * marks `label` busy, runs `fn`, records a success note or the thrown error.
 * Guards against setState after unmount (a persona switch mid-submit).
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label);
    setErr(null);
    setNote(null);
    try {
      const msg = await fn();
      if (alive.current && msg) setNote(msg);
    } catch (e) {
      if (alive.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(null);
    }
  }, []);

  return { busy, err, note, run };
}

/** Poll `fn` once on mount and whenever a dep changes; unmount-safe. */
export function useRefresh(fn: (alive: () => boolean) => Promise<void>, deps: unknown[]) {
  useEffect(() => {
    let on = true;
    void fn(() => on);
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function ErrNote({ err, note }: { err: string | null; note: string | null }) {
  if (err)
    return (
      <div className="callout fail">
        <div className="ct">Ledger rejected</div>
        <p className="mono" style={{ fontSize: 13 }}>
          {err}
        </p>
      </div>
    );
  if (note) return <p className="hint">{note}</p>;
  return null;
}
