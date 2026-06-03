import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Panel } from '@/components/ui';
import { useGame } from '@/app/store/store';
import { getStoredName } from '@/utils/storage';

type Tab = 'create' | 'join';

export function HomePage() {
  const navigate = useNavigate();
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);

  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState(getStoredName);
  const [code, setCode] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);

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
    if (tab === 'create') createRoom(trimmedName);
    else joinRoom(code, trimmedName, asSpectator);
    navigate('/room');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-widest text-amber-400">BÀI CÀO</h1>
        <p className="mt-2 text-white/60">Chơi bài cào nhiều người · 2–16 người</p>
      </div>

      <Panel className="w-full max-w-sm space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTab('create')}
            className={`rounded-lg py-2 font-semibold ${tab === 'create' ? 'bg-amber-400 text-black' : 'bg-white/10'}`}
          >
            Tạo phòng
          </button>
          <button
            onClick={() => setTab('join')}
            className={`rounded-lg py-2 font-semibold ${tab === 'join' ? 'bg-amber-400 text-black' : 'bg-white/10'}`}
          >
            Vào phòng
          </button>
        </div>

        <label className="block">
          <span className="text-sm text-white/60">Tên của bạn</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Nhập tên…"
            className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 outline-none ring-amber-400 focus:ring-2"
          />
        </label>

        {tab === 'join' && (
          <>
            <label className="block">
              <span className="text-sm text-white/60">Mã phòng</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="BAC-XXXX"
                className="mt-1 w-full rounded-lg bg-black/30 px-3 py-2 font-mono uppercase outline-none ring-amber-400 focus:ring-2"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={asSpectator}
                onChange={(e) => setAsSpectator(e.target.checked)}
                className="h-4 w-4 accent-amber-400"
              />
              Vào xem (không chơi)
            </label>
          </>
        )}

        <Button onClick={submit} disabled={!canSubmit} className="w-full">
          {tab === 'create' ? 'Tạo phòng & làm cái' : asSpectator ? 'Vào xem' : 'Vào phòng'}
        </Button>
      </Panel>

      <p className="max-w-sm text-center text-xs text-white/40">
        Chip ảo, chơi cho vui. Cái (người tạo phòng) chia bài và cũng chơi như mọi người.
      </p>
    </main>
  );
}
