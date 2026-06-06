import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.config runs in Node; declare just what we read so we don't need @types/node here.
declare const process: { env: Record<string, string | undefined> };

// Where to proxy /api in dev. Defaults to the local server; override with VITE_API_TARGET.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3001';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    // Same-origin proxy in dev: `/api/*` → the Fastify server. Because it's same-origin,
    // the httpOnly session cookie rides automatically (no CORS). Prod should serve the
    // built client same-origin with the API (static-serve or a reverse proxy).
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
