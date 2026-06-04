import { useEffect, useState } from 'react';
import { verifyRound, type FairnessStatus } from '@/features/room/fairness';
import type { RoundView } from '@/features/room/types';

function useFairness(round: RoundView | null): FairnessStatus {
  const [status, setStatus] = useState<FairnessStatus>({ state: 'pending' });
  const key = round ? `${round.roundNumber}:${round.hostSeedRevealed ?? ''}` : '';

  useEffect(() => {
    if (!round || !round.hostSeedRevealed) {
      setStatus({ state: 'pending' });
      return;
    }
    let cancelled = false;
    setStatus({ state: 'verifying' });
    verifyRound(round).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
    // Re-verify only when the round or its revealed seed changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return status;
}

export function FairnessBadge({ round }: { round: RoundView }) {
  const status = useFairness(round);
  const [open, setOpen] = useState(false);

  let chip: { text: string; cls: string };
  switch (status.state) {
    case 'pending':
      chip = { text: '🔒 Bộ bài đã niêm phong', cls: 'pill text-pearl/70' };
      break;
    case 'verifying':
      chip = { text: '… đang xác minh', cls: 'pill text-pearl/70' };
      break;
    case 'ok':
      chip = { text: '✓ Đã xác minh công bằng', cls: 'bg-jade-deep/40 text-jade ring-1 ring-jade/40' };
      break;
    case 'failed':
      chip = { text: `✗ ${status.reason}`, cls: 'bg-red-600/40 text-red-200' };
      break;
  }

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full px-2.5 py-1 font-medium ${chip.cls}`}
        title="Bằng chứng công bằng (provably fair)"
      >
        {chip.text}
      </button>
      {open && (
        <div className="mt-1 space-y-1 break-all rounded-lg bg-black/40 p-2 font-mono text-[10px] text-white/60">
          <div>commit: {round.deckCommitment ?? '—'}</div>
          <div>host seed: {round.hostSeedRevealed ?? '(ẩn đến khi lật)'}</div>
          <div>player seeds: {Object.keys(round.playerSeeds ?? {}).length}</div>
        </div>
      )}
    </div>
  );
}
