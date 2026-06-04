// Cloudflare Worker entrypoint (cloudflare_migration_plan.md §2, §9.1).
//
// One Worker, one origin: it serves the built SPA via the Static Assets binding
// AND handles every API/WS route, so browser + API + WebSocket are same-origin
// (no CORS, no VITE_* URL — the client derives everything from window.location).
//
// Routing order: API paths (/api/*) and the WS upgrades (/api/room/:code,
// /api/lobby) are handled first; everything else falls through to env.ASSETS,
// which serves dist/ and returns index.html for unknown client routes (SPA
// fallback via not_found_handling = "single-page-application" in wrangler.toml).

import { mintToken, newUid, signingKey, verifyToken } from './auth';
import { claimDailyGift, claimTopup, fetchWallet, listDirectory } from './d1';

export interface Env {
  /** Static Assets binding (the built dist/). */
  ASSETS: Fetcher;
  /** Room Durable Object namespace (one instance per room code). */
  ROOM: DurableObjectNamespace;
  /** Lobby Durable Object namespace (a single 'global' instance, live room browser). */
  LOBBY: DurableObjectNamespace;
  /** Cross-room durable data: profiles + room directory. */
  DB: D1Database;
  /** HMAC secret for signing identity tokens (Worker secret, never in the repo). */
  AUTH_SIGNING_KEY?: string;
}

export { RoomDO } from './roomDO';
export { LobbyDO } from './lobbyDO';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** The verified player id from an `Authorization: Bearer <token>` header, or null. */
async function verifiedUid(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  const payload = await verifyToken(token, signingKey(env.AUTH_SIGNING_KEY));
  return payload?.uid ?? null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // ── WS upgrade: /api/room/:code → the room's Durable Object ────────────────
    if (pathname.startsWith('/api/room/')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const code = pathname.slice('/api/room/'.length).split('/')[0];
      if (!code) return json({ ok: false, error: 'Missing room code' }, 400);
      const id = env.ROOM.idFromName(code);
      return env.ROOM.get(id).fetch(request);
    }

    // ── WS upgrade: /api/lobby → the Lobby DO (live room-browser change pings) ──
    if (pathname === '/api/lobby') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const id = env.LOBBY.idFromName('global');
      return env.LOBBY.get(id).fetch(request);
    }

    // ── REST API ───────────────────────────────────────────────────────────────
    if (pathname === '/api/health') {
      return json({ ok: true, ts: Date.now() });
    }

    // Mint an anonymous identity (signed uid token). Stored client-side, presented
    // on the WS HELLO and the wallet endpoints — the verified uid can't be spoofed.
    if (pathname === '/api/auth/anon' && request.method === 'POST') {
      const uid = newUid();
      const token = await mintToken(uid, signingKey(env.AUTH_SIGNING_KEY), Date.now());
      return json({ ok: true, uid, token });
    }

    // Live public room browser (polled; the Lobby DO pings clients to re-fetch).
    if (pathname === '/api/rooms' && request.method === 'GET') {
      return json({ ok: true, rooms: await listDirectory(env.DB) });
    }

    // Wallet read (public — balance isn't secret), e.g. /api/wallet/<uid>.
    if (pathname.startsWith('/api/wallet/') && request.method === 'GET') {
      const id = decodeURIComponent(pathname.slice('/api/wallet/'.length).split('/')[0] ?? '');
      if (!id) return json({ ok: false, error: 'Missing id' }, 400);
      return json({ ok: true, wallet: await fetchWallet(env.DB, id) });
    }

    // Wallet credits — keyed to the VERIFIED token uid, never a client-claimed id.
    if (pathname === '/api/wallet/topup' && request.method === 'POST') {
      const uid = await verifiedUid(request, env);
      if (!uid) return json({ ok: false, error: 'Chưa đăng nhập' }, 401);
      return json({ ok: true, balance: await claimTopup(env.DB, uid) });
    }
    if (pathname === '/api/wallet/daily' && request.method === 'POST') {
      const uid = await verifiedUid(request, env);
      if (!uid) return json({ ok: false, error: 'Chưa đăng nhập' }, 401);
      return json({ ok: true, balance: await claimDailyGift(env.DB, uid, Date.now()) });
    }

    if (pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'Not found' }, 404);
    }

    // ── Static SPA (and index.html SPA fallback) ───────────────────────────────
    return env.ASSETS.fetch(request);
  },
};
