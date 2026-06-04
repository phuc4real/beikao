import { useEffect, useRef, useState } from 'react';
import { fetchDirectory, subscribeDirectory, type DirectoryRoom } from '@/network/supabase/rooms';

const MODE_LABEL: Record<DirectoryRoom['mode'], string> = {
  CAO_CAI: 'Cào cái',
  CAO_RUA: 'Cào rùa',
};

/** Live list of public rooms in the lobby; re-fetches on any room change. */
function useRoomDirectory() {
  const [rooms, setRooms] = useState<DirectoryRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const next = await fetchDirectory();
      if (active) {
        setRooms(next);
        setLoading(false);
      }
    };
    void refresh();
    const unsub = subscribeDirectory(() => {
      // Coalesce bursts of row changes into one re-fetch.
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void refresh(), 300);
    });
    return () => {
      active = false;
      if (debounce.current) clearTimeout(debounce.current);
      unsub();
    };
  }, []);

  return { rooms, loading };
}

/** 8-point star crest (from the handoff's lobby tier icons), themed per mode. */
function TierCrest({ mode }: { mode: DirectoryRoom['mode'] }) {
  const [c0, c1] = mode === 'CAO_RUA' ? ['#6fd3a8', '#1f6b4c'] : ['#f4e3a8', '#c79a44'];
  return (
    <svg viewBox="0 0 48 48" width="46" height="46" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={`tg-${mode}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c0} />
          <stop offset="100%" stopColor={c1} />
        </linearGradient>
      </defs>
      <path
        d="M24 3l5.5 4h7l2 6.5 4.5 5-2 6.5 1 7-6 3-3.5 6-6-2.5L20 48l-3.5-6-6-3 1-7-2-6.5 4.5-5 2-6.5h7z"
        fill={`url(#tg-${mode})`}
        stroke="rgba(0,0,0,.25)"
        strokeWidth="1"
      />
      <circle cx="24" cy="22" r="9" fill="rgba(255,255,255,.25)" stroke="rgba(0,0,0,.2)" />
      <text x="24" y="27" textAnchor="middle" fontSize="11" fontWeight="800" fill="#3a2606" fontFamily="serif">
        爻
      </text>
    </svg>
  );
}

interface Props {
  /** Join the chosen room. Enabled only when the player has entered a name. */
  onJoin: (code: string) => void;
  canJoin: boolean;
}

export function RoomBrowser({ onJoin, canJoin }: Props) {
  const { rooms, loading } = useRoomDirectory();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = query
    ? rooms.filter((r) => (r.name ?? '').toLowerCase().includes(query) || r.code.toLowerCase().includes(query))
    : rooms;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-pearl/60">
          <span className="lb-live animate-pulse" /> Phòng đang mở
        </span>
        <label className="flex min-w-0 flex-1 max-w-56 items-center gap-2">
          <span className="text-lg text-gold" aria-hidden>
            ⌕
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm sảnh..."
            className="lq-input w-full min-w-0 px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      {!canJoin && rooms.length > 0 && <p className="text-xs text-gold-light/80">Nhập tên ở trên để vào phòng.</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-pearl/40">Đang tải…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-pearl/40">
          {rooms.length === 0 ? 'Chưa có phòng công khai nào. Tạo một phòng để bắt đầu!' : 'Không tìm thấy sảnh nào.'}
        </p>
      ) : (
        <ul className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
          {list.map((r) => {
            const full = r.player_count >= r.max_players;
            const hot = !full && r.player_count / r.max_players >= 0.75;
            return (
              <li key={r.code}>
                <button
                  className="lb-room panel panel-gilt w-full"
                  onClick={() => onJoin(r.code)}
                  disabled={!canJoin || full}
                >
                  {hot && <span className="lb-hot">HOT</span>}
                  <div className="flex items-center gap-3">
                    <TierCrest mode={r.mode} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-lg font-bold leading-tight text-pearl">
                        {r.name ?? r.code}
                      </div>
                      <div className="text-xs tracking-wide text-gold">{MODE_LABEL[r.mode]}</div>
                    </div>
                  </div>
                  <div className="flex justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-pearl/50">Mã phòng</span>
                      <span className="font-mono text-sm font-semibold text-pearl-2">{r.code}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-pearl/50">Người chơi</span>
                      <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold">
                        <span className="lb-live" />
                        {r.player_count}/{r.max_players}
                      </span>
                    </div>
                  </div>
                  <div className="lb-bar">
                    <div
                      className="lb-bar-fill"
                      style={{ width: `${Math.min(100, (r.player_count / r.max_players) * 100)}%` }}
                    />
                  </div>
                  <span className="lb-enter">{full ? 'Sảnh đã đầy' : 'Vào sảnh →'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
