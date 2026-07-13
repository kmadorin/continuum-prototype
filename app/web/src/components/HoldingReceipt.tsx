// Holding-provenance receipt — the buyer's / rolling-LP's post-close beat:
// "I hold an asset that proves its own issuance basis." Reads the RegistryHolding I
// own (CV units, instId MERIDIAN-CV-I) and surfaces the provenance carried in its
// meta_: the Valuation Report sha256 the units were issued under, with a live Verify
// (recompute → on-chain match), View report, and a deep-link into the Ledger Inspector
// on the settlement transaction.
//
// The display hash prefers the holding's own meta_["continuum/valuation-sha256"]; if
// the mint carried an empty meta_ (demo close), it falls back to the anchored manifest
// sha256 for the valuation report — the same bytes Verify recomputes. The mint tx is
// resolved from this party's own custody audit trail (most recent settled updateId),
// noted as such when it isn't the exact mint entry.
//
// SECURITY: read-only — a manifest GET, a /verify GET, an /audit GET. No key material.
import { useEffect, useState } from 'react';
import { fetchManifest, truncHash } from '../lib/docs';
import { HashChip, VerifyBadge, useVerify } from './DocVerify';
import { useInspector } from '../state/Inspector';

const DOC_NAME = 'valuation-report';
const fmtUsdM = (n: number): string => `$${(n / 1_000_000).toFixed(1)}M`;
const shortId = (id: string): string => (id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id);

export default function HoldingReceipt({
  amount,
  clearingPct,
  metaHash,
  instLabel = 'MERIDIAN-CV-I',
  title = 'My holding',
}: {
  /** Units held, from RegistryHolding.amount. */
  amount: number;
  /** Deal clearing price as a fraction (0.96). */
  clearingPct: number;
  /** RegistryHolding.meta_["continuum/valuation-sha256"], or '' if the mint carried none. */
  metaHash?: string;
  instLabel?: string;
  title?: string;
}) {
  const inspector = useInspector();
  const { state, result, run } = useVerify(DOC_NAME);
  const [fallbackHash, setFallbackHash] = useState('');
  const [mintUpdateId, setMintUpdateId] = useState<string | null>(null);
  const [approxTx, setApproxTx] = useState(false);

  useEffect(() => {
    let on = true;
    fetchManifest()
      .then((m) => on && setFallbackHash(m.find((d) => d.name === DOC_NAME)?.sha256 ?? ''))
      .catch(() => {});
    // Resolve a mint tx to inspect: the newest settled update in this party's custody
    // trail. It is the buyer's own signed action stream, so it may be the closest
    // resolvable proof rather than the GP's mint itself — flagged via `approxTx`.
    fetch('/audit', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((es: Array<{ updateId?: string }>) => {
        if (!on || !Array.isArray(es)) return;
        const signed = es.filter((e) => e?.updateId);
        if (signed.length) {
          setMintUpdateId(signed[signed.length - 1].updateId!);
          setApproxTx(true);
        }
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  const hash = metaHash || fallbackHash;
  // CV units are issued at $1.00 apiece — the clearing discount is already expressed in HOW
  // MANY units you got (units = clearing × NAV), so it must not be applied to the price a
  // second time. What the holding cost is simply its unit count in dollars; the NAV basis
  // it was struck at is the separate figure beside it.
  const cost = amount;
  const pct = (clearingPct * 100).toFixed(1);

  return (
    <div className="panel holding-receipt" data-testid="holding-receipt">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="ph-meta mono">{instLabel}</span>
      </div>
      <div className="panel-body stack g3">
        <div className="hr-headline">
          <span className="hr-units mono" data-testid="hr-amount">
            {amount.toLocaleString()}
          </span>
          <span className="hr-unit-label">CV units</span>
          <span className="hr-sep" aria-hidden="true">
            ·
          </span>
          <span className="hr-fig mono">cost {fmtUsdM(cost)}</span>
          <span className="hr-sep" aria-hidden="true">
            ·
          </span>
          <span className="hr-fig mono">{pct}% of independent NAV</span>
        </div>

        <div className="hr-prov">
          <span className="hr-prov-lab">Issued under Valuation Report</span>
          <div className="hr-prov-hash">
            <span className="doc-hash-lab">sha256</span>
            {hash ? <HashChip hash={hash} /> : <span className="hint">resolving…</span>}
            {metaHash ? null : (
              <span className="hint" title="The demo mint carried an empty meta_; showing the anchored report hash Verify recomputes.">
                (from anchored report)
              </span>
            )}
          </div>
        </div>

        <div className="doc-actions">
          <button type="button" className="btn" onClick={run} disabled={state === 'loading'}>
            {state === 'loading' ? 'Verifying…' : 'Verify'}
          </button>
          <a className="btn ghost" href={`/docs/${DOC_NAME}`} target="_blank" rel="noopener noreferrer">
            View report
          </a>
          <button
            type="button"
            className="btn ghost"
            disabled={!mintUpdateId}
            onClick={() => mintUpdateId && inspector.open(mintUpdateId)}
          >
            Inspect mint tx
          </button>
          <VerifyBadge state={state} result={result} />
        </div>

        {state === 'match' && (
          <p className="hint" style={{ margin: 0 }}>
            The report bytes recompute to {truncHash(result?.docSha256)} — matching the hash anchored on-chain.
          </p>
        )}
        {mintUpdateId && approxTx && (
          <p className="hint" style={{ margin: 0 }}>
            Inspect deep-links your custody trail's most recent settled transaction ({shortId(mintUpdateId)}).
          </p>
        )}
      </div>
    </div>
  );
}
