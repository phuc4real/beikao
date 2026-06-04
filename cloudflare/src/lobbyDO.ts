// Lobby Durable Object — a single well-known instance (idFromName('global'))
// that powers the live public room browser (cloudflare_migration_plan.md §2).
//
// It is a thin pub/sub PING relay, not a data store: Room DOs POST a notify on
// any directory-affecting change, and the Lobby fans a {t:'CHANGED'} frame out
// to every subscribed browser, which then re-fetches GET /api/rooms. This mirrors
// the Supabase subscribeDirectory pattern (the callback just triggers a re-fetch)
// while keeping the authoritative list in D1, queried on demand.

const PING = JSON.stringify({ t: 'CHANGED' });

export class LobbyDO {
  private readonly subscribers = new Set<WebSocket>();

  constructor(_state: DurableObjectState, _env: unknown) {
    // Stateless relay — nothing to hydrate.
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal notify from a Room DO → fan out a change ping to subscribers.
    if (request.method === 'POST' && url.pathname.endsWith('/notify')) {
      for (const ws of this.subscribers) {
        try {
          ws.send(PING);
        } catch {
          this.subscribers.delete(ws);
        }
      }
      return new Response(null, { status: 204 });
    }

    // Browser subscribes for live directory updates.
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      server.accept();
      this.subscribers.add(server);
      const drop = () => this.subscribers.delete(server);
      server.addEventListener('close', drop);
      server.addEventListener('error', drop);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Expected a WebSocket upgrade or notify', { status: 426 });
  }
}
