import Peer, { type DataConnection } from 'peerjs';
import {
  isServerMessage,
  makeIntention,
  type Intention,
} from '@/network/protocol/messages';
import { peerOptions } from '@/network/peer/iceConfig';
import { peerIdForRoom } from '@/utils/id';
import type { Session, SessionHooks } from './types';

/**
 * Client side: connects to the host, sends intentions (sequence-numbered for
 * idempotency), and forwards server messages to the hooks. It never mutates
 * game state locally — the host's SNAPSHOT is the source of truth.
 */
export class ClientSession implements Session {
  readonly isHost = false;
  private readonly peer: Peer;
  private conn: DataConnection | null = null;
  private seq = 0;
  private disposed = false;

  constructor(
    roomId: string,
    private playerId: string,
    name: string,
    spectator: boolean,
    private readonly hooks: SessionHooks,
  ) {
    this.hooks.onStatus('connecting');
    this.peer = new Peer(peerOptions());

    this.peer.on('open', () => {
      if (this.disposed) return;
      const conn = this.peer.connect(peerIdForRoom(roomId), {
        reliable: true,
        metadata: { playerId, name, spectator },
      });
      this.conn = conn;
      conn.on('open', () => this.hooks.onStatus('connected'));
      conn.on('data', (raw) => this.handleData(raw));
      conn.on('close', () => {
        if (!this.disposed) this.hooks.onStatus('closed', 'Mất kết nối với cái');
      });
      conn.on('error', () => {
        if (!this.disposed) this.hooks.onStatus('error', 'Lỗi kết nối');
      });
    });

    this.peer.on('error', (err) => {
      if (this.disposed) return;
      const notFound = err.type === 'peer-unavailable';
      this.hooks.onStatus('error', notFound ? 'Không tìm thấy phòng' : err.message);
    });
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
    this.conn?.close();
    this.peer.destroy();
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
