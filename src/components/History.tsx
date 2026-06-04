import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/store/store';
import { Panel } from '@/components/ui';
import { TableCard } from '@/components/TableCard';
import { FairnessBadge } from '@/components/FairnessBadge';
import { handLabel } from '@/components/handLabel';
import { loadRounds, saveRounds } from '@/features/history/db';
import type { RoundView } from '@/features/room/types';

/**
 * Merge the live (snapshot) history with rounds persisted in IndexedDB, so the
 * log survives reloads and accumulates beyond the host's in-memory cap. Saves
 * only when a newer round appears, and degrades to live-only if storage fails.
 */
function usePersistentHistory(roomId: string, live: RoundView[]): RoundView[] {
  const [persisted, setPersisted] = useState<RoundView[]>([]);
  const lastSaved = useRef(0);

  useEffect(() => {
    let cancelled = false;
    lastSaved.current = 0;
    setPersisted([]);
    loadRounds(roomId).then((r) => {
      if (!cancelled) setPersisted(r);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useEffect(() => {
    const maxNum = live.reduce((m, r) => Math.max(m, r.roundNumber), 0);
    if (maxNum > lastSaved.current) {
      lastSaved.current = maxNum;
      void saveRounds(roomId, live);
    }
  }, [roomId, live]);

  const byNumber = new Map<number, RoundView>();
  for (const r of persisted) byNumber.set(r.roundNumber, r);
  for (const r of live) byNumber.set(r.roundNumber, r); // live wins on conflict
  return [...byNumber.values()].sort((a, b) => b.roundNumber - a.roundNumber);
}

export function HistoryPanel() {
  const roomId = useGame((s) => s.room?.id ?? '');
  const live = useGame((s) => s.room?.history ?? []);
  const history = usePersistentHistory(roomId, live);
  const [replay, setReplay] = useState<RoundView | null>(null);

  if (history.length === 0) return null;

  return (
    <Panel className="space-y-2">
      <div className="text-xs uppercase tracking-widest text-gold/70">Lịch sử</div>
      <div className="flex flex-wrap gap-1.5">
        {history.map((r) => (
          <button
            key={r.roundNumber}
            onClick={() => setReplay(r)}
            className="btn-ghost rounded-lg px-2.5 py-1 text-sm"
            title="Xem lại ván"
          >
            Ván {r.roundNumber} ▸
          </button>
        ))}
      </div>
      {replay && <ReplayModal round={replay} onClose={() => setReplay(null)} />}
    </Panel>
  );
}

function ReplayModal({ round, onClose }: { round: RoundView; onClose: () => void }) {
  const players = useGame((s) => s.room?.players ?? []);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? id.slice(0, 6);
  const order = round.dealOrder ?? Object.keys(round.hands ?? {});

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="panel max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Xem lại ván {round.roundNumber}</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            ✕
          </button>
        </div>

        <FairnessBadge round={round} />

        <ul className="space-y-2">
          {order.map((id) => {
            const hand = round.hands?.[id];
            if (!hand) return null;
            const delta = round.result?.deltas[id];
            const isWinner = round.result?.potWinner === id;
            const outcome = round.result?.outcomes?.[id];
            return (
              <li key={id} className="rounded-xl bg-black/25 p-2">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{nameOf(id)}</span>
                  <span className="font-semibold text-gold">{handLabel(hand)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <TableCard
                      key={`replay-${round.roundNumber}-${id}-${i}`}
                      card={hand.cards[i]}
                      revealed
                      flipDelayMs={i * 90 + 100}
                    />
                  ))}
                  <span className="ml-auto text-sm">
                    {outcome === 'WIN' && <span className="text-green-400">thắng</span>}
                    {outcome === 'LOSE' && <span className="text-red-300">thua</span>}
                    {isWinner && <span className="text-green-400">ăn hũ 🏆</span>}
                    {delta != null && delta !== 0 && (
                      <span className={`ml-1 font-semibold ${delta > 0 ? 'text-green-400' : 'text-red-300'}`}>
                        {delta > 0 ? '+' : ''}
                        {delta}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
