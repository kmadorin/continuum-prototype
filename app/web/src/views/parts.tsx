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
  // Synchronous re-entry lock: `busy` is React state, so it only disables a button on the
  // NEXT render — a fast double-click (or a submit fired from two places) can slip a second
  // call through before that lands and create a duplicate contract. The ref blocks it now.
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (label: string, fn: () => Promise<string | void>) => {
    if (inFlight.current) return; // a submit is already running — ignore the re-entry
    inFlight.current = true;
    setBusy(label);
    setErr(null);
    setNote(null);
    try {
      const msg = await fn();
      if (alive.current && msg) setNote(msg);
    } catch (e) {
      if (alive.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(null);
    }
  }, []);

  return { busy, err, note, run };
}

/** Poll `fn` once on mount and whenever a dep changes; unmount-safe. */
export function useRefresh(fn: (alive: () => boolean) => Promise<void>, deps: unknown[]) {
  useEffect(() => {
    let on = true;
    const tick = () => { if (!document.hidden) void fn(() => on); };
    void fn(() => on); // initial load ALWAYS (even hidden) so a backgrounded seat isn't blank
    // Keep the seat live: a settled close (or any cross-seat change) lands here on the next tick
    // instead of only after a manual reload — this is what makes the buyer's holding + the SETTLED
    // takeover appear once the GP fires Close. Only the VISIBLE tab polls; refetch on refocus.
    const id = setInterval(tick, 5000);
    const onVis = () => { if (!document.hidden) void fn(() => on); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      on = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
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
