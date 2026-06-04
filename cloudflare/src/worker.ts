// Cloudflare Worker entrypoint (cloudflare_migration_plan.md §2, §9.1).
//
// One Worker, one origin: it serves the built SPA via the Static Assets binding
// AND handles every API/WS route, so browser + API + WebSocket are same-origin
// (no CORS, no VITE_* URL — the client derives everything from window.location).
//
// Routing order: API paths (/api/*) and the /api/room/:code WS upgrade are
// handled first; everything else falls through to env.ASSETS, which serves
// dist/ and returns index.html for unknown client routes (SPA fallback via
// not_found_handling = "single-page-application" in wrangler.toml).
//
// Phase C0 surface: /api/health, /api/auth/anon (token minting), and the WS echo
// (forwarded to the RoomDO). The wallet/rooms/profile endpoints + the real
// authority land in C1.

import { mintToken, newUid } from './auth';

export interface Env {
  /** Static Assets binding (the built dist/). */
  ASSETS: Fetcher;
  /** Room Durable Object namespace (one instance per room code). */
  ROOM: DurableObjectNamespace;
  /** HMAC secret for signing identity tokens (Worker secret, never in the repo). */
  AUTH_SIGNING_KEY?: string;
}

export { RoomDO } from './roomDO';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Dev fallback so `wrangler dev` works before AUTH_SIGNING_KEY is set. */
function signingKey(env: Env): string {
  return env.AUTH_SIGNING_KEY ?? 'dev-insecure-signing-key';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // ── WS upgrade: /api/room/:code → the room's Durable Object ──────────────
    if (pathname.startsWith('/api/room/')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const code = pathname.slice('/api/room/'.length).split('/')[0];
      if (!code) return json({ ok: false, error: 'Missing room code' }, 400);
      const id = env.ROOM.idFromName(code);
      return env.ROOM.get(id).fetch(request);
    }

    // ── REST API ─────────────────────────────────────────────────────────────
    if (pathname === '/api/health') {
      return json({ ok: true, ts: Date.now() });
    }

    if (pathname === '/api/auth/anon' && request.method === 'POST') {
      const uid = newUid();
      const token = await mintToken(uid, signingKey(env), Date.now());
      return json({ ok: true, uid, token });
    }

    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Not found' }, 404);
    }

    // ── Static SPA (and index.html SPA fallback) ─────────────────────────────
    return env.ASSETS.fetch(request);
  },
};
