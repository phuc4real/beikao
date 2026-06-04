import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Coin, GoldText, Panel } from '@/components/ui';
import { Stage } from '@/components/Stage';
import { BeikaoLogo } from '@/components/BeikaoLogo';
import { RoomBrowser } from '@/components/RoomBrowser';
import { Leaderboard } from '@/components/Leaderboard';
import { useGame } from '@/app/store/store';
import { isSupabaseConfigured } from '@/network/supabase/client';
import { getCachedIdentity } from '@/network/supabase/auth';
import { fetchProfileBalance } from '@/network/supabase/leaderboard';
import { getStoredName } from '@/utils/storage';
import { formatChips } from '@/utils/money';

type Tab = 'create' | 'join' | 'browse';

// Active-room discovery + leaderboard need the server-side directory/profiles.
const SHOW_BROWSE = isSupabaseConfigured();

/** Durable cross-room wallet (only known once the player has a profile). */
function useWalletBalance(): number | null {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    const id = getCachedIdentity();
    if (!id) return;
    let active = true;
    void fetchProfileBalance(id).then((b) => {
      if (active) setBalance(b);
    });
    return () => {
      active = false;
    };
  }, []);
  return balance;
}

export function HomePage() {
  const navigate = useNavigate();
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const wallet = useWalletBalance();

  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState(getStoredName);
  const [code, setCode] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [listPublicly, setListPublicly] = useState(true);

  // Prefill the join code from a share link (?room=BAC-XXXX).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('room');
    if (param) {
      setCode(param.toUpperCase());
      setTab('join');
    }
  }, []);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && (tab === 'create' || code.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    if (tab === 'create') createRoom(trimmedName, undefined, listPublicly);
    else joinRoom(code, trimmedName, asSpectator);
    navigate('/room');
  };

  // Join a room picked from the live browser (uses the entered name).
  const joinFromBrowser = (roomCode: string) => {
    if (trimmedName.length === 0) return;
    joinRoom(roomCode, trimmedName);
    navigate('/room');
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`rounded-xl py-2 text-sm font-semibold transition ${
        tab === t ? 'btn-gold' : 'btn-ghost'
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-6">
      <Stage motif="fret" />

      {/* Top bar: brand + wallet */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gold/20 pb-4">
        <BeikaoLogo />
        {wallet != null && (
          <Panel className="flex items-center gap-3 !p-2 !pl-3.5">
            <Coin />
            <div className="pr-1">
              <div className="text-[10px] uppercase tracking-wider text-pearl/55">Số dư</div>
              <GoldText className="font-display text-lg font-extrabold leading-none">
                {formatChips(wallet)}
              </GoldText>
            </div>
          </Panel>
        )}
      </header>

      <div className="flex flex-1 flex-col items-center gap-8">
        {/* Hero */}
        <div className="animate-fade-up text-center">
          <h1 className="font-display text-4xl font-black tracking-tight text-pearl">Chọn sảnh chơi</h1>
          <p className="mt-2 text-sm tracking-wide text-gold/85">Bài Cào · Ba Cây — ba lá định mệnh</p>
        </div>

        <Panel gilt className={`w-full space-y-4 ${tab === 'browse' ? 'max-w-2xl' : 'max-w-sm'}`}>
          <div className={`grid gap-2 ${SHOW_BROWSE ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {tabBtn('create', 'Tạo phòng')}
            {tabBtn('join', 'Vào mã')}
            {SHOW_BROWSE && tabBtn('browse', 'Tìm phòng')}
          </div>

          <label className="block">
            <span className="text-sm text-pearl/60">Tên của bạn</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="Nhập tên…"
              className="lq-input mt-1 w-full px-3 py-2"
            />
          </label>

          {tab === 'create' && SHOW_BROWSE && (
            <label className="flex items-center gap-2 text-sm text-pearl/70">
              <input
                type="checkbox"
                checked={listPublicly}
                onChange={(e) => setListPublicly(e.target.checked)}
                className="h-4 w-4 accent-[#d9b25e]"
              />
              Cho phép tìm phòng (công khai)
            </label>
          )}

          {tab === 'join' && (
            <>
              <label className="block">
                <span className="text-sm text-pearl/60">Mã phòng</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="BAC-XXXX"
                  className="lq-input mt-1 w-full px-3 py-2 font-mono uppercase"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-pearl/70">
                <input
                  type="checkbox"
                  checked={asSpectator}
                  onChange={(e) => setAsSpectator(e.target.checked)}
                  className="h-4 w-4 accent-[#d9b25e]"
                />
                Vào xem (không chơi)
              </label>
            </>
          )}

          {tab === 'browse' ? (
            <RoomBrowser onJoin={joinFromBrowser} canJoin={trimmedName.length > 0} />
          ) : (
            <Button onClick={submit} disabled={!canSubmit} className="w-full">
              {tab === 'create' ? 'Tạo phòng & làm cái' : asSpectator ? 'Vào xem' : 'Vào phòng'}
            </Button>
          )}
        </Panel>

        {SHOW_BROWSE && <Leaderboard />}

        <p className="max-w-sm text-center text-xs text-pearl/40">
          Chip ảo, chơi cho vui. Cái (người tạo phòng) chia bài và cũng chơi như mọi người.
        </p>
      </div>
    </main>
  );
}
