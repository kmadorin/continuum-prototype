// Anchored-documents seam for the Valuation + Documents tabs. The custody backend
// serves three same-origin routes (dev-proxied in vite.config.ts):
//   GET /docs/manifest     → public metadata + the real sha256 of the served bytes
//   GET /docs/:name        → the exact document bytes (HTML) — opened to "View"
//   GET /verify/:name      → recompute sha256, match it to the on-chain contentHash
//
// SECURITY: read-only. These are GETs; no key material, nothing persisted client-side.

import { authFetch } from './authToken';

/** One manifest row — the shape `GET /docs/manifest` returns. */
export type DocManifestEntry = {
  name: string;
  file: string;
  title: string;
  group: DocGroup;
  signer: string;
  date: string;
  sha256: string;
  templateSuffix: string;
  contentType: string;
};

export type DocGroup = 'Deal Formation' | 'Process Certifications' | 'Settlement';

/** Fixed accordion order (JPM document-forward layout). */
export const DOC_GROUPS: DocGroup[] = ['Deal Formation', 'Process Certifications', 'Settlement'];

/** The `GET /verify/:name` response shape. */
export type VerifyResult = {
  docSha256: string;
  onChainHash: string | null;
  matches: boolean;
  contractId?: string;
  note: string;
};

/** Truncate a hex hash for display: `ab5a539d8b…07de09`. */
export const truncHash = (h?: string | null): string =>
  h ? (h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h) : '—';

/** Truncate a contract id for the "contract #…" affordance. */
export const shortCid = (id?: string | null): string =>
  id ? (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id) : '—';

/** The public documents manifest. Same-origin; session cookie rides along. */
export async function fetchManifest(): Promise<DocManifestEntry[]> {
  const r = await fetch('/docs/manifest', { credentials: 'include' });
  if (!r.ok) throw new Error(`/docs/manifest → ${r.status}`);
  return (await r.json()) as DocManifestEntry[];
}

/** Verify one document against its on-ledger anchor (session-scoped recompute). */
export async function verifyDoc(name: string): Promise<VerifyResult> {
  const r = await authFetch(`/verify/${encodeURIComponent(name)}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string })?.error ?? `/verify → ${r.status}`);
  return body as VerifyResult;
}
