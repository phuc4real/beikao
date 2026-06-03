import Peer, { type DataConnection } from 'peerjs';
import {
  isServerMessage,
  makeIntention,
  type Intention,
} from '@/network/protocol/messages';
import { getPeerOptions } from '@/network/peer/iceConfig';
import { peerIdForRoom } from '@/utils/id';
import type { Session, SessionHooks } from './types';

/**
 * Client side: connects to the host, sends intentions (sequence-numbered for
 * idempotency), and forwards server messages to the hooks. It never mutates
 * game state locally — the host's SNAPSHOT is the source of truth.
 */
const CONNECT_TIMEOUT_MS = 20000;

export class ClientSession implements Session {
  readonly isHost = false;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private seq = 0;
  private disposed = false;
  private connected = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly roomId: string,
    private playerId: string,
    private readonly name: string,
    private readonly spectator: boolean,
    private readonly hooks: SessionHooks,
  ) {
    this.hooks.onStatus('connecting');

    // If the data channel never opens (broker down, or NAT with no working TURN),
    // PeerJS often just hangs — surface an actionable error instead.
    this.connectTimer = setTimeout(() => {
      if (this.disposed || this.connected) return;
      this.hooks.onStatus(
        'error',
        'Không kết nối được tới phòng. Kiểm tra mã phòng, hoặc mạng chặn WebRTC (cần TURN).',
      );
    }, CONNECT_TIMEOUT_MS);

    void this.init();
  }

  /** Fetch ICE servers (incl. live TURN credentials) then open the peer. */
  private async init(): Promise<void> {
    const options = await getPeerOptions();
    if (this.disposed) return;
    const peer = new Peer(options);
    this.peer = peer;

    peer.on('open', () => {
      if (this.disposed) return;
      const conn = peer.connect(peerIdForRoom(this.roomId), {
        reliable: true,
        metadata: { playerId: this.playerId, name: this.name, spectator: this.spectator },
      });
      this.conn = conn;
      conn.on('open', () => {
        this.connected = true;
        this.clearConnectTimer();
        this.hooks.onStatus('connected');
      });
      conn.on('data', (raw) => this.handleData(raw));
      conn.on('close', () => {
        if (!this.disposed) this.hooks.onStatus('closed', 'Mất kết nối với cái');
      });
      conn.on('error', () => {
        if (!this.disposed) this.hooks.onStatus('error', 'Lỗi kết nối');
      });
    });

    peer.on('error', (err) => {
      if (this.disposed) return;
      this.clearConnectTimer();
      const notFound = err.type === 'peer-unavailable';
      this.hooks.onStatus(
        'error',
        notFound ? 'Không tìm thấy phòng (sai mã hoặc cái đã rời)' : `Lỗi kết nối: ${err.type}`,
      );
    });
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  getPlayerId(): string {
    return this.playerId;
  }

  send(intention: Intention): void {
    if (this.conn?.open) {
      this.conn.send(makeIntention(this.seq++, intention));
    }
  }

  leave(): void {
    this.disposed = true;
    this.clearConnectTimer();
    this.conn?.close();
    this.peer?.destroy();
  }

  private handleData(raw: unknown): void {
    if (!isServerMessage(raw)) return;
    switch (raw.type) {
      case 'WELCOME':
        this.playerId = raw.playerId;
        this.hooks.onServerMessage(raw);
        break;
      case 'SNAPSHOT':
        this.hooks.onState(raw.state);
        break;
      case 'ERROR':
        this.hooks.onServerMessage(raw);
        break;
      case 'CLOSED':
        this.hooks.onServerMessage(raw);
        this.hooks.onStatus('closed', raw.reason);
        break;
    }
  }
}
