import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '@/app/store/store';
import { Button } from '@/components/ui';
import { Stage } from '@/components/Stage';
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
        <div className="table-skeleton" aria-hidden />
        <div className="animate-pulse text-white/70">Đang vào bàn…</div>
        <Button variant="ghost" onClick={goHome}>
          Huỷ
        </Button>
      </Centered>
    );
  }

  return (
    <>
      <Stage motif="cloud" />
      {/* One table screen for every status — GameTable renders the waiting
          lobby itself when status === 'LOBBY' (round == null). */}
      <GameTable />
      {status === 'reconnecting' && <ReconnectingBanner />}
      <Toast />
    </>
  );
}

/**
 * Soft banner shown when the Realtime socket dropped mid-session. The table
 * stays mounted and durable underneath (state is server-side), so a brief
 * network blip no longer ejects the player — it auto-recovers on re-subscribe.
 */
function ReconnectingBanner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center">
      <div className="pill animate-pop flex items-center gap-2 rounded-full px-4 py-2 text-sm text-gold-light shadow-soft">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Đang kết nối lại…
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <Stage motif="cloud" />
      {children}
    </main>
  );
}
