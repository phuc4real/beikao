import { selectMe, useGame } from '@/app/store/store';
import { TableCard } from '@/components/TableCard';
import { GoldText } from '@/components/ui';
import { handLabel, isCaoHand } from '@/components/handLabel';
import { formatChips } from '@/utils/money';
import type { RoundView } from '@/features/room/types';

/**
 * The local player's big hand + readout at REVEAL. Matches the table drama:
 * if I'm the cái, my cards flip only after every con's.
 */
export function MyHandBar({ round }: { round: RoundView }) {
  const me = useGame(selectMe);
  const playerCount = useGame((s) => s.room?.players.length ?? 1);
  if (!me) return null;

  const hand = round.hands?.[me.id];
  const flipBase = me.isCai ? playerCount * 220 + 200 : 150;
  const delta = round.result?.deltas[me.id];
  const outcome = round.result?.outcomes?.[me.id];
  const isPotWinner = round.result?.potWinner === me.id;
  const won = outcome === 'WIN' || isPotWinner || (me.isCai && (delta ?? 0) > 0);
  const lost = outcome === 'LOSE' || (!won && hand != null && round.result != null && (delta ?? 0) < 0);

  return (
    <div className="hand-bar w-full">
      {hand ? (
        <div className="hand-cards">
          {[0, 1, 2].map((i) => (
            <div
              key={`${round.roundNumber}-my-${i}`}
              className="hand-card cw-lg"
              style={{
                transform: `rotate(${(i - 1) * 6}deg) translateY(${Math.abs(i - 1) * 4}px)`,
                zIndex: i,
              }}
            >
              <TableCard
                card={hand.cards[i]}
                revealed
                size="lg"
                dealDelayMs={i * 80}
                flipDelayMs={i * 130 + flipBase}
                className={won ? 'card-glow' : lost ? 'card-dim' : ''}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="py-3 text-pearl/50">Bạn không tham gia ván này</p>
      )}

      <div className="hand-readout panel">
        <div className="hand-readout-k">Bài của bạn {me.isCai && <span className="text-gold">(cái 👑)</span>}</div>
        <div className={`hand-readout-v ${hand && isCaoHand(hand) ? 'cao' : ''}`}>
          {hand ? <GoldText>{handLabel(hand)}</GoldText> : '—'}
        </div>
        {round.result && (won || lost || (delta != null && delta !== 0)) && (
          <div className="mt-1 text-sm font-bold">
            {won && <span className="text-jade">{isPotWinner ? 'Bạn ăn hũ 🏆' : 'Bạn thắng'}</span>}
            {lost && <span className="text-red-300">Bạn thua</span>}
            {delta != null && delta !== 0 && (
              <span className={`ml-2 ${delta > 0 ? 'text-jade' : 'text-red-300'}`}>
                {delta > 0 ? '+' : ''}
                {formatChips(delta)} chip
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
