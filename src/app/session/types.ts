import type { Intention, ServerMessage } from '@/network/protocol/messages';
import type { RoomState } from '@/features/room/types';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface SessionHooks {
  onState: (state: RoomState) => void;
  onServerMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnStatus, detail?: string) => void;
}

export interface Session {
  readonly isHost: boolean;
  /** This client's stable player id (known after WELCOME for clients). */
  getPlayerId(): string;
  /** Send an intention to the authority (loopback for the host). */
  send(intention: Intention): void;
  /** Tear down the connection / authority. */
  leave(): void;
}
