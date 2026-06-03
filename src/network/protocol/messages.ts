import { z } from 'zod';
import type { RoomState } from '@/features/room/types';

export const PROTOCOL_VERSION = 1 as const;

/**
 * The fixed emoji palette for table reactions. Reactions ride Realtime
 * broadcast (not the authority), so the palette is enforced client-side on both
 * send and receive in `SupabaseSession` rather than in the Edge Function.
 */
export const REACTIONS = ['😂', '🔥', '😱', '👏', '😎', '💰', '😭', '🎉'] as const;

/**
 * Client → Host intentions. Clients only ever express what they *want*; the
 * host computes all outcomes. Every payload is validated with these schemas on
 * arrival, so a malformed or malicious message is dropped, never applied.
 */
export const intentionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('JOIN'), name: z.string().trim().min(1).max(20), spectator: z.boolean().optional() }),
  z.object({ type: z.literal('SET_READY'), ready: z.boolean() }),
  z.object({ type: z.literal('PLACE_BET'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('CLEAR_BET') }),
  z.object({ type: z.literal('START_ROUND') }),
  z.object({ type: z.literal('CLOSE_BETTING') }),
  z.object({ type: z.literal('NEXT_ROUND') }),
  z.object({ type: z.literal('BACK_TO_LOBBY') }),
  z.object({ type: z.literal('CHAT'), text: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal('PLAYER_SEED'), seed: z.string().regex(/^[0-9a-f]+$/i).min(8).max(128) }),
  z.object({
    type: z.literal('UPDATE_CONFIG'),
    config: z.object({
      mode: z.enum(['CAO_CAI', 'CAO_RUA']).optional(),
      minBet: z.number().int().positive().optional(),
      maxBet: z.number().int().positive().optional(),
      bettingSeconds: z.number().int().min(5).max(120).optional(),
      startingBalance: z.number().int().positive().optional(),
      baTienPayout: z.number().min(1).max(10).optional(),
      caoPayout: z.number().min(1).max(10).optional(),
      allowRebuy: z.boolean().optional(),
      maxPlayers: z.number().int().min(2).max(16).optional(),
    }),
  }),
  z.object({ type: z.literal('REQUEST_SNAPSHOT') }),
]);
export type Intention = z.infer<typeof intentionSchema>;

/** Host → Client messages. Typed; the `type` discriminator is checked on receipt. */
export type ServerMessage =
  | { v: 1; type: 'WELCOME'; playerId: string; roomId: string }
  | { v: 1; type: 'SNAPSHOT'; state: RoomState }
  | { v: 1; type: 'ERROR'; code: ServerErrorCode; reason: string }
  | { v: 1; type: 'CLOSED'; reason: string };

export type ServerErrorCode =
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'BET_REJECTED'
  | 'NOT_ALLOWED'
  | 'BAD_STATE'
  | 'VERSION_MISMATCH';
