// Ledger Inspector — the on-chain proof drawer.
//
// Given a committed `updateId`, GET `/ledger/update/:updateId` (the custody backend
// fetches the transaction tree as the SESSION party, privacy-scoped) and render it:
// the acting/signatory parties, the created/exercised contract ids + templates, the
// record time / offset, and the raw ledger JSON (monospace, scrollable) — the
// "not a mock" artifact. The response is the JSON Ledger API v2 update-by-id tree
// in LEDGER_EFFECTS shape; `parseUpdateTree` walks it defensively so minor codec
// differences (wrapped `{CreatedEvent:{value}}` vs flat) both render.
//
// SECURITY: read-only. No key material, no transport token — the backend holds those.
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';

const short = (s?: string, head = 10, tail = 6): string =>
  !s ? '—' : s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s;

/** A party id like `continuum-gp-demo::abc…` → the readable prefix. */
const shortParty = (p?: string): string => (p ? p.split('::')[0] : '—');

type ParsedEvent = {
  kind: 'created' | 'exercised' | 'archived' | 'event';
  templateId?: string;
  contractId?: string;
  choice?: string;
  parties: string[];
};

export type ParsedTree = {
  updateId?: string;
  commandId?: string;
  offset?: string | number;
  recordTime?: string;
  synchronizerId?: string;
  parties: string[];
  events: ParsedEvent[];
};

const asTemplate = (t: unknown): string | undefined => {
  if (!t) return undefined;
  if (typeof t === 'string') {
    // `<pkgId>:Module:Entity` → `Module:Entity` for readability.
    const parts = t.split(':');
    return parts.length >= 3 ? parts.slice(-2).join(':') : t;
  }
  if (typeof t === 'object') {
    const o = t as Record<string, unknown>;
    const m = o.moduleName ?? o.module;
    const e = o.entityName ?? o.entity;
    if (m && e) return `${m}:${e}`;
  }
  return undefined;
};

const partiesOf = (o: Record<string, unknown>): string[] =>
  [
    ...(Array.isArray(o.signatories) ? o.signatories : []),
    ...(Array.isArray(o.observers) ? o.observers : []),
    ...(Array.isArray(o.actingParties) ? o.actingParties : []),
    ...(Array.isArray(o.witnessParties) ? o.witnessParties : []),
  ].filter((x): x is string => typeof x === 'string');

const classify = (key: string): ParsedEvent['kind'] => {
  const k = key.toLowerCase();
  if (k.includes('creat')) return 'created';
  if (k.includes('exerc')) return 'exercised';
  if (k.includes('archi')) return 'archived';
  return 'event';
};

function unwrapEvent(e: Record<string, unknown>): ParsedEvent {
  let inner = e;
  let kind: ParsedEvent['kind'] = 'event';
  const keys = Object.keys(e ?? {});
  if (keys.length === 1) {
    const k = keys[0];
    const v = e[k] as Record<string, unknown>;
    inner = (v && typeof v === 'object' && 'value' in v ? (v.value as Record<string, unknown>) : v) ?? {};
    kind = classify(k);
  } else {
    kind = e.choice ? 'exercised' : e.createArguments || e.createArgument ? 'created' : 'event';
  }
  return {
    kind,
    templateId: asTemplate(inner.templateId),
    contractId: typeof inner.contractId === 'string' ? inner.contractId : undefined,
    choice: typeof inner.choice === 'string' ? inner.choice : undefined,
    parties: partiesOf(inner),
  };
}

/** Defensively pull the transaction tree out of a v2 update-by-id response. */
export function parseUpdateTree(raw: any): ParsedTree {
  const tx =
    raw?.update?.Transaction?.value ??
    raw?.update?.transaction ??
    raw?.transaction ??
    raw?.update ??
    raw ??
    {};
  const rawEvents: Record<string, unknown>[] = Array.isArray(tx.events) ? tx.events : [];
  const events = rawEvents.map(unwrapEvent);
  const parties = Array.from(new Set(events.flatMap((e) => e.parties)));
  return {
    updateId: tx.updateId,
    commandId: tx.commandId,
    offset: tx.offset,
    recordTime: tx.recordTime ?? tx.effectiveAt,
    synchronizerId: tx.synchronizerId,
    parties,
    events,
  };
}

