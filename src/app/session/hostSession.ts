import Peer, { type DataConnection } from 'peerjs';
import { GameAuthority } from '@/features/room/authority';
import type { RoomConfig, RoomState } from '@/features/room/types';
import {
  intentionEnvelopeSchema,
  PROTOCOL_VERSION,
  type ServerMessage,
} from '@/network/protocol/messages';
import { getPeerOptions } from '@/network/peer/iceConfig';
import { peerIdForRoom } from '@/utils/id';
import { deepClone } from '@/utils/clone';
import type { Session, SessionHooks } from './types';

interface ConnMeta {
  playerId: string;
  name: string;
  spectator?: boolean;
}

/**
 * Host side: owns the PeerJS broker connection, the GameAuthority, and the
 * connection registry. The host's own UI talks to the authority via direct
 * loopback (`send`), and the authority's broadcasts are delivered both to all
 * peers and to the host's own state hook — so the host is just another player.
 */
export class HostSession implements Session {
  readonly isHost = true;
  private peer: Peer | null = null;
  private readonly authority: GameAuthority;
  private readonly conns = new Map<string, DataConnection>(); // playerId → conn
  private disposed = false;
  private opened = false;
  private openTimer: ReturnType<typeof setTimeout> | null = null;

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

    // If the broker never registers the host, surface an error rather than hang.
    this.openTimer = setTimeout(() => {
      if (!this.disposed && !this.opened) {
        this.hooks.onStatus('error', 'Không tạo được phòng (không kết nối được máy chủ tín hiệu). Thử lại.');
      }
    }, 15000);

    void this.init();
  }

  /** Fetch ICE servers (incl. live TURN credentials) then open the host peer. */
  private async init(): Promise<void> {
    const options = await getPeerOptions();
    if (this.disposed) return;
    const peer = new Peer(peerIdForRoom(this.roomId), options);
    this.peer = peer;

    peer.on('open', () => {
      if (this.disposed) return;
      this.opened = true;
      this.clearOpenTimer();
      this.hooks.onStatus('connected');
      this.hooks.onState(deepClone(this.authority.getState()));
    });
    peer.on('connection', (conn) => this.registerConnection(conn));
    peer.on('error', (err) => {
      const taken = err.type === 'unavailable-id';
      // Non-fatal post-open errors (e.g. a transient peer issue) shouldn't nuke a live room.
      if (this.opened && !taken) return;
      this.clearOpenTimer();
      this.hooks.onStatus('error', taken ? 'Mã phòng đã được dùng, thử lại' : `Lỗi máy chủ tín hiệu: ${err.type}`);
    });
  }

  private clearOpenTimer(): void {
    if (this.openTimer) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
  }

  getPlayerId(): string {
    return this.playerId;
  }

  send(intention: Parameters<Session['send']>[0]): void {
    this.authority.submit(this.playerId, intention);
  }

  leave(): void {
    this.disposed = true;
    this.clearOpenTimer();
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
    this.peer?.destroy();
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
      this.authority.join(pid, meta.name ?? 'Người chơi', meta.spectator);
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
