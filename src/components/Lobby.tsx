import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { selectMe, useGame } from '@/app/store/store';
import { Button, Chip, Panel } from '@/components/ui';
import { Chat } from '@/components/Chat';
import { SettingsModal } from '@/components/SettingsModal';
import { MIN_PLAYERS } from '@/features/room/types';

export function Lobby() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room)!;
  const me = useGame(selectMe);
  const isHost = useGame((s) => s.isHost());
  const setReady = useGame((s) => s.setReady);
  const startRound = useGame((s) => s.startRound);
  const leave = useGame((s) => s.leave);
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
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Phòng <span className="font-mono text-amber-400">{room.id}</span>
          </h1>
          <p className="text-sm text-white/60">
            Chế độ: {room.config.mode === 'CAO_CAI' ? 'Cào cái' : 'Cào rùa'} · {connected.length}/{room.config.maxPlayers}
          </p>
        </div>
        <div className="flex gap-2">
          {isHost && (
            <Button variant="ghost" onClick={() => setShowSettings(true)}>
              Cài đặt
            </Button>
          )}
          <Button variant="ghost" onClick={copyLink}>
            Sao chép link
          </Button>
        </div>
      </header>

      {showSettings && <SettingsModal config={room.config} onClose={() => setShowSettings(false)} />}

      <Panel className="flex-1">
        <h2 className="mb-2 text-sm uppercase tracking-wide text-white/50">Người chơi</h2>
        <ul className="space-y-2">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                p.connected ? 'bg-black/20' : 'bg-black/10 opacity-50'
              }`}
            >
              <span className="flex items-center gap-2">
                {p.isCai && <span title="Cái">👑</span>}
                <span className="font-medium">{p.name}</span>
                {p.id === me?.id && <span className="text-xs text-white/40">(bạn)</span>}
                {!p.connected && <span className="text-xs text-red-300">mất kết nối</span>}
              </span>
              <span className="flex items-center gap-3">
                <Chip>{p.balance.toLocaleString()} chip</Chip>
                {p.isCai ? (
                  <span className="text-sm text-amber-300">cái</span>
                ) : p.ready ? (
                  <span className="text-sm text-green-400">✓ sẵn sàng</span>
                ) : (
                  <span className="text-sm text-white/40">chưa</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Chat className="h-40" />

      <div className="flex gap-3">
        {!isHost && me && (
          <Button variant={me.ready ? 'secondary' : 'primary'} className="flex-1" onClick={() => setReady(!me.ready)}>
            {me.ready ? 'Huỷ sẵn sàng' : 'Sẵn sàng'}
          </Button>
        )}
        {isHost && (
          <Button className="flex-1" onClick={startRound} disabled={!canStart}>
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
