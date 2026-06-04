import { selectMe, useGame } from '@/app/store/store';
import { TableCard } from '@/components/TableCard';
import { GoldText } from '@/components/ui';
import { handLabel, isCaoHand } from '@/components/handLabel';
import { useDelayedTrue } from '@/app/hooks';
import { DEAL_STEP_MS, dealSpanMs, FLIP_MS } from './seatGeometry';
import { formatChips } from '@/utils/money';
import type { RoundView } from '@/features/room/types';

/**
 * The local player's big hand + readout at REVEAL: my cards fly in from the
 * deck in the same round-robin deal as the seats, then flip. Matches the
 * table drama: if I'm the cái, my cards flip only after every con's. The
 * readout (hand label, win/loss, delta) and the win/lose card dressing are
 * HELD until my last card has flipped — showing them earlier would spoil the
 * reveal while the cards are still face-down.
 */
export function MyHandBar({ round }: { round: RoundView }) {
  const me = useGame(selectMe);
  const players = useGame((s) => s.room?.players ?? []);

  const playerCount = Math.max(1, players.length);
  const mySeat = Math.max(0, players.findIndex((p) => p.id === me?.id));
  const hand = me ? round.hands?.[me.id] : undefined;
  const flipBase = dealSpanMs(playerCount) + (me?.isCai ? playerCount * 220 + 200 : 150);
  // My last card starts flipping at flipBase + 2×130; fully visible FLIP_MS later.
  const flipped = useDelayedTrue(hand ? flipBase + 2 * 130 + FLIP_MS : 0, round.roundNumber) && !!hand;

  if (!me) return null;

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
                flyIn
                dealDelayMs={(i * playerCount + mySeat) * DEAL_STEP_MS}
                flipDelayMs={i * 130 + flipBase}
                className={flipped ? (won ? 'card-glow' : lost ? 'card-dim' : '') : ''}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="py-3 text-pearl/50">Bạn không tham gia ván này</p>
      )}

      <div className="hand-readout panel">
        <div className="hand-readout-k">Bài của bạn {me.isCai && <span className="text-gold">(cái 👑)</span>}</div>
        <div className={`hand-readout-v ${flipped && hand && isCaoHand(hand) ? 'cao' : ''}`}>
          {flipped && hand ? <GoldText>{handLabel(hand)}</GoldText> : hand ? '…' : '—'}
        </div>
        {flipped && round.result && (won || lost || (delta != null && delta !== 0)) && (
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
