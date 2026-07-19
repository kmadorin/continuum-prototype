// app/custody/app.ts
// The custody spine as a dependency-injected Hono app (so tests can drive it in-process
// with mocked signing/transport). server.ts wires the real WalletClient + M2M token.
//
// Security invariants enforced here:
//  - /action ALWAYS signs with the SESSION tenant's party+key. The acting party is taken
//    from the signed session cookie, never from the request body. A request that tries to
//    act as any other party is refused (403).
//  - /api reads are FORCED to the session party's filter — a user cannot read another
//    party's ACS.
//  - The audit log records the public key FINGERPRINT, never key material.
import { Hono } from 'hono';
// Session identity travels as an `Authorization: Bearer` token (per-tab, from the
// browser's sessionStorage), not a cookie — a cookie is shared across all tabs of an
// origin, so it could hold only one seat at a time.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, resolve } from 'node:path';
import type { JsCommand } from '../ledger-client/src/types';
import type { Ed25519Key } from '../ledger-client/src/ed25519';
import { signSession, verifySession, type SessionData } from './session';
import type { TenantStore } from './tenants';
import { VALUATION_SHA256 } from './docs/hashes';

/** Minimal slice of WalletClient the spine needs (so tests can mock it). */
export interface Signer {
  submitSigned(
    party: string,
    key: Ed25519Key,
    fingerprint: string,
    commands: JsCommand[],
  ): Promise<{ updateId?: string }>;
}

/** Minimal read port for server-initiated idempotency checks (so tests can omit it). */
export interface Reader {
  activeContracts(
    party: string,
    opts?: { templateId?: string },
  ): Promise<Array<{ contractId: string; args: Record<string, unknown> }>>;
}

export type AuditEntry = {
  ts: string;
  username: string;
  custodianName: string;
  party: string;
  keyFingerprint: string;
  updateId?: string | undefined;
  action: string;
  outcome: 'signed' | 'failed';
  error?: string | undefined;
};

export type AppDeps = {
  tenants: TenantStore;
  signer: Signer;
  sessionSecret: string;
  /** Ledger API base for the reads proxy (no trailing slash). */
  ledgerBase: string;
  /** M2M transport token getter; injected as the Bearer for proxied reads. */
  token: () => Promise<string>;
  /** fetch used to forward proxied reads (default: global fetch). */
  fetchImpl?: typeof fetch;
  /** Shared audit store (in-memory for the demo). */
  audit?: AuditEntry[];
  /** Absolute path to the built SPA (../web/dist). If set, served with SPA fallback. */
  staticRoot?: string;
  /**
   * Absolute path to the anchored-documents directory (default: ./docs next to app.ts).
   * Holds the sample docs + manifest.json served by /docs/* and re-hashed by /verify.
   */
  docsRoot?: string;
  /** Read port for server-initiated idempotency checks (the auto-seed). Omitted in tests. */
  reads?: Reader;
  /** Seed the current epoch's independent valuation on boot (server.ts sets true). */
  seedOnBoot?: boolean;
};

/** One row of the documents manifest (public metadata + the real sha256 of the served bytes). */
export type DocManifestEntry = {
  name: string;
  file: string;
  title: string;
  group: string;
  signer: string;
  date: string;
  sha256: string;
  templateSuffix: string;
  contentType?: string;
};

const suffix = (tid: string | undefined): string => {
  if (!tid) return 'unknown';
  const parts = tid.split(':').slice(1);
  return parts.length ? parts.join(':') : tid;
};

/** Human-readable summary of a command batch for the audit trail. */
function summarize(commands: JsCommand[]): string {
  return commands
    .map((cmd: any) => {
      if (cmd?.CreateCommand) return `create ${suffix(cmd.CreateCommand.templateId)}`;
      if (cmd?.ExerciseCommand)
        return `exercise ${cmd.ExerciseCommand.choice} on ${suffix(cmd.ExerciseCommand.templateId)}`;
      return 'unknown';
    })
    .join('; ');
}

