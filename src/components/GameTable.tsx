import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { selectIsSpectator, selectMe, selectMyBet, useGame } from '@/app/store/store';
import { Button, Coin, GoldText } from '@/components/ui';
import { Chat, ChatPopups } from '@/components/Chat';
import { useChatPopups } from '@/components/useChatPopups';
import { FairnessBadge } from '@/components/FairnessBadge';
import { ReactionBar, FloatingReactions } from '@/components/Reactions';
import { HistoryPanel } from '@/components/History';
import { AppearancePanel } from '@/components/AppearancePanel';
import { ResultOverlay } from '@/components/ResultOverlay';
import { PhaseSwap } from '@/components/PhaseSwap';
import { SettingsModal } from '@/components/SettingsModal';
import { Seat, BetPot } from '@/components/table/Seat';
import { BettingBar, CaiBar } from '@/components/table/BettingBar';
import { AnteControl } from '@/components/table/AnteControl';
import { MyHandBar } from '@/components/table/MyHandBar';
import { BeikaoEmblem } from '@/components/table/BeikaoEmblem';
import { seatAngles, seatXY, revealSettleMs } from '@/components/table/seatGeometry';
import { useLayoutMode } from '@/app/hooks';
import { ANIM } from '@/config/animation';
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
  // My stake, shown optimistically the instant I bet (masks the ~1s round trip).
  const myBet = useGame(selectMyBet);

  const goHome = () => {
    leave();
    navigate('/', { replace: true });
  };

  // Lobby affordances: share link + start conditions (formula matches the authority's).
  const shareLink = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
  const copyLink = () => {
    navigator.clipboard?.writeText(shareLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), ANIM.inviteCopiedMs);
  };
  const connected = room.players.filter((p) => p.connected);
  const readyCons = connected.filter((p) => !p.isCai && p.ready).length;
  const canStart =
    room.config.mode === 'CAO_CAI' ? readyCons >= 1 : connected.filter((p) => p.ready || p.isCai).length >= MIN_PLAYERS;
  const openSeats = room.config.maxPlayers - room.players.length;

  // Opponents take the felt arc; I live in the bottom bar. Spectators watch
  // everyone from the arc. The felt shape + arc adapt to orientation: portrait
  // phones get a taller capsule (`tall`) so seats wrap down the sides.
  const { layout } = useLayoutMode();
  const opponents = room.players.filter((p) => p.id !== me?.id);
  const angles = seatAngles(opponents.length, layout);

  return (
    <main className="flex min-h-dvh flex-col">
      {/* HUD — wraps on very narrow phones (flex-wrap) and goes single-row from
          the `tab` breakpoint up; the centre room-info panel shrinks/truncates
          so it never pushes the balance off-screen. */}
      <header className="px-safe z-10 flex flex-wrap items-center justify-between gap-1 px-2 pt-2 tab:flex-nowrap tab:gap-2 tab:px-4 tab:pt-3">
        <Button variant="ghost" className="px-3 py-2 text-sm" onClick={goHome}>
          ← {lobby ? 'Rời phòng' : 'Rời bàn'}
        </Button>
        <div className="panel flex min-w-0 max-w-[60vw] flex-col items-center px-3 py-1.5 leading-tight tab:max-w-none tab:px-5">
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
              <span className="max-w-full truncate text-[10px] tracking-wide text-pearl/55">
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
              <span className="max-w-full truncate text-[10px] tracking-wide text-pearl/55">
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

      {/* Portrait phones with a crowded arc play better sideways — a gentle,
          dismissible nudge (no forced rotation). */}
      {layout === 'tall' && opponents.length > 3 && <LandscapeHint />}

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
                    {
                      room.players.filter(
                        (p) => !p.isCai && (p.id === me?.id ? (myBet ?? 0) : (round.bets[p.id] ?? 0)) > 0,
                      ).length
                    }
                    /{room.players.filter((p) => !p.isCai).length} con đã cược
                  </div>
                )}
                {reveal && <ClosedBanner roundNumber={round.roundNumber} />}
              </>
            )}
          </div>
          {opponents.map((p, i) => {
            const { x, y } = seatXY(angles[i]!, layout);
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
          {round && me && (myBet ?? 0) > 0 && (
            <div className="my-pot">
              <BetPot
                amount={myBet!}
                colorIdx={Math.max(0, room.players.findIndex((p) => p.id === me.id))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: lobby controls, betting controls, or my hand — crossfades
          (PhaseSwap) on status changes while the felt above stays put. */}
      <div className="z-10 flex flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <PhaseSwap token={room.status} className="w-full">
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
        </PhaseSwap>

        {/* On phones the corner drawer dock sits in the bottom band, so lift the
            reaction bar above it to avoid overlap; desktop has room in the
            corner already. */}
        <div className="mb-14 tab:mb-0">
          <ReactionBar />
        </div>
      </div>

      {/* Drawers: chat + history dock bottom-right so the felt owns the screen.
          Below `tab` they widen to a near-full-width bottom sheet; heights use
          dvh so they track the visible viewport when mobile chrome resizes.
          The container is pointer-events-none so its transparent full-width band
          never intercepts taps meant for the table/reaction bar beneath it —
          each interactive child re-enables pointer events. */}
      <div className="px-safe pointer-events-none fixed inset-x-2 bottom-2 z-30 flex flex-col items-end gap-2 tab:inset-x-auto tab:bottom-4 tab:right-4">
        <div className="pointer-events-auto">
          <ChatPopups popups={popups} onOpen={() => setDrawer('chat')} />
        </div>
        {drawer === 'chat' && (
          <Chat className="pointer-events-auto h-72 max-h-drawer w-full max-w-[calc(100vw-1rem)] tab:w-80" />
        )}
        {drawer === 'history' && (
          <div className="pointer-events-auto max-h-drawer w-full max-w-[calc(100vw-1rem)] overflow-y-auto tab:w-80">
            <HistoryPanel />
          </div>
        )}
        {drawer === 'looks' && (
          <div className="pointer-events-auto">
            <AppearancePanel />
          </div>
        )}
        <div className="pointer-events-auto flex gap-2">
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

/**
 * Dismissible "rotate for a better view" nudge, shown on portrait phones when
 * the seat arc is crowded. Dismissal lives for the session only (useState) —
 * presentation-only, never persisted to game state.
 */
function LandscapeHint() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="z-10 mt-1 flex justify-center px-3">
      <button
        className="pill flex items-center gap-2 rounded-full px-3 py-1.5 text-fluid-xs text-gold-light"
        onClick={() => setDismissed(true)}
        title="Ẩn gợi ý"
      >
        ↻ Xoay ngang để chơi tốt hơn
        <span className="text-pearl/50">✕</span>
      </button>
    </div>
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
    const t = setTimeout(() => setFlash(null), ANIM.balanceFlashMs);
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

/**
 * Transient "🔒 Đã chốt cược" flash at the top of the felt the moment betting
 * closes, overlapping the dealing cards so the BETTING→REVEAL cut isn't abrupt.
 * Keyed on round number so it replays each round, then hides itself.
 */
function ClosedBanner({ roundNumber }: { roundNumber: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), ANIM.closedBannerMs);
    return () => clearTimeout(t);
  }, [roundNumber]);
  if (!show) return null;
  return (
    <div className="closed-banner animate-pop" aria-hidden>
      🔒 Đã chốt cược
    </div>
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
