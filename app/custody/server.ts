// app/custody/server.ts
// Boots the custody spine: loads gitignored custody-keys.json into tenants, holds ONE
// M2M transport token + a WalletClient pointed at the devnet ledger, and serves the API
// plus the static Vite build as a single deployable.
//
// Run: cd app && node --experimental-strip-types --env-file=.env custody/server.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { HttpLedgerClient } from '../ledger-client/src/client';
import { WalletClient } from '../ledger-client/src/wallet';
import { TokenManager } from '../proxy/src/token';
import { loadTenants } from './tenants';
import { createApp, type AuditEntry } from './app';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const SCRATCH =
  '/private/tmp/claude-501/-Users-kirillmadorin-Projects-hackathons-canton/0827f303-84e0-4d70-ad1e-817b0a1a48de/scratchpad';

const LEDGER = process.env.FN_LEDGER_URL ?? 'https://ledger-api.validator.devnet.sandbox.fivenorth.io';
const AUTH = process.env.FN_AUTH_URL ?? 'https://auth.sandbox.fivenorth.io/application/o/token/';
const PORT = Number(process.env.PORT ?? 8787);

function m2mSecret(): string {
  if (process.env.FN_SECRET) return process.env.FN_SECRET;
  try {
    return readFileSync(`${SCRATCH}/.fn_secret`, 'utf8').trim();
  } catch {
    throw new Error('M2M secret missing: set FN_SECRET (app/.env) or provide scratchpad/.fn_secret');
  }
}

// Session HMAC secret: from env in prod; a per-process random default for the demo.
function sessionSecret(): string {
  return process.env.CUSTODY_SESSION_SECRET ?? `continuum-demo-${process.pid}-${Date.now()}`;
}

function main() {
  const tenants = loadTenants(resolve(APP_DIR, 'custody-keys.json'));
  // Synchronizer id: from env in prod (no file needed); fall back to party-registry.json for local dev.
  let synchronizerId = process.env.SYNCHRONIZER_ID;
  if (!synchronizerId) {
    try {
      synchronizerId = JSON.parse(readFileSync(resolve(APP_DIR, 'party-registry.json'), 'utf8')).synchronizerId;
    } catch {
      throw new Error('synchronizer id missing: set SYNCHRONIZER_ID or provide app/party-registry.json');
    }
  }

  const tokenManager = new TokenManager({ authUrl: AUTH, secret: m2mSecret() });
  // Transport auth-fetch: inject the M2M Bearer + a timeout guard (anti-hang).
  const authFetch: typeof fetch = (async (url: any, init: any = {}) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25_000);
    try {
      const token = await tokenManager.get();
      return await fetch(url, {
        ...init,
        signal: ctl.signal,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      });
    } finally {
      clearTimeout(t);
    }
  }) as unknown as typeof fetch;

  const reads = new HttpLedgerClient(LEDGER, authFetch);
  const wallet = new WalletClient(LEDGER, reads, authFetch, synchronizerId);

  const audit: AuditEntry[] = [];
  const app = createApp({
    tenants,
    signer: wallet,
    sessionSecret: sessionSecret(),
    ledgerBase: LEDGER,
    token: () => tokenManager.get(),
    // Proxy sets its own Authorization header, so use a plain fetch here.
    fetchImpl: globalThis.fetch.bind(globalThis),
    audit,
    staticRoot: resolve(APP_DIR, 'web/dist'),
    secureCookie: process.env.NODE_ENV === 'production',
  });

  console.log(`custody spine: ${tenants.all.length} tenants loaded (${tenants.all.map((t) => t.role).join(', ')})`);
  console.log(`ledger: ${LEDGER}`);
  console.log(`synchronizer: ${synchronizerId}`);
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`custody backend listening on http://localhost:${info.port}`);
  });
}

main();
