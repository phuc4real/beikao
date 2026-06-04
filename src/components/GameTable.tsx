import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { selectIsSpectator, selectMe, useGame } from '@/app/store/store';
import { Button, Coin, GoldText } from '@/components/ui';
import { Chat, ChatPopups } from '@/components/Chat';
import { useChatPopups } from '@/components/useChatPopups';
import { FairnessBadge } from '@/components/FairnessBadge';
import { ReactionBar, FloatingReactions } from '@/components/Reactions';
import { HistoryPanel } from '@/components/History';
import { AppearancePanel } from '@/components/AppearancePanel';
import { ResultOverlay } from '@/components/ResultOverlay';
import { SettingsModal } from '@/components/SettingsModal';
import { Seat, BetPot } from '@/components/table/Seat';
import { BettingBar, CaiBar } from '@/components/table/BettingBar';
import { AnteControl } from '@/components/table/AnteControl';
import { MyHandBar } from '@/components/table/MyHandBar';
import { BeikaoEmblem } from '@/components/table/BeikaoEmblem';
import { seatAngles, seatXY, revealSettleMs } from '@/components/table/seatGeometry';
import { randomSeedHex } from '@/utils/crypto';
import { formatChips } from '@/utils/money';
import { avatarColor } from '@/utils/colors';
import { MIN_PLAYERS, type PlayerView, type RoomState, type RoundView } from '@/features/room/types';

