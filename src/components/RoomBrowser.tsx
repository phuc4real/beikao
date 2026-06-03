import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
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

interface Props {
  /** Join the chosen room. Enabled only when the player has entered a name. */
  onJoin: (code: string) => void;
  canJoin: boolean;
}

export function RoomBrowser({ onJoin, canJoin }: Props) {
  const { rooms, loading } = useRoomDirectory();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-white/60">
        <span>Phòng đang mở</span>
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> trực tiếp
        </span>
      </div>

      {!canJoin && rooms.length > 0 && (
        <p className="text-xs text-amber-300/80">Nhập tên ở trên để vào phòng.</p>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-white/40">Đang tải…</p>
      ) : rooms.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">
          Chưa có phòng công khai nào. Tạo một phòng để bắt đầu!
        </p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {rooms.map((r) => {
            const full = r.player_count >= r.max_players;
            return (
              <li
                key={r.code}
                className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name ?? r.code}</p>
                  <p className="text-xs text-white/50">
                    <span className="font-mono">{r.code}</span> · {MODE_LABEL[r.mode]} ·{' '}
                    {r.player_count}/{r.max_players}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => onJoin(r.code)}
                  disabled={!canJoin || full}
                  className="shrink-0 px-3 py-1.5 text-sm"
                >
                  {full ? 'Đầy' : 'Vào'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
