import { TableCard } from '@/components/TableCard';
import { Avatar } from '@/components/Avatar';
import { handLabel, isCaoHand } from '@/components/handLabel';
import { seatOutcome } from './outcome';
import { formatChips } from '@/utils/money';
import type { PlayerView, RoundView } from '@/features/room/types';

/**
 * One opponent seat on the felt arc: fanned card trio + info pill + points
 * badge after reveal. The local player never renders here (bottom bar).
 */
export function Seat({
  player,
  round,
  betting,
  seatIndex,
  seatCount,
  x,
  y,
}: {
  player: PlayerView;
  round: RoundView;
  betting: boolean;
  /** Index in room.players — keeps avatar colour + reveal stagger stable. */
  seatIndex: number;
  seatCount: number;
  x: number;
  y: number;
}) {
  const hand = round.hands?.[player.id];
  const bet = round.bets[player.id];
  const inRound = betting ? player.isCai || (bet ?? 0) > 0 : hand !== undefined;
  const outcome = !betting ? seatOutcome(player, round) : null;
  const cardCls = outcome === 'win' ? 'card-glow' : outcome === 'lose' ? 'card-dim' : '';

  return (
    <div
      className={`seat ${outcome === 'win' ? 'seat-win' : ''} ${outcome === 'lose' ? 'seat-lose' : ''} ${
        inRound ? '' : 'seat-out'
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {inRound && (
        <div className="seat-cards">
          {[0, 1, 2].map((i) => (
            <div
              key={`${round.roundNumber}-${i}`}
              className="seat-card cw-sm"
              style={{ transform: `rotate(${(i - 1) * 8}deg)`, zIndex: i }}
            >
              <TableCard
                card={hand?.cards[i]}
                revealed={!!hand}
                size="sm"
                dealDelayMs={(i * seatCount + seatIndex) * 55}
                // The cái reveals LAST for suspense: base delay placed after every con.
                flipDelayMs={(player.isCai ? seatCount : seatIndex) * 220 + i * 80 + 200}
                className={cardCls}
              />
            </div>
          ))}
        </div>
      )}

      <div className="seat-info">
        <Avatar name={player.name} idx={seatIndex} isCai={player.isCai} />
        <div className="seat-meta">
          <div className="seat-name">{player.name}</div>
          {(bet ?? 0) > 0 && <div className="seat-stake">⛃ {formatChips(bet!)}</div>}
        </div>
      </div>

      {hand && (
        <div className={`seat-pts ${isCaoHand(hand) ? 'cao' : ''} ${outcome === 'win' ? 'win' : ''}`}>
          {handLabel(hand)}
        </div>
      )}
    </div>
  );
}