export function GameTable() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe);
  const isHost = useGame((s) => s.isHost());
  const sendSeed = useGame((s) => s.sendSeed);
  const closeBetting = useGame((s) => s.closeBetting);
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

  // Deadline failsafe: the scheduled server `tick` owns the betting clock, but
  // if the cron is missing or lagging, the cái's client fires the same
  // CLOSE_BETTING the "Chốt cược" button sends once the countdown runs out
  // (+grace for tick/clock skew). The server still validates everything, and a
  // round that already advanced makes this a harmless no-op.
  const endsAt = room.status === 'BETTING' ? (round?.endsAt ?? null) : null;
  useEffect(() => {
    if (!isHost || endsAt == null) return;
    const t = setTimeout(() => closeBetting(), Math.max(0, endsAt - Date.now()) + 1500);
    return () => clearTimeout(t);
  }, [isHost, endsAt, closeBetting]);

  const [drawer, setDrawer] = useState<'chat' | 'history' | 'looks' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  // New-message bubbles + unread badge while the chat drawer is closed.
  const { popups, unread } = useChatPopups(drawer === 'chat');

  const lobby = room.status === 'LOBBY';
  const betting = room.status === 'BETTING';
  const reveal = room.status === 'REVEAL';
  const isRua = room.config.mode === 'CAO_RUA';

  // HUD balance: held at the pre-settle value during the reveal choreography so
  // the number (and its ±flash) lands together with the result overlay.
  const displayBalance = useDisplayedBalance(me, room);

  const goHome = () => {
    leave();
    navigate('/', { replace: true });
  };

  // Lobby affordances: share link + start conditions (formula matches the authority's).
  const shareLink = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
  const copyLink = () => {
    navigator.clipboard?.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const connected = room.players.filter((p) => p.connected);
  const readyCons = connected.filter((p) => !p.isCai && p.ready).length;
  const canStart =
    room.config.mode === 'CAO_CAI' ? readyCons >= 1 : connected.filter((p) => p.ready || p.isCai).length >= MIN_PLAYERS;
  const openSeats = room.config.maxPlayers - room.players.length;

  // Opponents take the felt arc; I live in the bottom bar. Spectators watch
  // everyone from the arc.
  const opponents = room.players.filter((p) => p.id !== me?.id);
  const angles = seatAngles(opponents.length);

  return (
    <main className="flex min-h-screen flex-col">
      {/* HUD */}
      <header className="z-10 flex items-center justify-between gap-2 px-4 pt-3">
        <Button variant="ghost" className="px-3 py-2 text-sm" onClick={goHome}>
          ← {lobby ? 'Rời phòng' : 'Rời bàn'}
        </Button>
        <div className="panel flex flex-col items-center px-5 py-1.5 leading-tight">
          {lobby || !round ? (
            <>
              <span className="flex items-center gap-2">
                <GoldText className="font-display text-base font-bold">Phòng {room.id}</GoldText>
                <button
                  className="btn-ghost rounded-md px-2 py-0.5 text-xs font-semibold"
                  onClick={copyLink}
                  title="Sao chép link mời"
                >
                  {copied ? '✓' : '⧉ Link'}
                </button>
              </span>
              <span className="text-[10px] tracking-wide text-pearl/55">
                {room.config.mode === 'CAO_CAI' ? 'Cào cái' : 'Cào rùa'} · {connected.length}/{room.config.maxPlayers}{' '}
                người
                {room.spectators.length > 0 && <> · 👁 {room.spectators.length} xem</>}
              </span>
            </>
          ) : (
            <>
              <GoldText className="font-display text-base font-bold">
                {room.id} · Ván {round.roundNumber}
              </GoldText>
              <span className="text-[10px] tracking-wide text-pearl/55">
                Cái: 👑 {room.players.find((p) => p.isCai)?.name ?? ''} ·{' '}
                {isRua ? (
                  <>Cược {formatChips(room.config.minBet)}/người</>
                ) : (
                  <>
                    Cược {formatChips(room.config.minBet)}–{formatChips(room.config.maxBet)}
                  </>
                )}
              </span>
            </>
          )}
        </div>
        {me ? (
          <div className="panel relative flex items-center gap-2 px-3.5 py-2">
            <Coin small />
            <GoldText className="font-display text-base font-extrabold">{formatChips(displayBalance)}</GoldText>
            <BalanceFlash balance={displayBalance} />
          </div>
        ) : (
          <span className="pill rounded-full px-3 py-1.5 text-sm text-gold-light">👁 Đang xem</span>
        )}
      </header>

      <div className="z-10 mt-2 flex justify-center">{round && <FairnessBadge round={round} />}</div>

      {/* The felt */}
      <div className="felt-wrap">
        <div className="felt">
          <div className="felt-rim" />
          <div className="felt-inner">
            <div className="felt-emblem">
              <BeikaoEmblem />
            </div>
            {lobby || !round ? (
              // Waiting room: the felt centre carries the room code + readiness.
              <div key="lobby" className="felt-banner animate-fade-up">
                <GoldText className="felt-banner-code">{room.id}</GoldText>
                <div className={`felt-banner-status ${canStart ? '' : 'waiting'}`}>
                  {canStart ? 'Sẵn sàng để chia bài' : 'Chờ người chơi…'}
                </div>
                <div className="felt-banner-count">
                  {readyCons}/{Math.max(0, connected.length - 1)} con sẵn sàng
                </div>
                {isRua && (
                  <div className="felt-banner-count">Cược {formatChips(room.config.minBet)}/người</div>
                )}
              </div>
            ) : (
              <>
                {/* Only Cào rùa has a shared pot; in Cào cái every stake sits
                    at its bettor's seat (the cái banks each con separately). */}
                {isRua && <Pot round={round} />}
                {betting && (
                  <div className="felt-substatus">
                    {room.players.filter((p) => !p.isCai && (round.bets[p.id] ?? 0) > 0).length}/
                    {room.players.filter((p) => !p.isCai).length} con đã cược
                  </div>
                )}
              </>
            )}
          </div>
          {opponents.map((p, i) => {
            const { x, y } = seatXY(angles[i]!);
            return (
              <Seat
                key={p.id}
                player={p}
                round={round ?? undefined}
                betting={betting}
                seatIndex={room.players.findIndex((q) => q.id === p.id)}
                seatCount={room.players.length}
                x={x}
                y={y}
              />
            );
          })}
          {/* My own stake "sits" with me at the bottom edge of the felt. */}
          {round && me && (round.bets[me.id] ?? 0) > 0 && (
            <div className="my-pot">
              <BetPot
                amount={round.bets[me.id]!}
                colorIdx={Math.max(0, room.players.findIndex((p) => p.id === me.id))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: lobby controls, betting controls, or my hand — cross-fades on
          status changes (keyed) while the felt above stays put. */}
      <div key={room.status} className="z-10 flex animate-fade-up flex-col items-center gap-3 px-4 pb-4">
        {lobby && openSeats > 0 && (
          <button className="invite-pill" onClick={copyLink}>
            {copied ? 'Đã sao chép link mời ✓' : `＋ ${openSeats} chỗ trống — mời bạn bè`}
          </button>
        )}

        {/* Cào rùa: the cái sets the shared ante right at the table (no settings drawer). */}
        {isRua && isHost && (lobby || !round || reveal) && <AnteControl />}

        {lobby || !round ? (
          <LobbyControls canStart={canStart} />
        ) : betting ? (
          me ? (
            // Cào rùa cons get the info bar too: their ante is auto-placed at
            // round start (the authority rejects PLACE_BET in this mode).
            me.isCai || isRua ? (
              <CaiBar />
            ) : (
              <BettingBar />
            )
          ) : null
        ) : (
          <MyHandBar round={round} />
        )}

        {reveal && isHost && <RevealControls />}
        {reveal && !isHost && <SeatSwap />}

        <ReactionBar />
      </div>

      {/* Drawers: chat + history dock bottom-right so the felt owns the screen */}
      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2">
        <ChatPopups popups={popups} onOpen={() => setDrawer('chat')} />
        {drawer === 'chat' && <Chat className="h-72 w-80 max-w-[calc(100vw-2rem)]" />}
        {drawer === 'history' && (
          <div className="max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto">
            <HistoryPanel />
          </div>
        )}
        {drawer === 'looks' && <AppearancePanel />}
        <div className="flex gap-2">
          {isHost && lobby && (
            <DrawerToggle
              label="⚙"
              title="Cài đặt phòng"
              active={showSettings}
              onClick={() => setShowSettings((s) => !s)}
            />
          )}
          <DrawerToggle
            label="💬"
            title="Trò chuyện"
            active={drawer === 'chat'}
            badge={unread}
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

      {showSettings && isHost && lobby && (
        <SettingsModal config={room.config} onClose={() => setShowSettings(false)} />
      )}

      {reveal && round && <ResultOverlay round={round} />}

      <FloatingReactions />
    </main>
  );
}

/** Lobby bottom bar: con ready-toggle / host start / spectator notice. */
function LobbyControls({ canStart }: { canStart: boolean }) {
  const me = useGame(selectMe);
  const isHost = useGame((s) => s.isHost());
  const isSpectator = useGame(selectIsSpectator);
  const setReady = useGame((s) => s.setReady);
  const startRound = useGame((s) => s.startRound);
  const readyPending = useGame((s) => s.pending.ready);
  const startPending = useGame((s) => s.pending.start);

  if (isSpectator || !me) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="pill rounded-full px-4 py-2 text-center text-sm text-gold-light">
          👁 Bạn đang xem — không tham gia chơi
        </div>
        <SeatSwap />
      </div>
    );
  }
  return (
    <div className="bet-bar panel panel-gilt w-full max-w-xl justify-center">
      {isHost ? (
        <Button className="flex-1 px-6 py-3" onClick={startRound} disabled={!canStart} loading={startPending}>
          {canStart ? 'Chia bài' : 'Chờ người chơi sẵn sàng…'}
        </Button>
      ) : (
        <>
          <Button
            variant={me.ready ? 'ghost' : 'secondary'}
            className="flex-1 px-6 py-3"
            loading={readyPending}
            onClick={() => setReady(!me.ready)}
          >
            {me.ready ? 'Huỷ sẵn sàng' : 'Sẵn sàng'}
          </Button>
          <SeatSwap />
        </>
      )}
    </div>
  );
}

