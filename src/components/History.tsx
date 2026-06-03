import { useState } from 'react';
import { useGame } from '@/app/store/store';
import { Panel } from '@/components/ui';
import { TableCard } from '@/components/TableCard';
import { FairnessBadge } from '@/components/FairnessBadge';
import { handLabel } from '@/components/handLabel';
import type { RoundView } from '@/features/room/types';

export function HistoryPanel() {
  const history = useGame((s) => s.room?.history ?? []);
  const [replay, setReplay] = useState<RoundView | null>(null);

  if (history.length === 0) return null;

  return (
    <Panel className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-white/50">Lịch sử</div>
      <div className="flex flex-wrap gap-1.5">
        {history.map((r) => (
          <button
            key={r.roundNumber}
            onClick={() => setReplay(r)}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-sm hover:bg-white/20"
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
        className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-felt-dark p-5 ring-1 ring-white/10"
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
                  <span className="text-amber-300">{handLabel(hand)}</span>
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
