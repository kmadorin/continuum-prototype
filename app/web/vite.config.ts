/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Browser calls to /api/* forward to the running reverse-proxy (which
      // injects the M2M token), stripping the /api prefix.
      '/api': { target: 'http://localhost:8788', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
