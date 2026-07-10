// app/proxy/src/worker.ts
//
// Single Cloudflare Worker that hosts the whole live product:
//  - `/api/*`  → strip the `/api` prefix, inject the privileged M2M bearer
//               (via TokenManager), and forward to the Canton 5N devnet JSON
//               Ledger API. Because this is same-origin with the app, the web
//               build's HttpLedgerClient('/api') works in prod unchanged.
//  - anything else → served from the static Vite build via the ASSETS binding
//               (SPA fallback configured in wrangler.jsonc).
//
// Only `proxy.ts` and `token.ts` are imported — never `server.ts`, which pulls
// in `node:http` and is Node-only. Both imported modules are plain fetch-based
// TS and run as-is under the Workers runtime.
import { TokenManager } from './token';
import { handleProxy } from './proxy';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  FN_AUTH_URL: string;
  FN_LEDGER_URL: string;
  // FN_SECRET is a Worker secret, injected at runtime — never logged or echoed.
  FN_SECRET: string;
}

// Module-scope singleton so the 8h token caches across requests in a warm
// isolate. Lazily built on first API request (env is only available then).
let tm: TokenManager | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // /api/v2/state/ledger-end → /v2/state/ledger-end (+ preserve query).
      const ledgerPath = url.pathname.slice('/api'.length) + url.search;
      const body = request.method === 'GET' ? '' : await request.text();

      tm ??= new TokenManager({ authUrl: env.FN_AUTH_URL, secret: env.FN_SECRET });

      const res = await handleProxy(
        { method: request.method, path: ledgerPath, body },
        { ledgerUrl: env.FN_LEDGER_URL, tm },
      );
      return new Response(res.body, { status: res.status, headers: res.headers });
    }

    // Static build (SPA fallback → index.html) handled by the assets binding.
    return env.ASSETS.fetch(request);
  },
};
