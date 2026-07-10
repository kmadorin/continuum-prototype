// Audit tab — court-grade artifacts.
//
// `GET /audit` returns the session tenant's signature audit trail: every /action the
// custody backend signed (or refused) with THIS party's key. We render it as the
// custodian's signature log — timestamp, custodian, key fingerprint (short), action,
// outcome, and the resulting updateId (clickable → the Ledger Inspector, which pulls
// the committed transaction). "Every consent is a court-grade artifact."
//
// SECURITY: read-only. The fingerprint is a PUBLIC key fingerprint, never key material.
import { useEffect, useState } from 'react';
import { useInspector } from '../state/Inspector';

export type AuditEntry = {
  ts: string;
  username: string;
  custodianName: string;
  party: string;
  keyFingerprint: string;
  updateId?: string;
  action: string;
  outcome: 'signed' | 'failed';
  error?: string;
};

const shortFp = (fp?: string): string => (!fp ? '—' : fp.length > 14 ? `${fp.slice(0, 8)}…${fp.slice(-4)}` : fp);
const shortId = (id?: string): string => (!id ? '—' : id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id);
const fmtTs = (ts: string): string => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
};

export default function AuditTrail() {
  const inspector = useInspector();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState<string>('');

  const load = async () => {
    try {
      const r = await fetch('/audit', { credentials: 'include' });
      const txt = await r.text();
      if (!r.ok) {
        let msg = txt;
        try {
          msg = JSON.parse(txt)?.error ?? txt;
        } catch {
          /* non-JSON */
        }
        setErr(msg || `audit fetch failed (${r.status})`);
        return;
      }
      setErr('');
      setEntries(txt ? JSON.parse(txt) : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    let on = true;
    const tick = () => {
      if (on) void load();
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="stack g4">
      <div className="page-head">
        <span className="ph-sub">Custody signature audit trail — reconcilable against the on-ledger record</span>
        <h1>Signature audit trail</h1>
      </div>

      {err && (
        <div className="callout fail">
          <div className="ct">Could not read the audit log</div>
          <p className="mono" style={{ fontSize: 13 }}>
            {err}
          </p>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h2>Signatures released by your custodian</h2>
          <span className="ph-meta">{entries ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : 'loading…'}</span>
        </div>
        <div className="panel-body flush">
          {entries && entries.length ? (
            <table className="data">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Custodian</th>
                  <th>Key fingerprint</th>
                  <th>Action</th>
                  <th>Outcome</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={`${e.ts}-${i}`} data-testid="audit-row">
                    <td className="mono">{fmtTs(e.ts)}</td>
                    <td>{e.custodianName}</td>
                    <td className="mono" title={e.keyFingerprint}>
                      {shortFp(e.keyFingerprint)}
                    </td>
                    <td className="mono">{e.action}</td>
                    <td>
                      <span className={`chip ${e.outcome === 'signed' ? 'ok' : 'fail'}`}>{e.outcome}</span>
                    </td>
                    <td>
                      {e.updateId ? (
                        <button type="button" className="link-mono" onClick={() => inspector.open(e.updateId!)}>
                          {shortId(e.updateId)}
                        </button>
                      ) : (
                        <span className="mono" style={{ color: 'var(--mute)' }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : entries ? (
            <p className="hint" style={{ padding: 18, margin: 0 }}>
              No signatures yet. Every action your custodian signs on your behalf lands here — click any update id
              to open the committed transaction.
            </p>
          ) : (
            <p className="hint" style={{ padding: 18, margin: 0 }}>
              Loading the signature trail…
            </p>
          )}
        </div>
        <p className="panel-note">
          Each row is a real signature request the custody backend processed with your party's key — the fingerprint
          and update id reconcile against the on-ledger transaction.
        </p>
      </div>
    </div>
  );
}
