import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { selectMe, useGame } from '@/app/store/store';
import { Button, Coin, GoldText } from '@/components/ui';
import { Chat } from '@/components/Chat';
import { FairnessBadge } from '@/components/FairnessBadge';
import { ReactionBar, FloatingReactions } from '@/components/Reactions';
import { HistoryPanel } from '@/components/History';
import { AppearancePanel } from '@/components/AppearancePanel';
import { ResultOverlay } from '@/components/ResultOverlay';
import { Seat } from '@/components/table/Seat';
import { BettingBar, CaiBar } from '@/components/table/BettingBar';
import { MyHandBar } from '@/components/table/MyHandBar';
import { BeikaoEmblem } from '@/components/table/BeikaoEmblem';
import { seatAngles, seatXY } from '@/components/table/seatGeometry';
import { randomSeedHex } from '@/utils/crypto';
import { formatChips } from '@/utils/money';
import { avatarColor } from '@/utils/colors';
import type { RoundView } from '@/features/room/types';

export function GameTable() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe);
  const isHost = useGame((s) => s.isHost());
  const sendSeed = useGame((s) => s.sendSeed);
  const leave = useGame((s) => s.leave);
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

  const [drawer, setDrawer] = useState<'chat' | 'history' | 'looks' | null>(null);

  if (!round) return null;
  const betting = room.status === 'BETTING';

  const goHome = () => {
    leave();
    navigate('/', { replace: true });
  };

  // Opponents take the felt arc; I live in the bottom bar. Spectators watch
  // everyone from the arc.
  const opponents = room.players.filter((p) => p.id !== me?.id);
  const angles = seatAngles(opponents.length);

  return (
    <main className="flex min-h-screen flex-col">
      {/* HUD */}
      <header className="z-10 flex items-center justify-between gap-2 px-4 pt-3">
        <Button variant="ghost" className="px-3 py-2 text-sm" onClick={goHome}>
          ← Rời bàn
        </Button>
        <div className="panel flex flex-col items-center px-5 py-1.5 leading-tight">
          <GoldText className="font-display text-base font-bold">
            {room.id} · Ván {round.roundNumber}
          </GoldText>
          <span className="text-[10px] tracking-wide text-pearl/55">
            Cái: 👑 {room.players.find((p) => p.isCai)?.name ?? ''} · Cược {formatChips(room.config.minBet)}–
            {formatChips(room.config.maxBet)}
          </span>
        </div>
        {me ? (
          <div className="panel flex items-center gap-2 px-3.5 py-2">
            <Coin small />
            <GoldText className="font-display text-base font-extrabold">{formatChips(me.balance)}</GoldText>
          </div>
        ) : (
          <span className="pill rounded-full px-3 py-1.5 text-sm text-gold-light">👁 Đang xem</span>
        )}
      </header>

      <div className="z-10 mt-2 flex justify-center">
        <FairnessBadge round={round} />
      </div>

      {/* The felt */}
      <div className="felt-wrap">
        <div className="felt">
          <div className="felt-rim" />
          <div className="felt-inner">
            <div className="felt-emblem">
              <BeikaoEmblem />
            </div>
            <Pot round={round} />
          </div>
          {opponents.map((p, i) => {
            const { x, y } = seatXY(angles[i]!);
            return (
              <Seat
                key={p.id}
                player={p}
                round={round}
                betting={betting}
                seatIndex={room.players.findIndex((q) => q.id === p.id)}
                seatCount={room.players.length}
                x={x}
                y={y}
              />
            );
          })}
        </div>
      </div>

      {/* Bottom: betting controls or my hand */}
      <div className="z-10 flex flex-col items-center gap-3 px-4 pb-4">
        {betting ? (
          me ? (
            me.isCai ? (
              <CaiBar />
            ) : (
              <BettingBar />
            )
          ) : null
        ) : (
          <MyHandBar round={round} />
        )}

        {!betting && isHost && <RevealControls />}

        <ReactionBar />
      </div>

      {/* Drawers: chat + history dock bottom-right so the felt owns the screen */}
      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
        {drawer === 'chat' && <Chat className="h-72 w-80 max-w-[calc(100vw-2rem)]" />}
        {drawer === 'history' && (
          <div className="max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
            <HistoryPanel />
          </div>
        )}
        {drawer === 'looks' && <AppearancePanel />}
        <div className="flex gap-2">
          <DrawerToggle
            label="💬"
            title="Trò chuyện"
            active={drawer === 'chat'}
            onClick={() => setDrawer((d) => (d === 'chat' ? null : 'chat'))}
          />
          <DrawerToggle
            label="🕘"
            title="Lịch sử ván"
            active={drawer === 'history'}
            onClick={() => setDrawer((d) => (d === 'history' ? null : 'history'))}
          />
          <DrawerToggle
            label="🎴"
            title="Giao diện"
            active={drawer === 'looks'}
            onClick={() => setDrawer((d) => (d === 'looks' ? null : 'looks'))}
          />
        </div>
      </div>

      {!betting && <ResultOverlay round={round} />}

      <FloatingReactions />
    </main>
  );
}

function DrawerToggle({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${active ? 'btn-gold' : 'btn-ghost'} h-11 w-11 rounded-full text-lg shadow-soft`}
    >
      {label}
    </button>
  );
}

/** Centre-felt pot: one chip per bettor (their avatar colour) + gold total. */
function Pot({ round }: { round: RoundView }) {
  const players = useGame((s) => s.room?.players ?? []);
  const entries = Object.entries(round.bets).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total <= 0) return null;
  return (
    <div className="pot">
      <div className="pot-chips">
        {entries.slice(0, 7).map(([id], i) => (
          <span
            key={id}
            className="pchip"
            style={{
              background: avatarColor(Math.max(0, players.findIndex((p) => p.id === id))),
              bottom: `${i * 4}px`,
              zIndex: i,
            }}
          />
        ))}
      </div>
      <GoldText className="pot-amt">{formatChips(total)}</GoldText>
    </div>
  );
}

function RevealControls() {
  const nextRound = useGame((s) => s.nextRound);
  const backToLobby = useGame((s) => s.backToLobby);
  const nextPending = useGame((s) => s.pending.next);
  const lobbyPending = useGame((s) => s.pending.lobby);
  return (
    <div className="flex w-full max-w-md gap-2">
      <Button className="flex-1" onClick={nextRound} loading={nextPending} disabled={lobbyPending}>
        Chơi tiếp →
      </Button>
      <Button variant="ghost" onClick={backToLobby} loading={lobbyPending} disabled={nextPending}>
        Về sảnh
      </Button>
    </div>
  );
}
