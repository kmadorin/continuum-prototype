// Vite plugin — mounts the sandbox spine into the dev server, so `npm run dev:sandbox`
// is a single process with no devnet, no secrets and no shared state to corrupt.
//
// Only the backend's own routes are intercepted; everything else falls through to Vite
// (the SPA, HMR, assets). State lives in the dev-server process: a page reload keeps the
// deal, a dev-server restart starts a clean world, and the landing page's "Reset demo"
// (POST /demo/reset) bumps the epoch exactly as it does in production.
import { getRequestListener } from '@hono/node-server';
import type { Plugin } from 'vite';
import { createSandbox } from './spine';

/** Routes the custody spine owns. Anything else is Vite's. */
const BACKEND = ['/auth', '/me', '/action', '/audit', '/registry', '/api', '/docs', '/verify', '/demo', '/ledger'];

export function sandbox(): Plugin {
  return {
    name: 'continuum-sandbox',
    apply: 'serve',
    configureServer(server) {
      const { app } = createSandbox();
      const handler = getRequestListener(app.fetch);
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!;
        if (!BACKEND.some((p) => path === p || path.startsWith(`${p}/`))) return next();
        handler(req, res);
      });
      server.config.logger.info(
        '\n  \x1b[36m➜\x1b[0m  \x1b[1mSandbox\x1b[0m: in-memory ledger · no devnet · logins <role>/<role>-demo\n',
      );
    },
  };
}
