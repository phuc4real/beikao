import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/app/store/store';
import { Button } from '@/components/ui';
import { Lobby } from '@/components/Lobby';
import { GameTable } from '@/components/GameTable';
import { Toast } from '@/components/Toast';

export function RoomPage() {
  const navigate = useNavigate();
  const room = useGame((s) => s.room);
  const status = useGame((s) => s.status);
  const fatal = useGame((s) => s.fatal);
  const me = useGame((s) => s.me);
  const leave = useGame((s) => s.leave);

  const tryReconnect = useGame((s) => s.tryReconnect);

  // On a page refresh the in-memory session is gone. Try to silently rejoin the
  // stored room (clients only); if there's nothing to rejoin, bounce home.
  useEffect(() => {
    if (status === 'idle' && !me) {
      if (!tryReconnect()) navigate('/', { replace: true });
    }
  }, [status, me, tryReconnect, navigate]);

  const goHome = () => {
    leave();
    navigate('/', { replace: true });
  };

  if (fatal) {
    return (
      <Centered>
        <p className="text-lg font-semibold text-red-300">{fatal}</p>
        <Button onClick={goHome}>Về trang chủ</Button>
      </Centered>
    );
  }

  if (!room) {
    return (
      <Centered>
        <div className="animate-pulse text-white/70">Đang kết nối…</div>
        <Button variant="ghost" onClick={goHome}>
          Huỷ
        </Button>
      </Centered>
    );
  }

  return (
    <>
      {room.status === 'LOBBY' ? <Lobby /> : <GameTable />}
      <Toast />
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">{children}</main>;
}