/**
 * Collect every party the request is (explicitly) trying to ACT AS. Deals legitimately
 * NAME other parties in their payload (gp/buyer/lpac as data), so we do NOT scan argument
 * values — only the acting/authorizing positions a client could try to set.
 */
function requestedActAs(body: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') out.push(x);
  };
  push(body?.actAs);
  push(body?.party);
  for (const cmd of Array.isArray(body?.commands) ? body.commands : []) {
    push(cmd?.actAs);
    push(cmd?.party);
  }
  return out;
}

/** Force an active-contracts query to project ONLY the session party's ACS. */
function forceParty(body: any, party: string): any {
  const existing = body?.filter?.filtersByParty ?? {};
  const filterValue =
    Object.values(existing)[0] ?? {
      cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }],
    };
  const filter: any = { ...(body?.filter ?? {}), filtersByParty: { [party]: filterValue } };
  delete filter.filtersForAnyParty;
  return { ...body, filter };
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const audit = deps.audit ?? [];

  const bearer = (c: any): string | undefined => {
    const h = c.req.header('authorization') ?? c.req.header('Authorization');
    return h && h.startsWith('Bearer ') ? h.slice('Bearer '.length) : undefined;
  };
  const session = (c: any): SessionData | null =>
    verifySession(bearer(c), deps.sessionSecret);

  // ── POST /auth/login ────────────────────────────────────────────────────────
  app.post('/auth/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const username = body?.username;
    const password = body?.password;
    const tenant = typeof username === 'string' ? deps.tenants.byUsername.get(username) : undefined;
    if (!tenant || tenant.password !== password) {
      return c.json({ error: 'invalid credentials' }, 401);
    }
    const data: SessionData = {
      username: tenant.username,
      tenant: tenant.tenant,
      role: tenant.role,
      party: tenant.party,
      custodianName: tenant.custodianName,
    };
    const token = signSession(data, deps.sessionSecret);
    return c.json({ token, role: tenant.role, party: tenant.party, custodianName: tenant.custodianName });
  });

  // ── GET /me ───────────────────────────────────────────────────────────────────
  app.get('/me', (c) => {
    const s = session(c);
    if (!s) return c.json({ error: 'unauthenticated' }, 401);
    return c.json({ role: s.role, party: s.party, custodianName: s.custodianName });
  });

  // ── POST /action ── sign with the SESSION party's key ONLY ─────────────────────
  app.post('/action', async (c) => {
    const s = session(c);
    if (!s) return c.json({ error: 'unauthenticated' }, 401);
    const tenant = deps.tenants.byParty.get(s.party);
    if (!tenant) return c.json({ error: 'unknown tenant for session' }, 401);

    const body = await c.req.json().catch(() => null);
    const commands = body?.commands;
    if (!Array.isArray(commands) || commands.length === 0) {
      return c.json({ error: 'commands required' }, 400);
    }

    // ENFORCEMENT: refuse any attempt to authorize as a different party.
    const foreign = requestedActAs(body).filter((p) => p !== s.party);
    if (foreign.length) {
      audit.push({
        ts: new Date().toISOString(),
        username: s.username,
        custodianName: s.custodianName,
        party: s.party,
        keyFingerprint: tenant.fingerprint,
        action: summarize(commands),
        outcome: 'failed',
        error: `refused: session party ${s.party} cannot act as ${foreign[0]}`,
      });
      return c.json(
        { error: `refused: session party ${s.party} cannot act as ${foreign[0]}` },
        403,
      );
    }

    const action = summarize(commands);
    try {
      // The party/key/fingerprint come from the SESSION tenant — never the request.
      const res = await deps.signer.submitSigned(s.party, tenant.key, tenant.fingerprint, commands);
      const entry: AuditEntry = {
        ts: new Date().toISOString(),
        username: s.username,
        custodianName: s.custodianName,
        party: s.party,
        keyFingerprint: tenant.fingerprint,
        updateId: res?.updateId,
        action,
        outcome: 'signed',
      };
      audit.push(entry);
      return c.json({ updateId: res?.updateId });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      audit.push({
        ts: new Date().toISOString(),
        username: s.username,
        custodianName: s.custodianName,
        party: s.party,
        keyFingerprint: tenant.fingerprint,
        action,
        outcome: 'failed',
        error: msg,
      });
      return c.json({ error: msg }, 502);
    }
  });

  // ── GET /audit ── entries for the session's tenant ─────────────────────────────
  app.get('/audit', (c) => {
    const s = session(c);
    if (!s) return c.json({ error: 'unauthenticated' }, 401);
    return c.json(audit.filter((e) => e.party === s.party));
  });

  // ── /api/v2/* ── per-party reads proxy (inject M2M token; force party filter) ───
  app.all('/api/*', async (c) => {
    const s = session(c);
    if (!s) return c.json({ error: 'unauthenticated' }, 401);

    const url = new URL(c.req.url);
    const rest = url.pathname.replace(/^\/api/, '');
    const target = `${deps.ledgerBase}${rest}${url.search}`;
    const method = c.req.method;
    const token = await deps.token();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

    let bodyText: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      const raw = await c.req.json().catch(() => null);
      const payload = rest === '/v2/state/active-contracts' && raw ? forceParty(raw, s.party) : raw;
      bodyText = JSON.stringify(payload ?? {});
      headers['Content-Type'] = 'application/json';
    }

    const init: RequestInit = { method, headers };
    if (bodyText !== undefined) init.body = bodyText;
    const r = await fetchImpl(target, init);
    const txt = await r.text();
    return new Response(txt, {
      status: r.status,
      headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/json' },
    });
  });

  // ── Demo epoch ── the reset knob ──────────────────────────────────────────────
  // The ledger is append-only, so "start over" can't delete history. Instead every
  // demo run is scoped by an EPOCH that rotates the four on-ledger JOIN/IDENTITY keys
  // the UI filters on: the deal id, the human cv, and the two instrument ids (holdings
  // are filtered by instId, so those must rotate too or old units/cash would still
  // show). A fresh epoch → the new keys have zero contracts → every seat's view is
  // pristine and the GP re-opens the room. Old contracts linger invisibly on devnet.
  // Epoch 1 == the original hardcoded constants (no change for existing state).
  // In-memory (single machine); a restart falls back to epoch 1.
  let demoEpoch = 1;
  const dealKeys = (e: number) =>
    e <= 1
      ? { epoch: 1, dealId: 'M1', cv: 'Meridian CV I', unit: 'MERIDIAN-CV-I', usdc: 'USDC' }
      : { epoch: e, dealId: `M${e}`, cv: `Meridian CV I #${e}`, unit: `MERIDIAN-CV-I-${e}`, usdc: `USDC-${e}` };

  // ── GET /registry ── PUBLIC party ids + custodian names + demo keys (no session) ─
  // The frontend needs every party id (the deal room references buyer/lpExiting/…),
  // and party ids are public. Key material is never included. The demo `deal` keys let
  // the client scope its reads to the current epoch.
  app.get('/registry', (c) => {
    const parties: Record<string, string> = {};
    const custodians: Record<string, string> = {};
    for (const t of deps.tenants.byParty.values()) {
      parties[t.role] = t.party;
      custodians[t.role] = t.custodianName;
    }
    return c.json({ parties, custodians, deal: dealKeys(demoEpoch) });
  });

  // ── Auto-seed the independent valuation ────────────────────────────────────────
  // Per ILPA, the independent valuation is an INPUT to price + the LPAC fairness
  // review, NOT a precondition to opening the room — so the real-world state a GP's
  // closing room is in is "the independent valuation already anchored". We reproduce
  // that on-ledger: the REAL valuer party (Kroll) signs a ValuationReport for the
  // current epoch's dealId (backend holds the valuer key — identical artifact to a
  // manual click: agent=valuer ≠ gp, real Ed25519 signature, real contentHash). The
  // GP tile + Close ceremony check then auto-resolve off the ACS (no view change). The
  // Valuer seat stays as a read-only "anchored ✓" proof; its manual sign button remains
  // a genuine create-if-absent fallback. We do NOT seed fairness/consent — those are
  // the LPAC governance seat's live decisions, and pre-seeding them would misrepresent
  // sequencing.
  const VALUATION_TEMPLATE = '#continuum-contracts:Continuum.Valuation:ValuationReport';
  // Reads must filter by the module:entity SUFFIX, never by the package-NAME form above.
  // activeContracts matches with `templateId.endsWith(opts.templateId)`, and the ledger
  // returns package-HASH ids (b51d78dc…:Continuum.Valuation:ValuationReport) which can never
  // end with '#continuum-contracts:…'. Filtering by the full constant matched nothing, so the
  // idempotency check below always came up empty and re-seeded a duplicate report on EVERY
  // boot (prod reached three). The create at submit-time still uses the package-name form.
  const VALUATION_SUFFIX = 'Continuum.Valuation:ValuationReport';
  const SEED_NAV = { navLow: '480000000.0', navHigh: '520000000.0', asOfDate: '2026-06-30' };
  const seedingByEpoch = new Map<number, Promise<void>>(); // in-flight dedup (double-click Reset)

  async function seedValuation(epoch: number): Promise<void> {
    const inFlight = seedingByEpoch.get(epoch);
    if (inFlight) return inFlight;
    const run = (async () => {
      const valuer = deps.tenants.all.find((t) => t.role === 'valuer');
      const gp = deps.tenants.all.find((t) => t.role === 'gp');
      const lpac = deps.tenants.all.find((t) => t.role === 'lpac');
      if (!valuer || !gp || !lpac) return; // missing valuer/gp/lpac tenant → skip
      const keys = dealKeys(epoch);
      // Idempotency: if the valuer's ACS already holds a report for THIS epoch's dealId,
      // do nothing (covers restarts + reset replays).
      if (deps.reads) {
        try {
          const existing = await deps.reads.activeContracts(valuer.party, { templateId: VALUATION_SUFFIX });
          if (existing.some((c) => c.args?.dealId === keys.dealId)) return;
        } catch {
          /* read failed — fall through and attempt the create (worst case a harmless dup) */
        }
      }
      await deps.signer.submitSigned(valuer.party, valuer.key, valuer.fingerprint, [
        {
          CreateCommand: {
            templateId: VALUATION_TEMPLATE,
            createArguments: {
              agent: valuer.party,
              gp: gp.party,
              lpac: lpac.party,
              dealId: keys.dealId,
              navLow: SEED_NAV.navLow,
              navHigh: SEED_NAV.navHigh,
              asOfDate: SEED_NAV.asOfDate,
              contentHash: VALUATION_SHA256,
            },
          },
        },
      ]);
    })().finally(() => seedingByEpoch.delete(epoch));
    seedingByEpoch.set(epoch, run);
    return run;
  }

  // Derive the live epoch from the LEDGER, not from process memory. `demoEpoch` starts
  // at 1 on every boot, but reset seeds a ValuationReport per epoch under dealId `M{n}`,
  // so the highest n on the valuer's ACS IS the current epoch. When Fly auto-stops an
  // idle machine and the next request cold-starts it, this RESUMES the demo where it was
  // instead of snapping every seat back to M1 — which is exactly what made "Reset" look
  // like it silently reverted after the app sat idle.
  async function deriveEpoch(): Promise<number> {
    if (!deps.reads) return demoEpoch;
    const valuer = deps.tenants.all.find((t) => t.role === 'valuer');
    if (!valuer) return demoEpoch;
    try {
      const reports = await deps.reads.activeContracts(valuer.party, { templateId: VALUATION_SUFFIX });
      let max = 1;
      for (const c of reports) {
        const m = /^M(\d+)$/.exec(String(c.args?.dealId ?? ''));
        if (m) max = Math.max(max, Number(m[1]));
      }
      return max;
    } catch {
      return demoEpoch; // read failed → keep the in-memory value (worst case: epoch 1)
    }
  }

  // ── POST /demo/reset ── bump the epoch → the whole demo starts over ────────────
  // Landing-page "Reset demo" calls this (confirm-gated in the UI). No session needed:
  // it authorizes nothing beyond seeding the independent valuation and reveals no
  // secrets — it advances the epoch counter so subsequent reads target fresh deal keys,
  // then anchors the new epoch's independent valuation BEFORE responding so the client
  // never reloads into a "Pending Valuation" flash. The client then reloads.
  app.post('/demo/reset', async (c) => {
    demoEpoch += 1;
    const epoch = demoEpoch;
    try {
      await seedValuation(epoch);
    } catch (err) {
      // Degrade gracefully: the reset still succeeds; the UI falls back to the Pending
      // state and the Valuer seat's manual sign is the recovery path.
      console.error('[demo/reset] valuation seed failed', err);
    }
    return c.json({ deal: dealKeys(epoch) });
  });

  // ── GET /ledger/update/:updateId ── the Ledger Inspector proof ────────────────
  // Fetch the committed transaction by updateId as the SESSION party (privacy-scoped)
  // and return the raw tree: signatory parties, created/exercised events, record time.
  app.get('/ledger/update/:updateId', async (c) => {
    const s = session(c);
    if (!s) return c.json({ error: 'unauthenticated' }, 401);
    const updateId = c.req.param('updateId');
    const token = await deps.token();
    const updateFormat = {
      includeTransactions: {
        eventFormat: {
          filtersByParty: {
            [s.party]: {
              cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }],
            },
          },
          verbose: true,
        },
        transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
      },
    };
    const r = await fetchImpl(`${deps.ledgerBase}/v2/updates/update-by-id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ updateId, updateFormat }),
    });
    const txt = await r.text();
    return new Response(txt, {
      status: r.status,
      headers: { 'Content-Type': r.headers.get('content-type') ?? 'application/json' },
    });
  });

  // ── anchored documents: manifest + byte-exact serving + on-ledger verify ───────
  // docsRoot holds the sample docs (Kroll valuation, fairness, PSA) and manifest.json.
  const docsRoot = deps.docsRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), 'docs');
  const loadManifest = (): DocManifestEntry[] => {
    try {
      return JSON.parse(readFileSync(join(docsRoot, 'manifest.json'), 'utf8')) as DocManifestEntry[];
    } catch {
      return [];
    }
  };
  // Resolve a manifest name to an absolute file path inside docsRoot (no traversal).
  const docPath = (entry: DocManifestEntry): string | null => {
    const candidate = normalize(join(docsRoot, entry.file));
    if (!candidate.startsWith(docsRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) return null;
    return candidate;
  };

  // GET /docs/manifest — PUBLIC (metadata + hashes; no session). Registered before /docs/:name.
  app.get('/docs/manifest', (c) => c.json(loadManifest()));

  // GET /docs/:name — serve the exact bytes that were hashed (byte-identical to /verify input).
  app.get('/docs/:name', (c) => {
    const name = c.req.param('name').replace(/\.html$/, '');
    const entry = loadManifest().find((m) => m.name === name);
    if (!entry) return c.json({ error: 'unknown document' }, 404);
    const path = docPath(entry);
    if (!path) return c.json({ error: 'document file missing' }, 404);
    const data = new Uint8Array(readFileSync(path));
    return new Response(data as any, {
      status: 200,
      headers: { 'Content-Type': entry.contentType ?? 'application/octet-stream' },
    });
  });

  // GET /verify/:name — the "Verify on-ledger" proof. Recompute the doc's sha256, read the
  // matching template's contentHash from the SESSION party's ACS, compare.
  app.get('/verify/:name', async (c) => {
    const s = session(c);
    if (!s) return c.json({ error: 'unauthenticated' }, 401);
    const name = c.req.param('name').replace(/\.html$/, '');
    const entry = loadManifest().find((m) => m.name === name);
    if (!entry) return c.json({ error: 'unknown document' }, 404);
    const path = docPath(entry);
    if (!path) return c.json({ error: 'document file missing' }, 404);

    const docSha256 = createHash('sha256').update(readFileSync(path)).digest('hex');

    // Query the session party's ACS for the anchoring template.
    let contracts: Array<{ contractId: string; contentHash?: string }> = [];
    try {
      const token = await deps.token();
      const authHdr = { Authorization: `Bearer ${token}` };
      const endRes = await fetchImpl(`${deps.ledgerBase}/v2/state/ledger-end`, { headers: authHdr });
      const { offset } = (await endRes.json()) as { offset: number };
      const acsRes = await fetchImpl(`${deps.ledgerBase}/v2/state/active-contracts`, {
        method: 'POST',
        headers: { ...authHdr, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeAtOffset: offset,
          filter: {
            filtersByParty: {
              [s.party]: {
                cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }],
              },
            },
          },
          verbose: false,
        }),
      });
      const raw = await acsRes.json();
      const items = Array.isArray(raw) ? raw : [raw];
      contracts = items
        .map((e: any) => e?.contractEntry?.JsActiveContract?.createdEvent ?? {})
        .filter((ce: any) => ce.contractId && typeof ce.templateId === 'string' && ce.templateId.endsWith(entry.templateSuffix))
        .map((ce: any) => ({ contractId: ce.contractId, contentHash: ce.createArgument?.contentHash }));
    } catch (e: any) {
      return c.json({ docSha256, onChainHash: null, matches: false, note: `ledger read failed: ${e?.message ?? e}` });
    }

    if (contracts.length === 0) {
      return c.json({ docSha256, onChainHash: null, matches: false, note: 'not yet anchored' });
    }
    // Prefer the contract whose anchored hash equals the recomputed digest.
    const hit = contracts.find((k) => k.contentHash === docSha256) ?? contracts[contracts.length - 1]!;
    const matches = hit.contentHash === docSha256;
    return c.json({
      docSha256,
      onChainHash: hit.contentHash ?? null,
      matches,
      contractId: hit.contractId,
      note: matches
        ? `Hash matches on-chain anchor · contract ${hit.contractId}`
        : 'on-ledger anchor hash does not match the stored document',
    });
  });

  // ── static SPA (single deployable) ── registered LAST so API routes win ────────
  if (deps.staticRoot) {
    const root = deps.staticRoot;
    // Text types are gzipped on the fly (the SPA bundle is ~330KB -> ~97KB) and
    // everything gets a cache policy: hashed bundles are immutable, media caches
    // for an hour, html always revalidates — repeat opens hit the browser cache.
    const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map']);
    const serveFile = (c: any, filePath: string) => {
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      let data = new Uint8Array(readFileSync(filePath));
      const headers: Record<string, string> = {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control':
          ext === '.html'
            ? 'no-cache'
            : filePath.includes('/assets/')
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=3600',
      };
      if (COMPRESSIBLE.has(ext) && (c.req.header('accept-encoding') ?? '').includes('gzip')) {
        data = new Uint8Array(gzipSync(data));
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
      }
      return new Response(data as any, { status: 200, headers });
    };
    app.get('/*', (c) => {
      const pathname = decodeURIComponent(new URL(c.req.url).pathname);
      let candidate = normalize(join(root, pathname === '/' ? '/index.html' : pathname));
      // Directory URLs resolve to their index.html — this is how the pitch deck is
      // served at the clean /deck/ path (dist/deck/index.html, no .html in the URL).
      if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isDirectory()) {
        candidate = join(candidate, 'index.html');
      }
      if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
        return serveFile(c, candidate);
      }
      const index = join(root, 'index.html');
      if (existsSync(index)) return serveFile(c, index);
      return c.text('frontend build not found — run the Vite build (web/dist)', 404);
    });
  }

  // Boot seed: resume the live epoch from the ledger (a restart must not revert the demo
  // to M1), then anchor that epoch's independent valuation. Best-effort + idempotent —
  // never blocks boot.
  if (deps.seedOnBoot) {
    void (async () => {
      demoEpoch = await deriveEpoch();
      await seedValuation(demoEpoch);
    })().catch((err) => console.error('[boot] epoch derive/seed failed', err));
  }

  return app;
}
