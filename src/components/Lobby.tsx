import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { selectIsSpectator, selectMe, useGame } from '@/app/store/store';
import { Button, Chip, GoldText, Panel } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { Chat } from '@/components/Chat';
import { SettingsModal } from '@/components/SettingsModal';
import { MIN_PLAYERS } from '@/features/room/types';
import { formatChips } from '@/utils/money';

export function Lobby() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe);
  const isHost = useGame((s) => s.isHost());
  const setReady = useGame((s) => s.setReady);
  const startRound = useGame((s) => s.startRound);
  const leave = useGame((s) => s.leave);
  const isSpectator = useGame(selectIsSpectator);
  const readyPending = useGame((s) => s.pending.ready);
  const startPending = useGame((s) => s.pending.start);
  const [showSettings, setShowSettings] = useState(false);

  const connected = room.players.filter((p) => p.connected);
  const readyCons = connected.filter((p) => !p.isCai && p.ready).length;
  const canStart =
    room.config.mode === 'CAO_CAI' ? readyCons >= 1 : connected.filter((p) => p.ready || p.isCai).length >= MIN_PLAYERS;

  const shareLink = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
  const copyLink = () => navigator.clipboard?.writeText(shareLink).catch(() => {});

  const goHome = () => {
    leave();
    navigate('/', { replace: true });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">
            Phòng{' '}
            <GoldText className="font-mono font-bold tracking-wider">{room.id}</GoldText>
          </h1>
          <p className="text-sm text-pearl/60">
            Chế độ: {room.config.mode === 'CAO_CAI' ? 'Cào cái' : 'Cào rùa'} · {connected.length}/
            {room.config.maxPlayers}
            {room.spectators.length > 0 && <span> · 👁 {room.spectators.length} xem</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {isHost && (
            <Button variant="ghost" className="px-4 py-2 text-sm" onClick={() => setShowSettings(true)}>
              Cài đặt
            </Button>
          )}
          <Button variant="ghost" className="px-4 py-2 text-sm" onClick={copyLink}>
            Sao chép link
          </Button>
        </div>
      </header>

      {showSettings && <SettingsModal config={room.config} onClose={() => setShowSettings(false)} />}

      {isSpectator && (
        <div className="pill rounded-full px-4 py-2 text-center text-sm text-gold-light">
          👁 Bạn đang xem — không tham gia chơi
        </div>
      )}

      <Panel gilt className="flex-1">
        <h2 className="mb-3 text-xs uppercase tracking-widest text-gold/70">Người chơi</h2>
        <ul className="space-y-2">
          {room.players.map((p, i) => (
            <li
              key={p.id}
              className={`seat-info justify-between ${p.connected ? '' : 'opacity-50 saturate-50'}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={p.name} idx={i} isCai={p.isCai} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold text-pearl">{p.name}</span>
                    {p.id === me?.id && <span className="shrink-0 text-xs text-pearl/40">(bạn)</span>}
                  </span>
                  {!p.connected && <span className="block text-xs text-red-300">mất kết nối</span>}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <Chip>{formatChips(p.balance)} chip</Chip>
                {p.isCai ? (
                  <GoldText className="text-sm font-bold">cái</GoldText>
                ) : p.ready ? (
                  <span className="text-sm font-semibold text-jade">✓ sẵn sàng</span>
                ) : (
                  <span className="text-sm text-pearl/40">chưa</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Chat className="h-40" />

      <div className="flex gap-3">
        {!isHost && me && (
          <Button
            variant={me.ready ? 'ghost' : 'secondary'}
            className="flex-1"
            loading={readyPending}
            onClick={() => setReady(!me.ready)}
          >
            {me.ready ? 'Huỷ sẵn sàng' : 'Sẵn sàng'}
          </Button>
        )}
        {isHost && (
          <Button className="flex-1" onClick={startRound} disabled={!canStart} loading={startPending}>
            {canStart ? 'Chia bài' : 'Chờ người chơi sẵn sàng…'}
          </Button>
        )}
        <Button variant="danger" onClick={goHome}>
          Rời phòng
        </Button>
      </div>
    </main>
  );
}
