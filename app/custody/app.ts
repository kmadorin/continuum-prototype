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
import { getCookie, setCookie } from 'hono/cookie';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { JsCommand } from '../ledger-client/src/types';
import type { Ed25519Key } from '../ledger-client/src/ed25519';
import { SESSION_COOKIE, signSession, verifySession, type SessionData } from './session';
import type { TenantStore } from './tenants';

/** Minimal slice of WalletClient the spine needs (so tests can mock it). */
export interface Signer {
  submitSigned(
    party: string,
    key: Ed25519Key,
    fingerprint: string,
    commands: JsCommand[],
  ): Promise<{ updateId?: string }>;
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
  /** Mark the session cookie Secure (set true behind HTTPS in prod). */
  secureCookie?: boolean;
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
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const audit = deps.audit ?? [];

  const session = (c: any): SessionData | null =>
    verifySession(getCookie(c, SESSION_COOKIE), deps.sessionSecret);

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
    setCookie(c, SESSION_COOKIE, signSession(data, deps.sessionSecret), {
      httpOnly: true,
      sameSite: 'Lax',
      secure: !!deps.secureCookie,
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return c.json({ role: tenant.role, party: tenant.party, custodianName: tenant.custodianName });
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

  // ── GET /registry ── PUBLIC party ids + custodian names (no keys, no session) ──
  // The frontend needs every party id (the deal room references buyer/lpExiting/…),
  // and party ids are public. Key material is never included.
  app.get('/registry', (c) => {
    const parties: Record<string, string> = {};
    const custodians: Record<string, string> = {};
    for (const t of deps.tenants.byParty.values()) {
      parties[t.role] = t.party;
      custodians[t.role] = t.custodianName;
    }
    return c.json({ parties, custodians });
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

  // ── static SPA (single deployable) ── registered LAST so API routes win ────────
  if (deps.staticRoot) {
    const root = deps.staticRoot;
    const serveFile = (_c: any, filePath: string) => {
      const ext = filePath.slice(filePath.lastIndexOf('.'));
      const data = new Uint8Array(readFileSync(filePath));
      return new Response(data as any, {
        status: 200,
        headers: { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' },
      });
    };
    app.get('/*', (c) => {
      const pathname = decodeURIComponent(new URL(c.req.url).pathname);
      const candidate = normalize(join(root, pathname === '/' ? '/index.html' : pathname));
      if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
        return serveFile(c, candidate);
      }
      const index = join(root, 'index.html');
      if (existsSync(index)) return serveFile(c, index);
      return c.text('frontend build not found — run the Vite build (web/dist)', 404);
    });
  }

  return app;
}
