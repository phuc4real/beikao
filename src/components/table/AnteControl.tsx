import { useEffect, useState } from 'react';
import { useGame } from '@/app/store/store';
import { Button, GoldText } from '@/components/ui';
import { usePrefs } from '@/utils/prefs';
import { formatChips, moneyShort } from '@/utils/money';

/** Ante presets the cái can tap directly (these SET the value, not add to it). */
const PRESETS = [10, 20, 50, 100, 200, 500];
const ANTE_MIN = 1;
const ANTE_MAX = 100_000; // matches the settings form's ceiling

/**
 * Cào rùa: the cái tunes the shared per-player ante right on the table — in
 * LOBBY and between rounds at REVEAL (the authority accepts UPDATE_CONFIG
 * anywhere outside BETTING) — no settings drawer needed. Presentation only:
 * confirming sends the existing UPDATE_CONFIG intention with the new `minBet`
 * (which IS the rùa ante; the authority bumps maxBet along if needed).
 */
export function AnteControl() {
  const room = useGame((s) => s.room)!;
  const updateConfig = useGame((s) => s.updateConfig);
  const pending = useGame((s) => s.pending.config);
  const chipStyle = usePrefs((s) => s.chipStyle);
  const ante = room.config.minBet;

  const [draft, setDraft] = useState(ante);
  // Server confirmed the change (or it arrived from elsewhere) — adopt it.
  useEffect(() => setDraft(ante), [ante]);
  const dirty = draft !== ante;
  const clamp = (v: number) => Math.min(ANTE_MAX, Math.max(ANTE_MIN, Math.round(v)));

  return (
    <div className="bet-bar panel panel-gilt w-full max-w-3xl justify-center">
      <div className="bet-chips" role="group" aria-label="Chọn nhanh mức cược">
        {PRESETS.map((v) => (
          <button
            key={v}
            className={`chip-btn ${chipStyle}`}
            onClick={() => setDraft(v)}
            aria-pressed={draft === v}
            aria-label={`Mức cược ${moneyShort(v)}`}
          >
            <span className="chip-face">{moneyShort(v)}</span>
          </button>
        ))}
      </div>

      <div className="bet-current">
        <span className="bet-current-k">Mức cược / người</span>
        <GoldText className="bet-current-v">{formatChips(draft)}</GoldText>
        <span className="mt-0.5 flex items-center gap-1">
          <button
            className="btn-ghost rounded-md px-2 text-sm font-bold"
            onClick={() => setDraft((v) => clamp(v - 10))}
            aria-label="Giảm mức cược"
          >
            −
          </button>
          <button
            className="btn-ghost rounded-md px-2 text-sm font-bold"
            onClick={() => setDraft((v) => clamp(v + 10))}
            aria-label="Tăng mức cược"
          >
            +
          </button>
        </span>
      </div>

      <Button
        className="px-6 py-3"
        onClick={() => updateConfig({ minBet: clamp(draft) })}
        disabled={!dirty}
        loading={pending}
      >
        {dirty ? 'Đổi mức cược' : 'Mức cược hiện tại'}
      </Button>
    </div>
  );
}
