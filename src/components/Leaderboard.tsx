import { useCallback, useEffect, useState } from 'react';
import { GoldText, Panel } from '@/components/ui';
import { fetchLeaderboard, type LeaderboardRow } from '@/network/supabase/leaderboard';
import { getCachedIdentity } from '@/network/supabase/auth';
import { formatChips } from '@/utils/money';

const RANK = ['🥇', '🥈', '🥉'];

function netLabel(n: number): string {
  return n > 0 ? `+${formatChips(n)}` : formatChips(n);
}

/** Top players by cumulative net winnings (Phase 3d). */
export function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const me = getCachedIdentity();

  const refresh = useCallback(async () => {
    setLoading(true);
    setRows(await fetchLeaderboard());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Panel gilt className="w-full max-w-sm space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold">
          🏆 <GoldText>Bảng xếp hạng</GoldText>
        </h2>
        <button onClick={() => void refresh()} className="text-xs text-pearl/50 hover:text-pearl">
          ↻ Làm mới
        </button>
      </div>
      <p className="text-xs text-pearl/40">Lãi ròng · thắng/ván · 💰 ví (chip mang theo giữa các phòng)</p>

      {loading ? (
        <p className="py-4 text-center text-sm text-pearl/40">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-pearl/40">Chưa có dữ liệu. Chơi vài ván để lên bảng!</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${
                r.id === me ? 'bg-gold/15 ring-1 ring-gold/40' : 'bg-black/25'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 text-center font-display font-bold text-gold">
                  {RANK[i] ?? i + 1}
                </span>
                <span className="truncate">{r.name ?? 'Người chơi'}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end leading-tight">
                <span className="flex items-center gap-2">
                  <span className={r.total_net >= 0 ? 'text-jade' : 'text-red-400'}>{netLabel(r.total_net)}</span>
                  <span className="text-pearl/40">
                    {r.wins}/{r.rounds_played}
                  </span>
                </span>
                {/* Durable cross-room wallet (chips follow the player between rooms). */}
                <span className="text-xs text-gold/80">💰 {formatChips(r.balance)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