export default function LedgerInspector({ updateId, onClose }: { updateId: string; onClose: () => void }) {
  // Organic exit: play the slide-out, THEN unmount. `closing` drives the CSS.
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 260);
  }, [onClose]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [tree, setTree] = useState<ParsedTree | null>(null);
  const [raw, setRaw] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading');
    setTree(null);
    setErr('');
    (async () => {
      try {
        const r = await fetch(`/ledger/update/${encodeURIComponent(updateId)}`, { credentials: 'include' });
        const txt = await r.text();
        if (!alive) return;
        if (!r.ok) {
          let msg = txt;
          try {
            msg = JSON.parse(txt)?.error ?? txt;
          } catch {
            /* non-JSON */
          }
          setErr(msg || `ledger fetch failed (${r.status})`);
          setState('error');
          return;
        }
        const body = txt ? JSON.parse(txt) : {};
        setRaw(JSON.stringify(body, null, 2));
        setTree(parseUpdateTree(body));
        setState('ok');
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : String(e));
        setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [updateId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div className={`drawer-backdrop${closing ? ' closing' : ''}`} role="presentation" onClick={close}>
      <aside
        className="drawer"
        role="dialog"
        aria-label="Ledger inspector"
        data-testid="ledger-inspector"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div className="drawer-titles">
            <span className="drawer-eyebrow">Committed on Canton devnet</span>
            <h2 className="drawer-title mono">update {short(updateId)}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close inspector">
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body">
          {state === 'loading' && <p className="hint">Fetching the committed transaction from the ledger…</p>}

          {state === 'error' && (
            <div className="callout fail">
              <div className="ct">Could not read the update</div>
              <p className="mono" style={{ fontSize: 13 }}>
                {err}
              </p>
            </div>
          )}

          {state === 'ok' && tree && (
            <div className="stack g4">
              <dl className="kv">
                <dt>Update id</dt>
                <dd className="mono" data-testid="insp-updateid">
                  {tree.updateId ?? updateId}
                </dd>
                <dt>Record time</dt>
                <dd className="mono">{tree.recordTime ?? '—'}</dd>
                <dt>Offset</dt>
                <dd className="mono">{tree.offset != null ? String(tree.offset) : '—'}</dd>
                {tree.synchronizerId && (
                  <>
                    <dt>Synchronizer</dt>
                    <dd className="mono">{short(tree.synchronizerId, 12, 8)}</dd>
                  </>
                )}
              </dl>

              <div className="panel">
                <div className="panel-head">
                  <h2>Acting / signatory parties</h2>
                  <span className="ph-meta">{tree.parties.length}</span>
                </div>
                <div className="panel-body">
                  {tree.parties.length ? (
                    <div className="chip-row">
                      {tree.parties.map((p) => (
                        <span className="chip ok" key={p} title={p}>
                          {shortParty(p)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="hint" style={{ margin: 0 }}>
                      No party fields surfaced in this projection.
                    </p>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Events</h2>
                  <span className="ph-meta">{tree.events.length}</span>
                </div>
                <div className="panel-body flush">
                  {tree.events.length ? (
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Kind</th>
                          <th>Template</th>
                          <th>Contract</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tree.events.map((ev, i) => (
                          <tr key={`${ev.contractId ?? 'ev'}-${i}`}>
                            <td>
                              <span className={`chip ${ev.kind === 'created' ? 'ok' : ev.kind === 'archived' ? 'fail' : 'sealed'}`}>
                                {ev.kind === 'exercised' && ev.choice ? `${ev.kind} · ${ev.choice}` : ev.kind}
                              </span>
                            </td>
                            <td className="mono">{ev.templateId ?? '—'}</td>
                            <td className="mono">{short(ev.contractId, 8, 5)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="hint" style={{ padding: 18, margin: 0 }}>
                      No events in this party's projection of the update.
                    </p>
                  )}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head">
                  <h2>Raw ledger JSON</h2>
                  <button type="button" className="btn ghost sm" onClick={() => setShowRaw((v) => !v)}>
                    {showRaw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showRaw && (
                  <pre className="raw-json mono" data-testid="insp-raw">
                    {raw}
                  </pre>
                )}
                <p className="panel-note">
                  This is the committed transaction as returned by the Canton JSON Ledger API — the on-ledger
                  record, not a UI mock.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
