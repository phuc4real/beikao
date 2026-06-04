// Cloudflare WebSocket protocol — the single framing shared by the Room Durable
// Object (server) and CloudflareSession (client). One socket per room replaces
// three Supabase Realtime mechanisms (postgres_changes + presence + broadcast).
// See cloudflare_migration_plan.md §6.
//
// Lives in src/ so both sides import the SAME types: the DO imports it via the
// `@/` alias (wrangler bundles src/ directly), the client imports it normally.

import type { Intention, ServerMessage } from '@/network/protocol/messages';
import type { ReactionMsg, RoomConfig, RoomState } from '@/features/room/types';

/** Client → server frames (sent over the room WS). */
export type ClientFrame =
  /**
   * First frame on every connection. The DO verifies `token` (a signed uid),
   * then creates the room (role 'host', first connection) or JOINs an existing
   * one (idempotent — re-seats by the verified player id on reconnect).
   */
  | {
      t: 'HELLO';
      token: string;
      name: string;
      role: 'host' | 'client';
      spectator?: boolean;
      /** Host-only, create-time: initial config + discovery metadata. */
      config?: Partial<RoomConfig>;
      isPublic?: boolean;
      roomName?: string;
    }
  /** A game intention — re-validated by `intentionSchema` server-side. */
  | { t: 'INTENT'; intention: Intention }
  /** Ephemeral reaction — relayed to peers, never touches the authority. */
  | { t: 'REACTION'; emoji: string }
  /** Explicit in-app leave (permanent frees the seat); plain socket close = disconnect. */
  | { t: 'LEAVE'; permanent?: boolean };

/** Server → client frames. Maps onto the existing SessionHooks. */
export type ServerFrame =
  /** Latest authoritative state (replaces the postgres_changes payload) → onState. */
  | { t: 'STATE'; state: RoomState }
  /** A targeted ServerMessage (WELCOME/ERROR/SNAPSHOT/CLOSED) → onServerMessage. */
  | { t: 'SERVER'; msg: ServerMessage }
  /** A relayed table reaction (incl. the sender's own echo) → onReaction. */
  | { t: 'REACTION'; reaction: ReactionMsg };