/**
 * Between rounds (LOBBY/REVEAL — the authority rejects mid-BETTING switches):
 * a seated con can step back to watch-only, a spectator can take a free seat.
 * The cái can never leave the seat; renders nothing when no switch applies.
 */
function SeatSwap() {
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe);
  const isSpectator = useGame(selectIsSpectator);
  const becomeSpectator = useGame((s) => s.becomeSpectator);
  const becomePlayer = useGame((s) => s.becomePlayer);
  const pending = useGame((s) => s.pending.seatswap);

  if (room.status === 'BETTING') return null;
  if (me && !me.isCai) {
    return (
      <Button variant="ghost" className="px-4 py-2 text-sm" onClick={becomeSpectator} loading={pending}>
        👁 Chuyển sang xem
      </Button>
    );
  }
  const seatsFree = room.players.filter((p) => p.connected).length < room.config.maxPlayers;
  if (isSpectator && seatsFree) {
    return (
      <Button variant="secondary" className="px-4 py-2 text-sm" onClick={becomePlayer} loading={pending}>
        🪑 Vào bàn chơi
      </Button>
    );
  }
  return null;
}

/**
 * The HUD balance to render. The authoritative `me.balance` already includes
 * the round's settlement the moment the REVEAL state arrives — long before the
 * cards finish flipping — so during REVEAL we hold the pre-settle value
 * (balance − my delta) until the reveal choreography ends, then release it.
 * The new number and its ±flash thus land together with the ResultOverlay, and
 * the flash equals exactly the round's `result.deltas` entry.
 */
function useDisplayedBalance(me: PlayerView | undefined, room: RoomState): number {
  const result = room.status === 'REVEAL' ? room.round?.result : undefined;
  const roundNumber = result?.roundNumber ?? null;
  const playerCount = room.players.length;
  const [settledRound, setSettledRound] = useState<number | null>(null);

  useEffect(() => {
    if (roundNumber == null) return;
    const t = setTimeout(() => setSettledRound(roundNumber), revealSettleMs(playerCount));
    return () => clearTimeout(t);
  }, [roundNumber, playerCount]);

  if (!me) return 0; // spectator — the HUD balance isn't rendered
  if (result && settledRound !== roundNumber) return me.balance - (result.deltas[me.id] ?? 0);
  return me.balance;
}

/** Transient +N/−N flash over the HUD balance when it changes (settle, rebuy). */
function BalanceFlash({ balance }: { balance: number }) {
  const prev = useRef(balance);
  const [flash, setFlash] = useState<{ delta: number; at: number } | null>(null);

  useEffect(() => {
    const delta = balance - prev.current;
    prev.current = balance;
    if (delta === 0) return;
    setFlash({ delta, at: performance.now() });
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [balance]);

  if (!flash) return null;
  return (
    <span key={flash.at} className={`balance-flash ${flash.delta > 0 ? 'up' : 'down'}`} aria-hidden>
      {flash.delta > 0 ? '+' : ''}
      {formatChips(flash.delta)}
    </span>
  );
}

function DrawerToggle({
  label,
  title,
  active,
  badge = 0,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  /** Unread count rendered as a small bubble on the toggle (0 hides it). */
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`${active ? 'btn-gold' : 'btn-ghost'} relative h-11 w-11 rounded-full text-lg shadow-soft`}
    >
      {label}
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-suit-red px-1 text-[11px] font-bold text-white shadow-soft">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
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
