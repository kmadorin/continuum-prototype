/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sandbox } from './sandbox/plugin'

// Two ways to run the UI without devnet secrets:
//
//   npm run dev:sandbox   SANDBOX=1 — the custody spine runs INSIDE the dev server over an
//                         in-memory ledger. No devnet, no keys, nothing shared: click the
//                         deal to Closed, reload, start over. This is the default for UI work.
//   npm run dev           Proxy every backend route to a real custody spine. Defaults to the
//                         deployed one (live devnet data, but actions write to the SHARED demo
//                         deal); point it at a local spine with CUSTODY_URL=http://localhost:8787.
const SANDBOX = process.env.SANDBOX === '1'
const CUSTODY = process.env.CUSTODY_URL ?? 'https://continuum-custody.fly.dev'
const backend = { target: CUSTODY, changeOrigin: true }

// The backend owns the /api prefix (it proxies to the ledger itself), so no rewrite here.
// /docs + /verify are the anchored documents: the manifest, byte-exact serving, and the
// on-ledger sha256 check (Valuation + Documents tabs).
const ROUTES = ['/api', '/auth', '/action', '/registry', '/me', '/audit', '/ledger', '/docs', '/verify']

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(SANDBOX ? [sandbox()] : [])],
  server: {
    // In sandbox mode the spine is middleware in this process — proxying would send the
    // requests back out to the network, so there is nothing to proxy.
    proxy: SANDBOX ? undefined : Object.fromEntries(ROUTES.map((r) => [r, backend])),
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
