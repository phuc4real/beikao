import Peer, { type DataConnection } from 'peerjs';
import { GameAuthority } from '@/features/room/authority';
import type { RoomConfig, RoomState } from '@/features/room/types';
import {
  intentionEnvelopeSchema,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '@/network/protocol/messages';
import { peerOptions } from '@/network/peer/iceConfig';
import { peerIdForRoom } from '@/utils/id';
import { deepClone } from '@/utils/clone';
import type { Session, SessionHooks } from './types';

interface ConnMeta {
  playerId: string;
  name: string;
}

/**
 * Host side: owns the PeerJS broker connection, the GameAuthority, and the
 * connection registry. The host's own UI talks to the authority via direct
 * loopback (`send`), and the authority's broadcasts are delivered both to all
 * peers and to the host's own state hook — so the host is just another player.
 */
export class HostSession implements Session {
  readonly isHost = true;
  private readonly peer: Peer;
  private readonly authority: GameAuthority;
  private readonly conns = new Map<string, DataConnection>(); // playerId → conn
  private disposed = false;

  constructor(
    private readonly roomId: string,
    private readonly playerId: string,
    name: string,
    config: Partial<RoomConfig>,
    private readonly hooks: SessionHooks,
  ) {
    this.authority = new GameAuthority({
      roomId,
      hostId: playerId,
      hostName: name,
      config,
      callbacks: {
        broadcast: (state) => this.broadcast(state),
        sendTo: (pid, msg) => this.sendTo(pid, msg),
      },
    });

    this.peer = new Peer(peerIdForRoom(roomId), peerOptions());
    this.peer.on('open', () => {
      if (this.disposed) return;
      this.hooks.onStatus('connected');
      this.hooks.onState(deepClone(this.authority.getState()));
    });
    this.peer.on('connection', (conn) => this.registerConnection(conn));
    this.peer.on('error', (err) => {
      const taken = err.type === 'unavailable-id';
      this.hooks.onStatus('error', taken ? 'Mã phòng đã được dùng, thử lại' : err.message);
    });
  }

  getPlayerId(): string {
    return this.playerId;
  }

  send(intention: Parameters<Session['send']>[0]): void {
    this.authority.submit(this.playerId, intention);
  }

  leave(): void {
    this.disposed = true;
    for (const conn of this.conns.values()) {
      try {
        conn.send({ v: PROTOCOL_VERSION, type: 'CLOSED', reason: 'Cái đã đóng phòng' } satisfies ServerMessage);
      } catch {
        /* ignore */
      }
      conn.close();
    }
    this.conns.clear();
    this.authority.dispose();
    this.peer.destroy();
  }

  // ── connection registry ────────────────────────────────────────────────

  private registerConnection(conn: DataConnection): void {
    const meta = conn.metadata as ConnMeta | undefined;
    const pid = meta?.playerId;
    if (!pid) {
      conn.close();
      return;
    }

    conn.on('open', () => {
      if (this.disposed) {
        conn.close();
        return;
      }
      this.conns.set(pid, conn);
      conn.send({ v: PROTOCOL_VERSION, type: 'WELCOME', playerId: pid, roomId: this.roomId } satisfies ServerMessage);
      this.authority.join(pid, meta.name ?? 'Người chơi');
    });

    conn.on('data', (raw) => {
      const parsed = intentionEnvelopeSchema.safeParse(raw);
      if (!parsed.success) return; // drop malformed / wrong-version messages
      this.authority.submit(pid, parsed.data.payload);
    });

    const drop = () => {
      this.conns.delete(pid);
      this.authority.disconnect(pid);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  private broadcast(state: RoomState): void {
    const msg: ServerMessage = { v: PROTOCOL_VERSION, type: 'SNAPSHOT', state };
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(msg);
    }
    this.hooks.onState(deepClone(state)); // host loopback — fresh ref so the store re-renders
  }

  private sendTo(playerId: string, msg: ServerMessage): void {
    if (playerId === this.playerId) {
      this.hooks.onServerMessage(msg); // host loopback
      return;
    }
    const conn = this.conns.get(playerId);
    if (conn?.open) conn.send(msg);
  }
}
