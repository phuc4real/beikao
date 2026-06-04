import { TableCard } from '@/components/TableCard';
import { Avatar } from '@/components/Avatar';
import { handLabel, isCaoHand } from '@/components/handLabel';
import { seatOutcome } from './outcome';
import { DEAL_STEP_MS, dealSpanMs } from './seatGeometry';
import { formatChips } from '@/utils/money';
import { avatarColor } from '@/utils/colors';
import type { PlayerView, RoundView } from '@/features/room/types';

/**
 * A player's stake as a mini chip pot (their avatar colour + gold amount).
 * Each bettor's pot sits at their own seat — in Cào cái there is NO shared
 * centre pot (the cái banks every con separately); in Cào rùa the centre pot
 * still shows the combined total and these mark who's in.
 */
export function BetPot({ amount, colorIdx }: { amount: number; colorIdx: number }) {
  return (
    <div className="seat-pot">
      <span className="pchip-s" style={{ background: avatarColor(colorIdx) }} />
      <span className="seat-pot-amt">{formatChips(amount)}</span>
    </div>
  );
}

/**
 * One opponent seat on the felt arc: fanned card trio + info pill + points
 * badge after reveal. The local player never renders here (bottom bar).
 * Without a `round` (LOBBY) the seat shows the waiting state instead: a
 * cái / "✓ sẵn sàng" / "chưa" badge under the name, no cards or stake.
 * During BETTING the seat holds only the avatar + stake; once betting closes
 * the dealt cards fly in from the deck (felt centre), card by card.
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
  /** The active round — absent in LOBBY, which switches the seat to lobby mode. */
  round?: RoundView;
  betting: boolean;
  /** Index in room.players — keeps avatar colour + reveal stagger stable. */
  seatIndex: number;
  seatCount: number;
  x: number;
  y: number;
}) {
  const hand = round?.hands?.[player.id];
  const bet = round?.bets[player.id];
  const inRound = !round
    ? player.connected
    : betting
      ? player.isCai || (bet ?? 0) > 0
      : hand !== undefined;
  const outcome = round && !betting ? seatOutcome(player, round) : null;
  const cardCls = outcome === 'win' ? 'card-glow' : outcome === 'lose' ? 'card-dim' : '';

  return (
    <div
      className={`seat ${outcome === 'win' ? 'seat-win' : ''} ${outcome === 'lose' ? 'seat-lose' : ''} ${
        inRound ? '' : 'seat-out'
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {round && hand && (
        <div className="seat-cards">
          {[0, 1, 2].map((i) => (
            <div
              key={`${round.roundNumber}-${i}`}
              className="seat-card cw-sm"
              style={{ transform: `rotate(${(i - 1) * 8}deg)`, zIndex: i }}
            >
              <TableCard
                card={hand.cards[i]}
                revealed
                size="sm"
                flyIn
                // Round-robin like a real deal: card 0 to every seat, then card 1…
                dealDelayMs={(i * seatCount + seatIndex) * DEAL_STEP_MS}
                // Flips wait for the whole deal to land; the cái reveals LAST
                // for suspense (base delay placed after every con).
                flipDelayMs={dealSpanMs(seatCount) + (player.isCai ? seatCount : seatIndex) * 220 + i * 80 + 200}
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
          {!round &&
            (!player.connected ? (
              <div className="seat-badge wait">mất kết nối</div>
            ) : player.isCai ? (
              <div className="seat-badge cai">cái 👑</div>
            ) : player.ready ? (
              <div className="seat-badge ready">✓ sẵn sàng</div>
            ) : (
              <div className="seat-badge wait">chưa sẵn sàng</div>
            ))}
        </div>
      </div>

      {(bet ?? 0) > 0 && <BetPot amount={bet!} colorIdx={seatIndex} />}

      {hand && (
        <div className={`seat-pts ${isCaoHand(hand) ? 'cao' : ''} ${outcome === 'win' ? 'win' : ''}`}>
          {handLabel(hand)}
        </div>
      )}
    </div>
  );
}
