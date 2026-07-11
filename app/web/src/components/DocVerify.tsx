// Shared building blocks for on-ledger document verification, reused by the
// Valuation tab (one prominent report) and the Documents accordion (many rows):
//   • HashChip     — a copyable, truncated sha256 chip.
//   • useVerify    — runs GET /verify/:name and maps it to a display state.
//   • VerifyBadge  — the inline ✓ / pending / mismatch result.
//
// SECURITY: read-only. Copy uses the clipboard API only; verify is a GET.
import { useCallback, useState } from 'react';
import { useToast } from '../state/Toast';
import { verifyDoc, truncHash, shortCid, type VerifyResult } from '../lib/docs';

// ── copyable hash chip ────────────────────────────────────────────────────────
const CopyGlyph = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M3.5 10.5H2.5V2.5H10.5V3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export function HashChip({ hash, label = 'sha256' }: { hash: string; label?: string }) {
  const toast = useToast();
  const copy = useCallback(() => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip?.writeText) {
      toast.show('clipboard unavailable', 'error');
      return;
    }
    clip.writeText(hash).then(
      () => toast.show(`${label} copied`, 'success'),
      () => toast.show('copy failed', 'error'),
    );
  }, [hash, label, toast]);

  return (
    <button
      type="button"
      className="hash-chip mono"
      onClick={copy}
      title={`Copy full ${label} — ${hash}`}
      aria-label={`Copy ${label} ${hash}`}
    >
      <span className="hc-hash">{truncHash(hash)}</span>
      <CopyGlyph />
    </button>
  );
}

// ── verify hook + badge ───────────────────────────────────────────────────────
export type VerifyState = 'idle' | 'loading' | 'match' | 'pending' | 'mismatch' | 'error';

export function useVerify(name: string) {
  const [state, setState] = useState<VerifyState>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);

  const run = useCallback(async () => {
    setState('loading');
    try {
      const r = await verifyDoc(name);
      setResult(r);
      if (r.matches) setState('match');
      else if (/not yet anchored/i.test(r.note)) setState('pending');
      else if (r.onChainHash) setState('mismatch');
      else setState('error');
    } catch {
      setResult(null);
      setState('error');
    }
  }, [name]);

  return { state, result, run };
}

/** Inline verification result, styled with the portal chip tokens. */
export function VerifyBadge({ state, result }: { state: VerifyState; result: VerifyResult | null }) {
  if (state === 'idle') return null;
  if (state === 'loading') {
    return (
      <span className="chip pending" role="status" data-testid="verify-badge">
        Verifying…
      </span>
    );
  }
  if (state === 'match') {
    return (
      <span className="chip ok" role="status" data-testid="verify-badge">
        ✓ Hash matches on-chain anchor · contract #{shortCid(result?.contractId)}
      </span>
    );
  }
  if (state === 'pending') {
    return (
      <span className="chip pending" role="status" data-testid="verify-badge">
        Awaiting anchoring — not yet on-ledger
      </span>
    );
  }
  if (state === 'mismatch') {
    return (
      <span className="chip fail" role="status" data-testid="verify-badge">
        Hash does not match the on-chain anchor
      </span>
    );
  }
  return (
    <span className="chip fail" role="status" data-testid="verify-badge">
      Verification unavailable — retry
    </span>
  );
}
