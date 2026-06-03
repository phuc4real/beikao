import type { PeerJSOption } from 'peerjs';

/**
 * ICE servers for WebRTC. Resolution order:
 *   1. An explicit TURN server via env (VITE_TURN_URL/USERNAME/CREDENTIAL).
 *   2. Live credentials fetched from Metered's REST API (default).
 *   3. A static fallback (Google STUN + OpenRelay free TURN) if the fetch fails.
 *
 * The Metered API key is used client-side by design — it only fetches
 * short-lived TURN credentials. Override the key/URL via env if needed.
 */

const METERED_URL =
  import.meta.env.VITE_METERED_URL ?? 'https://beikao.metered.live/api/v1/turn/credentials';
const METERED_API_KEY =
  import.meta.env.VITE_METERED_API_KEY ?? 'abbf13192fb0806dd1651f2307c48e665818';

const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const STATIC_FALLBACK: RTCIceServer[] = [
  ...STUN,
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

let cached: Promise<PeerJSOption> | null = null;

/** Resolve PeerJS options (with ICE servers). Cached for the tab session. */
export function getPeerOptions(): Promise<PeerJSOption> {
  if (!cached) cached = resolveIceServers().then((iceServers) => ({ config: { iceServers } }));
  return cached;
}

async function resolveIceServers(): Promise<RTCIceServer[]> {
  // 1. Manual override.
  const envUrl = import.meta.env.VITE_TURN_URL;
  if (envUrl) {
    return [
      ...STUN,
      {
        urls: envUrl,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      },
    ];
  }

  // 2. Metered REST API — returns a ready-to-use iceServers array (STUN + TURN).
  try {
    const res = await fetch(`${METERED_URL}?apiKey=${METERED_API_KEY}`);
    if (res.ok) {
      const servers = (await res.json()) as RTCIceServer[];
      if (Array.isArray(servers) && servers.length > 0) return servers;
    }
  } catch {
    /* fall through to static fallback */
  }

  // 3. Fallback.
  return STATIC_FALLBACK;
}
