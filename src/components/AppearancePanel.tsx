import type { CSSProperties } from 'react';
import { Panel } from '@/components/ui';
import { CardBack } from '@/components/cards/CardBack';
import { CARD_BACKS, CHIP_STYLES, usePrefs, type CardBackDesign, type ChipStyle } from '@/utils/prefs';

const BACK_LABEL: Record<CardBackDesign, string> = {
  drum: 'Trống đồng',
  phoenix: 'Phượng hoàng',
  lotus: 'Hoa sen',
};
const CHIP_LABEL: Record<ChipStyle, string> = {
  classic: 'Cổ điển',
  gold: 'Vàng',
  jade: 'Ngọc',
};

/** Personal cosmetic settings (card back + chip style) — localStorage only. */
export function AppearancePanel() {
  const cardBack = usePrefs((s) => s.cardBack);
  const chipStyle = usePrefs((s) => s.chipStyle);
  const setCardBack = usePrefs((s) => s.setCardBack);
  const setChipStyle = usePrefs((s) => s.setChipStyle);

  return (
    <Panel gilt className="w-72 space-y-4">
      <h3 className="font-display font-bold text-gold">🎴 Giao diện</h3>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-pearl/55">Mặt sau bài</div>
        <div className="flex gap-3">
          {CARD_BACKS.map((d) => (
            <button
              key={d}
              onClick={() => setCardBack(d)}
              aria-pressed={cardBack === d}
              title={BACK_LABEL[d]}
              className={`relative overflow-hidden rounded-md transition ${
                cardBack === d ? 'ring-2 ring-gold-light' : 'opacity-70 hover:opacity-100'
              }`}
              style={{ '--w': '46px', width: 46, height: 64 } as CSSProperties}
            >
              <CardBack design={d} />
            </button>
          ))}
        </div>
        <div className="text-xs text-pearl/60">{BACK_LABEL[cardBack]}</div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-pearl/55">Kiểu chip cược</div>
        <div className="flex gap-3">
          {CHIP_STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setChipStyle(s)}
              aria-pressed={chipStyle === s}
              title={CHIP_LABEL[s]}
              className={`chip-btn ${s} ${chipStyle === s ? 'sel' : ''}`}
            >
              <span className="chip-face">{s === chipStyle ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        <div className="text-xs text-pearl/60">{CHIP_LABEL[chipStyle]}</div>
      </div>
    </Panel>
  );
}
