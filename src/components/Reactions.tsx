import { useGame } from '@/app/store/store';
import { REACTIONS } from '@/network/protocol/messages';

/** Tappable emoji palette — sends a reaction to the table. */
export function ReactionBar() {
  const sendReaction = useGame((s) => s.sendReaction);
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {REACTIONS.map((e) => (
        <button
          key={e}
          onClick={() => sendReaction(e)}
          className="rounded-lg bg-white/5 px-2 py-1 text-xl transition hover:bg-white/15 active:scale-90"
          aria-label={`React ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** Overlay of recently-sent reactions floating up and fading. */
export function FloatingReactions() {
  const reactions = useGame((s) => s.room?.reactions ?? []);
  // Only animate genuinely recent reactions, so a reconnect snapshot doesn't
  // replay a burst of old ones.
  const now = Date.now();
  const recent = reactions.filter((r) => now - r.ts < 3400);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center">
      <div className="relative h-0 w-full max-w-3xl">
        {recent.map((r, i) => (
          <div
            key={r.id}
            className="float-up absolute flex flex-col items-center"
            style={{ left: `${10 + ((i * 53) % 80)}%` }}
          >
            <span className="text-3xl drop-shadow">{r.emoji}</span>
            <span className="text-[10px] text-white/60">{r.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
