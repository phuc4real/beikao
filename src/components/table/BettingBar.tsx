import { useEffect, useState } from 'react';
import { selectMe, selectMyBet, useGame } from '@/app/store/store';
import { Button, GoldText, Panel } from '@/components/ui';
import { TimerRing } from './TimerRing';
import { flyChipsToPot } from './chipFlight';
import { usePrefs } from '@/utils/prefs';
import { formatChips, moneyShort } from '@/utils/money';

/**
 * The con's betting bar: server-driven countdown ring, quick-bet chip buttons
 * (multiples of the min bet, clamped to balance/max), a fine-tune stepper and
 * the place/clear actions. All mutations go through the store's intentions.
 */
export function BettingBar() {
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe)!;
  const placeBet = useGame((s) => s.placeBet);
  const clearBet = useGame((s) => s.clearBet);
  const betPending = useGame((s) => s.pending.bet);
  const chipStyle = usePrefs((s) => s.chipStyle);
  const round = room.round!;
  const { minBet, maxBet, bettingSeconds } = room.config;
  // Optimistic so the label flips to "Đổi cược" the instant I tap, not 1s later.
  const currentBet = useGame(selectMyBet);

  const ceiling = Math.min(maxBet, me.balance);
  const [amount, setAmount] = useState(Math.min(Math.max(minBet, currentBet ?? minBet), ceiling));

  useEffect(() => {
    setAmount((a) => Math.min(Math.max(minBet, a), Math.min(maxBet, me.balance)));
  }, [minBet, maxBet, me.balance]);

  if (!me.ready) {
    return (
      <Panel className="w-full max-w-xl text-center text-pearl/60">Bạn chưa sẵn sàng — ngồi xem ván này.</Panel>
    );
  }
  if (me.balance < minBet) {
    return <Panel className="w-full max-w-xl text-center text-red-300">Không đủ chip để cược.</Panel>;
  }

  // Quick chips are *additive* denominations (min ×1/5/10/25/50): each click
  // stacks its value onto the stake (clamped to the ceiling) instead of
  // radio-selecting a fixed amount. Only denominations I can afford show up.
  const chips = [1, 5, 10, 25, 50].map((m) => m * minBet).filter((v) => v > 0 && v <= ceiling);
  const step = (d: number) => setAmount((a) => Math.min(ceiling, Math.max(minBet, a + d)));

  return (
    <div className="bet-bar panel panel-gilt w-full max-w-3xl justify-center">
      <TimerRing endsAt={round.endsAt} total={bettingSeconds} />

      <div className="bet-chips" role="group" aria-label="Thêm cược nhanh">
        {chips.map((c) => (
          <button
            key={c}
            className={`chip-btn ${chipStyle}`}
            onClick={() => step(c)}
            disabled={amount >= ceiling}
            aria-label={`Thêm ${moneyShort(c)}`}
          >
            <span className="chip-face">+{moneyShort(c)}</span>
          </button>
        ))}
      </div>

      <div className="bet-current">
        <span className="bet-current-k">Tiền cược</span>
        <GoldText className="bet-current-v">{formatChips(amount)}</GoldText>
        <span className="mt-0.5 flex items-center gap-1">
          <button className="btn-ghost rounded-md px-2 text-sm font-bold" onClick={() => step(-minBet)} aria-label="Giảm cược">
            −
          </button>
          <button className="btn-ghost rounded-md px-2 text-sm font-bold" onClick={() => step(minBet)} aria-label="Tăng cược">
            +
          </button>
          <button className="btn-ghost rounded-md px-2 text-xs font-semibold" onClick={() => setAmount(ceiling)}>
            Tối đa
          </button>
          <button
            className="btn-ghost rounded-md px-2 text-xs font-semibold"
            onClick={() => setAmount(minBet)}
            disabled={amount <= minBet}
          >
            Đặt lại
          </button>
        </span>
      </div>

      <div className="flex flex-col items-stretch gap-1.5">
        <Button
          className="px-6 py-3"
          onClick={(e) => {
            // Chips fly to the pot immediately — instant feedback that masks
            // the ~1s intent round trip (the pending state still spins below).
            flyChipsToPot(e.currentTarget, chipStyle, moneyShort(amount));
            placeBet(amount);
          }}
          loading={betPending}
        >
          {currentBet ? `Đổi cược (${formatChips(currentBet)})` : 'Đặt cược'}
        </Button>
        {currentBet != null && (
          <Button variant="ghost" className="px-4 py-1.5 text-sm" onClick={clearBet} disabled={betPending}>
            Xoá cược
          </Button>
        )}
      </div>
    </div>
  );
}

/** What the cái sees during betting: countdown + progress + (host) close action. */
export function CaiBar() {
  const room = useGame((s) => s.room)!;
  const isHost = useGame((s) => s.isHost());
  const closeBetting = useGame((s) => s.closeBetting);
  const closePending = useGame((s) => s.pending.close);
  const round = room.round!;
  const cons = room.players.filter((p) => !p.isCai);
  const betCount = cons.filter((p) => (round.bets[p.id] ?? 0) > 0).length;

  return (
    <div className="bet-bar panel panel-gilt w-full max-w-3xl justify-center">
      <TimerRing endsAt={round.endsAt} total={room.config.bettingSeconds} />
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-wider text-pearl/50">Đặt cược</div>
        <div className="font-display text-lg font-bold text-pearl">
          {betCount}/{cons.length} con đã cược
        </div>
      </div>
      {isHost && (
        <Button onClick={closeBetting} loading={closePending}>
          Chốt cược & lật bài
        </Button>
      )}
    </div>
  );
}
