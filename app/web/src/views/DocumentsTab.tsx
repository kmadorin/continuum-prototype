// Documents tab — the JPM-style document-forward accordion. Three collapsible
// groups (Deal Formation · Process Certifications · Settlement) built from
// GET /docs/manifest. Each row: file icon · title · signer · date · a copyable
// hash chip · View (opens the bytes) · Verify (GET /verify/:name → ✓ / pending).
//
// Each row auto-checks its on-ledger anchor (GET /verify/:name) and renders in ONE
// of two states — never a hybrid:
//   • SIGNED & ANCHORED (verify → matches) — signer · date, the sha256 chip, a green
//     ✓, and Re-verify.
//   • AWAITING (verify → "not yet anchored", or no such contract for this seat) — a
//     greyed row with "Awaiting — produced at [group]", NO signer, NO hash, NO tick;
//     only a muted "Draft" link (the prepared bytes may exist off-chain).
// In this model the valuer's Canton signature IS the on-ledger anchor, so a document
// is either awaiting OR signed-and-anchored. SECURITY: read-only.
import { useEffect, useState } from 'react';
import { fetchManifest, DOC_GROUPS, type DocManifestEntry, type DocGroup } from '../lib/docs';
import { HashChip, VerifyBadge, useVerify } from '../components/DocVerify';

function FileGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className="doc-glyph">
      <path
        d="M6 2.5h8l4 4V21a.5.5 0 0 1-.5.5H6A.5.5 0 0 1 5.5 21V3A.5.5 0 0 1 6 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M14 2.5V6.5H18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// One document row — owns its own verify state so rows resolve independently. It
// auto-checks the anchor on mount, then renders AWAITING or SIGNED (never both).
function DocRow({ doc }: { doc: DocManifestEntry }) {
  const { state, result, run } = useVerify(doc.name);
  const [everMatched, setEverMatched] = useState(false);

  // Auto-resolve this row's anchor state once on mount.
  useEffect(() => {
    void run();
  }, [run]);
  useEffect(() => {
    if (state === 'match') setEverMatched(true);
  }, [state]);

  // AWAITING: no on-chain contract for this doc yet (not-anchored, or unresolved).
  // Anything that is NOT a confirmed match reads as awaiting — we never show a
  // signer/hash next to an un-anchored doc. Once matched, a manual Re-verify stays
  // in the signed layout while it re-checks (no flicker back to awaiting).
  const anchored = state === 'match' || (everMatched && state === 'loading');
  const awaiting = !anchored;

  return (
    <div className={`doc-row${awaiting ? ' greyed' : ''}`} data-testid="doc-row" data-state={anchored ? 'signed' : 'awaiting'}>
      <span className="dr-icon" aria-hidden="true">
        <FileGlyph />
      </span>
      <div className="dr-body">
        <div className="dr-title">{doc.title}</div>
        {anchored ? (
          <div className="dr-sub mono">
            Signed by {doc.signer} · {doc.date}
          </div>
        ) : (
          <div className="dr-sub">Awaiting — produced at {doc.group}</div>
        )}
      </div>
      <div className="dr-hash">{anchored ? <HashChip hash={doc.sha256} /> : null}</div>
      <div className="dr-actions">
        {anchored ? (
          <>
            <a className="btn ghost sm" href={`/docs/${doc.name}`} target="_blank" rel="noopener noreferrer">
              View
            </a>
            <button type="button" className="btn ghost sm" onClick={run} disabled={state === 'loading'}>
              {state === 'loading' ? 'Verifying…' : 'Re-verify'}
            </button>
          </>
        ) : (
          <a className="btn ghost sm" href={`/docs/${doc.name}`} target="_blank" rel="noopener noreferrer">
            Draft
          </a>
        )}
      </div>
      {(anchored || state === 'mismatch' || state === 'error') && (
        <div className="dr-verify">
          <VerifyBadge state={state} result={result} />
        </div>
      )}
    </div>
  );
}

function Group({ group, docs }: { group: DocGroup; docs: DocManifestEntry[] }) {
  const [open, setOpen] = useState(true);
  const panelId = `docgroup-${group.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="panel doc-group">
      <button
        type="button"
        className="panel-head doc-group-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`dg-caret${open ? ' open' : ''}`} aria-hidden="true" />
        <h2>{group}</h2>
        <span className="ph-meta">
          {docs.length} document{docs.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <div id={panelId} className="panel-body flush">
          {docs.length ? (
            docs.map((d) => <DocRow key={d.name} doc={d} />)
          ) : (
            <p className="hint" style={{ padding: 18, margin: 0 }}>
              No documents in this group yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentsTab() {
  const [manifest, setManifest] = useState<DocManifestEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetchManifest()
      .then((m) => on && setManifest(m))
      .catch((e) => on && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      on = false;
    };
  }, []);

  if (err) {
    return (
      <div className="callout fail">
        <div className="ct">Documents unavailable</div>
        <p className="mono" style={{ fontSize: 13 }}>
          {err}
        </p>
      </div>
    );
  }
  if (!manifest) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        Loading documents…
      </p>
    );
  }

  return (
    <div className="stack g3">
      {DOC_GROUPS.map((g) => (
        <Group key={g} group={g} docs={manifest.filter((d) => d.group === g)} />
      ))}
    </div>
  );
}
