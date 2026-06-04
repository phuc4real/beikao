// Cloudflare room discovery — twin of network/supabase/rooms.ts (same signatures
// + DirectoryRoom shape). The list comes from D1 via GET /api/rooms; live updates
// come from the Lobby DO, which pings a {t:'CHANGED'} frame over /api/lobby
// whenever any room's directory row changes → the caller re-fetches (migration
// plan §2). Mirrors the Supabase subscribeDirectory(onChange) contract.

import { apiGet, wsBase } from './apiClient';

export interface DirectoryRoom {
  code: string;
  name: string | null;
  mode: 'CAO_CAI' | 'CAO_RUA';
  status: string;
  player_count: number;
  max_players: number;
  created_at: string;
}

/** Public, joinable rooms, freshest first. Empty on error. */
export async function fetchDirectory(): Promise<DirectoryRoom[]> {
  const res = await apiGet<{ ok: boolean; rooms: DirectoryRoom[] }>('/api/rooms');
  return res?.rooms ?? [];
}

/**
 * Subscribe to live directory changes over the Lobby DO socket; calls `onChange`
 * on every change ping (the caller re-fetches the filtered list). Auto-reconnects
 * with a short delay. Returns an unsubscribe function.
 */
export function subscribeDirectory(onChange: () => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = (): void => {
    if (closed) return;
    ws = new WebSocket(`${wsBase()}/api/lobby`);
    ws.addEventListener('message', () => onChange());
    ws.addEventListener('close', () => {
      if (!closed) retry = setTimeout(open, 2000);
    });
    ws.addEventListener('error', () => {
      try {
        ws?.close();
      } catch {
        /* will retry on close */
      }
    });
  };
  open();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    try {
      ws?.close();
    } catch {
      /* already closed */
    }
  };
}
