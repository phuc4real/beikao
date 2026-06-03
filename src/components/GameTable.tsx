import { useEffect, useRef, useState } from 'react';
import { selectIsSpectator, selectMe, useGame } from '@/app/store/store';
import { useCountdown } from '@/app/hooks';
import { Button, Panel } from '@/components/ui';
import { Chat } from '@/components/Chat';
import { TableCard } from '@/components/TableCard';
import { FairnessBadge } from '@/components/FairnessBadge';
import { ReactionBar, FloatingReactions } from '@/components/Reactions';
import { HistoryPanel } from '@/components/History';
import { handLabel } from '@/components/handLabel';
import { randomSeedHex } from '@/utils/crypto';
import type { PlayerView, RoundView } from '@/features/room/types';

export function GameTable() {
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe);
  const isHost = useGame((s) => s.isHost());
  const isSpectator = useGame(selectIsSpectator);
  const sendSeed = useGame((s) => s.sendSeed);
  const round = room.round;

  // Provably-fair: as a con, contribute entropy once the deck is committed each
  // round, so the final shuffle isn't controlled by the cái alone.
  const seededRound = useRef<number>(-1);
  const canSeed = !!round && room.status === 'BETTING' && !!round.deckCommitment && !!me && !me.isCai;
  useEffect(() => {
    if (canSeed && round && seededRound.current !== round.roundNumber) {
      seededRound.current = round.roundNumber;
      sendSeed(randomSeedHex());
    }
  }, [canSeed, round, sendSeed]);

  if (!round) return null;
  const betting = room.status === 'BETTING';

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-3 p-4">
      <Header round={round} betting={betting} caiName={room.players.find((p) => p.isCai)?.name ?? ''} />

      {isSpectator && (
        <div className="rounded-xl bg-indigo-500/20 px-4 py-1.5 text-center text-sm text-indigo-200">
          👁 Bạn đang xem
        </div>
      )}

      <Panel className="flex-1">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {room.players.map((p, i) => (
            <Seat
              key={p.id}
              player={p}
              round={round}
              betting={betting}
              isMe={p.id === me?.id}
              seatIndex={i}
              seatCount={room.players.length}
            />
          ))}
        </ul>
      </Panel>

      <div className="flex justify-center">
        <FairnessBadge round={round} />
      </div>

      <MyHand round={round} betting={betting} />

      {betting && me && !me.isCai && <BettingControls />}
      {betting && isHost && (
        <Controls>
          <CloseBettingButton />
        </Controls>
      )}
      {room.status === 'REVEAL' && isHost && <RevealControls />}

      <ReactionBar />
      <HistoryPanel />
      <Chat className="h-32" />
      <FloatingReactions />
    </main>
  );
}

function Header({ round, betting, caiName }: { round: RoundView; betting: boolean; caiName: string }) {
  const seconds = useCountdown(round.endsAt);
  const me = useGame(selectMe);
  return (
    <header className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">Ván {round.roundNumber}</h1>
        <p className="text-sm text-white/60">Cái: 👑 {caiName}</p>
      </div>
      <div className="text-right">
        {betting ? (
          round.endsAt == null ? (
            <div className="text-sm font-semibold text-amber-300">Chờ đặt cược…</div>
          ) : (
            <div className={`text-2xl font-bold tabular-nums ${seconds <= 5 ? 'text-red-400' : 'text-amber-400'}`}>
              {seconds}s
            </div>
          )
        ) : (
          <div className="text-sm uppercase tracking-wide text-white/50">Kết quả</div>
        )}
        {me && <p className="text-sm text-white/70">{me.balance.toLocaleString()} chip</p>}
      </div>
    </header>
  );
}

