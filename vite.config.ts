/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Served at the domain root by the Cloudflare Worker (Static Assets) → base '/'.
// BASE_PATH can still override it for a subpath host if ever needed.
const base = process.env.BASE_PATH ?? '/';

// The SPA is same-origin: it derives the API/WS URL from window.location, so it
// has no backend URL of its own. To run `npm run dev` (Vite + HMR) against a
// Worker, proxy /api (REST + the room/lobby WebSockets) to that Worker. Point it
// at a local `wrangler dev` (default) or the deployed Worker via WORKER_ORIGIN:
//   npm run cf:dev                       # terminal 1: Worker + DOs + local D1 (:8788)
//   npm run dev                          # terminal 2: Vite + HMR, proxying → :8788
//   WORKER_ORIGIN=https://beikao.<sub>.workers.dev npm run dev   # → the live Worker
const workerOrigin = process.env.WORKER_ORIGIN ?? 'http://127.0.0.1:8788';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    // `ws: true` upgrades the room/lobby WebSocket through the proxy too.
    proxy: {
      '/api': { target: workerOrigin, changeOrigin: true, ws: true, secure: false },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
});
