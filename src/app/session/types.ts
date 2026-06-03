import type { Intention, ServerMessage } from '@/network/protocol/messages';
import type { ReactionMsg, RoomState } from '@/features/room/types';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface SessionHooks {
  onState: (state: RoomState) => void;
  onServerMessage: (msg: ServerMessage) => void;
  onStatus: (status: ConnStatus, detail?: string) => void;
  /**
   * An ephemeral table reaction arrived (or was sent locally). Reactions ride
   * Realtime *broadcast* — not the authoritative state blob — so they never hit
   * the Edge Function or Postgres; they're transient, never persisted/replayed.
   */
  onReaction: (reaction: ReactionMsg) => void;
}

export interface Session {
  readonly isHost: boolean;
  /** This client's stable player id (known after WELCOME for clients). */
  getPlayerId(): string;
  /**
   * Send an intention to the authority. The returned promise resolves once the
   * server has responded (the state echo is applied via the `onState` hook), so
   * callers can show a pending state for the duration of the round trip.
   */
  send(intention: Intention): Promise<void>;
  /**
   * Send an ephemeral reaction over Realtime broadcast (fire-and-forget, no
   * server round trip). The sender is echoed locally via `onReaction`.
   */
  sendReaction(emoji: string): void;
  /** Tear down the connection / authority. */
  leave(): void;
}