function Seat({
  player,
  round,
  betting,
  isMe,
  seatIndex,
  seatCount,
}: {
  player: PlayerView;
  round: RoundView;
  betting: boolean;
  isMe: boolean;
  seatIndex: number;
  seatCount: number;
}) {
  const hand = round.hands?.[player.id];
  const bet = round.bets[player.id];
  const delta = round.result?.deltas[player.id];
  const outcome = round.result?.outcomes?.[player.id];
  const isPotWinner = round.result?.potWinner === player.id;
  const inRound = betting ? player.isCai || (bet ?? 0) > 0 : hand !== undefined;

  return (
    <li className={`rounded-xl p-3 ${inRound ? 'bg-black/25' : 'bg-black/10 opacity-50'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 font-medium">
          {player.isCai && <span title="Cái">👑</span>}
          {player.name}
          {isMe && <span className="text-xs text-white/40">(bạn)</span>}
        </span>
        {bet != null && <span className="text-sm text-amber-300">cược {bet}</span>}
      </div>

      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <TableCard
            key={`${round.roundNumber}-${i}`}
            card={hand?.cards[i]}
            revealed={!!hand}
            dealDelayMs={(i * seatCount + seatIndex) * 55}
            // The cái reveals LAST for suspense: base delay placed after every con.
            flipDelayMs={(player.isCai ? seatCount : seatIndex) * 220 + i * 80 + 200}
          />
        ))}
        {hand && <span className="ml-2 text-sm font-semibold">{handLabel(hand)}</span>}
      </div>

      {!betting && round.result && (
        <div className="mt-2 text-sm">
          {outcome && (
            <span className={outcome === 'WIN' ? 'text-green-400' : 'text-red-300'}>
              {outcome === 'WIN' ? 'Thắng' : 'Thua'}
            </span>
          )}
          {isPotWinner && <span className="text-green-400">Thắng hũ 🏆</span>}
          {delta != null && delta !== 0 && (
            <span className={`ml-2 font-semibold ${delta > 0 ? 'text-green-400' : 'text-red-300'}`}>
              {delta > 0 ? '+' : ''}
              {delta}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function MyHand({ round, betting }: { round: RoundView; betting: boolean }) {
  const me = useGame(selectMe);
  const playerCount = useGame((s) => s.room?.players.length ?? 1);
  if (!me) return null;
  // Match the table: if I'm the cái, my big hand reveals after all the cons.
  const flipBase = me.isCai ? playerCount * 220 + 200 : 150;
  const hand = round.hands?.[me.id];
  const revealed = !!hand;
  const participating = betting ? me.isCai || (round.bets[me.id] ?? 0) > 0 : revealed;
  const delta = round.result?.deltas[me.id];
  const outcome = round.result?.outcomes?.[me.id];
  const isPotWinner = round.result?.potWinner === me.id;

  return (
    <Panel className="border border-amber-400/30 bg-black/30">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">
          Bài của bạn {me.isCai && <span className="text-amber-300">(cái 👑)</span>}
        </span>
        {hand && <span className="text-lg font-bold text-amber-300">{handLabel(hand)}</span>}
      </div>

      {participating ? (
        <div className="flex items-center justify-center gap-3 py-1">
          {[0, 1, 2].map((i) => (
            <TableCard
              key={`${round.roundNumber}-my-${i}`}
              card={hand?.cards[i]}
              revealed={revealed}
              size="lg"
              dealDelayMs={i * 80}
              flipDelayMs={i * 130 + flipBase}
            />
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-white/50">Bạn không tham gia ván này</p>
      )}

      {!betting && round.result && (outcome || isPotWinner || (delta != null && delta !== 0)) && (
        <div className="mt-2 text-center text-lg font-bold">
          {outcome === 'WIN' && <span className="text-green-400">Bạn thắng</span>}
          {outcome === 'LOSE' && <span className="text-red-300">Bạn thua</span>}
          {isPotWinner && <span className="text-green-400">Bạn ăn hũ 🏆</span>}
          {delta != null && delta !== 0 && (
            <span className={`ml-2 ${delta > 0 ? 'text-green-400' : 'text-red-300'}`}>
              {delta > 0 ? '+' : ''}
              {delta} chip
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}

function BettingControls() {
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe)!;
  const placeBet = useGame((s) => s.placeBet);
  const clearBet = useGame((s) => s.clearBet);
  const betPending = useGame((s) => s.pending.bet);
  const { minBet, maxBet } = room.config;
  const currentBet = room.round?.bets[me.id];

  const ceiling = Math.min(maxBet, me.balance);
  const [amount, setAmount] = useState(Math.min(Math.max(minBet, currentBet ?? minBet), ceiling));

  useEffect(() => {
    setAmount((a) => Math.min(Math.max(minBet, a), Math.min(maxBet, me.balance)));
  }, [minBet, maxBet, me.balance]);

  if (!me.ready) {
    return <Controls><p className="text-center text-white/60">Bạn chưa sẵn sàng — ngồi xem ván này.</p></Controls>;
  }
  if (me.balance < minBet) {
    return <Controls><p className="text-center text-red-300">Không đủ chip để cược.</p></Controls>;
  }

  const step = (d: number) => setAmount((a) => Math.min(ceiling, Math.max(minBet, a + d)));

  return (
    <Controls>
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" onClick={() => step(-minBet)}>
          −
        </Button>
        <span className="w-24 text-center text-2xl font-bold tabular-nums">{amount}</span>
        <Button variant="ghost" onClick={() => step(minBet)}>
          +
        </Button>
        <Button variant="ghost" onClick={() => setAmount(ceiling)}>
          Tối đa
        </Button>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => placeBet(amount)} loading={betPending}>
          {currentBet ? `Đổi cược (${currentBet})` : 'Đặt cược'}
        </Button>
        {currentBet != null && (
          <Button variant="secondary" onClick={clearBet} disabled={betPending}>
            Xoá
          </Button>
        )}
      </div>
      <p className="text-center text-xs text-white/40">
        Cược từ {minBet} đến {Math.min(maxBet, me.balance)} chip
      </p>
    </Controls>
  );
}

function CloseBettingButton() {
  const closeBetting = useGame((s) => s.closeBetting);
  const closePending = useGame((s) => s.pending.close);
  return (
    <Button variant="primary" className="w-full" onClick={closeBetting} loading={closePending}>
      Chốt cược & lật bài
    </Button>
  );
}

function RevealControls() {
  const nextRound = useGame((s) => s.nextRound);
  const backToLobby = useGame((s) => s.backToLobby);
  const nextPending = useGame((s) => s.pending.next);
  const lobbyPending = useGame((s) => s.pending.lobby);
  return (
    <Controls>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={nextRound} loading={nextPending} disabled={lobbyPending}>
          Ván tiếp
        </Button>
        <Button variant="secondary" onClick={backToLobby} loading={lobbyPending} disabled={nextPending}>
          Về sảnh
        </Button>
      </div>
    </Controls>
  );
}

function Controls({ children }: { children: React.ReactNode }) {
  return <Panel className="space-y-3">{children}</Panel>;
}
