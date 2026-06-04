// Phase C0 RoomDO — a THROWAWAY stub (cloudflare_migration_plan.md, appendix §3).
//
// One Durable Object instance per room code (idFromName(code)). For C0 it does
// nothing game-related: it accepts a WebSocket and echoes each message back with
// a server timestamp, so we can measure WS round-trip latency against the ~1.3s
// Supabase baseline (the decision gate for the rest of the migration, §C0).
//
// In C1 this becomes the real room actor: GameAuthority + the live socket set +
// a betting-deadline Alarm + DO-storage persistence. Kept deliberately minimal
// here so the import/build/deploy pipeline can be proven end-to-end first.

import type { Env } from './worker';

export class RoomDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    server.addEventListener('message', (event) => {
      // Echo with a server timestamp so the client can compute round-trip latency.
      // The client sends e.g. {clientTs}; we bounce it back annotated.
      let clientTs: number | null = null;
      try {
        const parsed = JSON.parse(typeof event.data === 'string' ? event.data : '');
        if (parsed && typeof parsed.clientTs === 'number') clientTs = parsed.clientTs;
      } catch {
        /* non-JSON ping — still echo */
      }
      server.send(
        JSON.stringify({
          type: 'ECHO',
          roomId: this.state.id.toString(),
          clientTs,
          serverTs: Date.now(),
        }),
      );
    });

    server.addEventListener('close', () => {
      // C0 stub: nothing to clean up. (C1: auth.disconnect + empty-room alarm.)
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
