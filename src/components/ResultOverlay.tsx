import { useEffect, useRef, useState } from 'react';
import { selectMe, useGame } from '@/app/store/store';
import { Button, GoldRule, GoldText } from '@/components/ui';
import { TableCard } from '@/components/TableCard';
import { handLabel, isCaoHand } from '@/components/handLabel';
import { seatOutcome } from '@/components/table/outcome';
import { revealSettleMs } from '@/components/table/seatGeometry';
import { ANIM } from '@/config/animation';
import { formatChips } from '@/utils/money';
import type { RoundView } from '@/features/room/types';

/**
 * The design's Result screen, adapted to multiplayer reality: a dismissible
 * overlay on the table once the result lands (the cái drives "Chơi tiếp", so
 * there is no route change). Appears after the flip choreography finishes;
 * unmounts automatically when the next round starts (status → BETTING).
 */
export function ResultOverlay({ round }: { round: RoundView }) {
  const me = useGame(selectMe);
  const players = useGame((s) => s.room?.players ?? []);
  const mode = useGame((s) => s.room?.config.mode ?? 'CAO_CAI');
  const isHost = useGame((s) => s.isHost());
  const nextRound = useGame((s) => s.nextRound);
  const backToLobby = useGame((s) => s.backToLobby);
  const nextPending = useGame((s) => s.pending.next);
  const lobbyPending = useGame((s) => s.pending.lobby);

  const result = round.result;
  const playerCount = players.length;

  // Let the table's deal flight + flip drama play out first (the cái flips last).
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const roundNumber = round.roundNumber;
  const hasResult = !!result;
  // Read the player count from a ref so the schedule below depends ONLY on the
  // round: a player joining/leaving mid-REVEAL changes playerCount, and if that
  // were a dependency the effect would re-run and re-show an already-dismissed
  // overlay. The count is only needed to size the one-shot settle delay.
  const playerCountRef = useRef(playerCount);
  playerCountRef.current = playerCount;
  useEffect(() => {
    setShown(false);
    setDismissed(false);
    if (!hasResult) return;
    const t = setTimeout(() => setShown(true), revealSettleMs(playerCountRef.current));
    return () => clearTimeout(t);
  }, [hasResult, roundNumber]);

  if (!result || !shown || dismissed) return null;

  const myHand = me ? round.hands?.[me.id] : undefined;
  const delta = me ? (result.deltas[me.id] ?? 0) : 0;
  const outcome = me ? seatOutcome(me, round) : null;
  const won = outcome === 'win';
  const lost = outcome === 'lose';

  const pot = Object.values(round.bets).reduce((a, v) => a + v, 0);
  const cai = players.find((p) => p.isCai);
  const ruaWinner = result.potWinner ? players.find((p) => p.id === result.potWinner) : undefined;
  const nameOf = (id?: string) => players.find((p) => p.id === id)?.name ?? '—';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setDismissed(true)}>
      {won && <div className="result-rays" />}
      <div
        className="panel panel-gilt relative z-10 flex w-full max-w-md animate-pop flex-col items-center px-8 pb-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ribbon overlapping the top edge */}
        <div className="-mt-4 mb-2">
          <div className={`result-ribbon ${won ? 'win' : lost ? 'lose' : 'neutral'}`}>
            {won ? 'THẮNG LỚN' : lost ? 'THUA CUỘC' : 'KẾT QUẢ'}
          </div>
        </div>

        <h1 className="my-2 font-display text-3xl font-extrabold leading-tight">
          {won ? <GoldText>Chúc mừng!</GoldText> : lost ? <span className="text-pearl-2">May mắn lần sau</span> : <span className="text-pearl">Ván {round.roundNumber}</span>}
        </h1>

        {myHand && (
          <div className="my-3 flex items-end">
            {[0, 1, 2].map((i) => (
              <div
                key={`result-${round.roundNumber}-${i}`}
                className="hand-card cw-md"
                style={{ transform: `rotate(${(i - 1) * 7}deg)`, zIndex: i }}
              >
                <TableCard
                  card={myHand.cards[i]}
                  revealed
                  size="md"
                  flipDelayMs={i * ANIM.cardFlipStaggerMs + ANIM.replayLeadMs}
                  className={won ? 'card-glow' : lost ? 'card-dim' : ''}
                />
              </div>
            ))}
          </div>
        )}

        {myHand && (
          <div className={`result-pts my-2 font-display text-lg font-bold text-pearl ${isCaoHand(myHand) ? 'cao' : ''}`}>
            {myHand.baTien ? 'BA TIÊN' : myHand.score === 9 ? 'CÀO CHÍN — 9 điểm' : handLabel(myHand)}
          </div>
        )}

        <GoldRule className="my-3 w-full" />

        <div className="mb-5 flex w-full flex-col gap-3 text-sm">
          {mode === 'CAO_RUA' ? (
            <>
              <ResultRow k="Người thắng">
                {ruaWinner ? (
                  <>
                    {ruaWinner.id === me?.id ? 'Bạn' : ruaWinner.name}
                    {round.hands?.[ruaWinner.id] && <> · {handLabel(round.hands[ruaWinner.id]!)}</>}
                  </>
                ) : (
                  '—'
                )}
              </ResultRow>
              <ResultRow k="Tổng cược">
                <GoldText className="font-bold">{formatChips(pot)}</GoldText>
              </ResultRow>
            </>
          ) : (
            <>
              <ResultRow k="Cái">
                {nameOf(cai?.id)}
                {cai && round.hands?.[cai.id] && <> · {handLabel(round.hands[cai.id]!)}</>}
              </ResultRow>
              {me && !me.isCai && (
                <ResultRow k="Cược của bạn">{formatChips(round.bets[me.id] ?? 0)}</ResultRow>
              )}
            </>
          )}

          {me && delta !== 0 && (
            <ResultRow k={delta > 0 ? 'Bạn nhận' : 'Bạn mất'}>
              <span className={`font-display text-2xl font-extrabold ${delta > 0 ? 'text-jade' : 'text-[#d9706f]'}`}>
                {delta > 0 ? '+' : ''}
                {formatChips(delta)}
              </span>
            </ResultRow>
          )}
        </div>

        <div className="flex w-full gap-2">
          {isHost ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={backToLobby} loading={lobbyPending} disabled={nextPending}>
                Về sảnh
              </Button>
              <Button className="flex-1" onClick={nextRound} loading={nextPending} disabled={lobbyPending}>
                Chơi tiếp →
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="flex-1" onClick={() => setDismissed(true)}>
              Đóng — chờ cái mở ván mới
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-pearl/60">{k}</span>
      <span className="text-right font-display font-bold text-pearl">{children}</span>
    </div>
  );
}
