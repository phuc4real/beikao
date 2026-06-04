import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/store/store';
import { ANIM } from '@/config/animation';
import type { ChatMessage } from '@/features/room/types';

const POPUP_MS = ANIM.chatPopupMs; // how long a popup bubble lingers
const POPUP_MAX = 3; // visible bubbles at once

/** Messages of `chat` strictly after the one with id `afterId` (all if not found). */
function messagesAfter(chat: ChatMessage[], afterId: string | null): ChatMessage[] {
  if (afterId === null) return chat;
  const idx = chat.findIndex((m) => m.id === afterId);
  return idx === -1 ? chat : chat.slice(idx + 1);
}

/**
 * Track chat while the drawer is closed: `popups` are fresh messages from
 * others, each lingering a few seconds; `unread` counts everything missed
 * since the drawer was last open (for the toggle badge). Both reset on open.
 * Tracks message *ids*, not lengths — `room.chat` is capped, so the array can
 * roll over without its length changing.
 */
export function useChatPopups(open: boolean): { popups: ChatMessage[]; unread: number } {
  const chat = useGame((s) => s.room?.chat ?? []);
  const myId = useGame((s) => s.me?.playerId);
  const [popups, setPopups] = useState<ChatMessage[]>([]);
  // Seed both cursors to the current tail so joining never replays history.
  const seenRef = useRef<string | null>(chat.at(-1)?.id ?? null);
  const poppedRef = useRef<string | null>(seenRef.current);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Drawer open = everything is seen; no bubbles needed.
  useEffect(() => {
    if (!open) return;
    seenRef.current = chat.at(-1)?.id ?? null;
    poppedRef.current = seenRef.current;
    setPopups([]);
  }, [open, chat]);

  // Drawer closed: bubble up each new message from someone else.
  useEffect(() => {
    if (open || chat.length === 0) return;
    const fresh = messagesAfter(chat, poppedRef.current).filter((m) => m.playerId !== myId);
    poppedRef.current = chat.at(-1)!.id;
    if (fresh.length === 0) return;
    setPopups((p) => [...p, ...fresh].slice(-POPUP_MAX));
    const freshIds = new Set(fresh.map((m) => m.id));
    timersRef.current.push(
      setTimeout(() => setPopups((p) => p.filter((m) => !freshIds.has(m.id))), POPUP_MS),
    );
  }, [chat, open, myId]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const unread = open ? 0 : messagesAfter(chat, seenRef.current).filter((m) => m.playerId !== myId).length;
  return { popups, unread };
}
