/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev: forward every custody-backend route (auth, action, per-party reads
      // proxy, registry, audit, ledger inspector) to the running custody spine.
      // The backend owns the /api prefix (it proxies to the ledger itself), so no
      // rewrite here.
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/auth': { target: 'http://localhost:8787', changeOrigin: true },
      '/action': { target: 'http://localhost:8787', changeOrigin: true },
      '/registry': { target: 'http://localhost:8787', changeOrigin: true },
      '/me': { target: 'http://localhost:8787', changeOrigin: true },
      '/audit': { target: 'http://localhost:8787', changeOrigin: true },
      '/ledger': { target: 'http://localhost:8787', changeOrigin: true },
      // Anchored documents: the manifest + byte-exact document serving + the
      // on-ledger sha256 verify endpoint (Valuation + Documents tabs).
      '/docs': { target: 'http://localhost:8787', changeOrigin: true },
      '/verify': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
