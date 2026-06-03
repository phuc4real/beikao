import { useState } from 'react';
import { useGame } from '@/app/store/store';
import { Button } from '@/components/ui';
import type { RoomConfig } from '@/features/room/types';

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-white/70">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded-lg bg-black/40 px-2 py-1.5 text-right outline-none ring-amber-400 focus:ring-2"
        />
        {suffix && <span className="text-sm text-white/40">{suffix}</span>}
      </span>
    </label>
  );
}

export function SettingsModal({ config, onClose }: { config: RoomConfig; onClose: () => void }) {
  const updateConfig = useGame((s) => s.updateConfig);
  const [draft, setDraft] = useState<RoomConfig>(config);

  const set = <K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = () => {
    updateConfig({
      mode: draft.mode,
      minBet: Math.max(1, Math.round(draft.minBet)),
      maxBet: Math.max(draft.minBet, Math.round(draft.maxBet)),
      bettingSeconds: Math.min(120, Math.max(5, Math.round(draft.bettingSeconds))),
      startingBalance: Math.max(1, Math.round(draft.startingBalance)),
      baTienPayout: Math.min(10, Math.max(1, draft.baTienPayout)),
      caoPayout: Math.min(10, Math.max(1, draft.caoPayout)),
      maxPlayers: Math.min(16, Math.max(2, Math.round(draft.maxPlayers))),
      allowRebuy: draft.allowRebuy,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl bg-felt-dark p-5 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">Cài đặt phòng</h2>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-white/70">Chế độ</span>
          <select
            value={draft.mode}
            onChange={(e) => set('mode', e.target.value as RoomConfig['mode'])}
            className="rounded-lg bg-black/40 px-2 py-1.5 outline-none"
          >
            <option value="CAO_CAI">Cào cái</option>
            <option value="CAO_RUA">Cào rùa (hũ)</option>
          </select>
        </label>

        <NumberField label="Cược tối thiểu" value={draft.minBet} onChange={(v) => set('minBet', v)} min={1} max={100000} suffix="chip" />
        <NumberField label="Cược tối đa" value={draft.maxBet} onChange={(v) => set('maxBet', v)} min={1} max={100000} suffix="chip" />
        <NumberField label="Thời gian cược" value={draft.bettingSeconds} onChange={(v) => set('bettingSeconds', v)} min={5} max={120} suffix="giây" />
        <NumberField label="Chip ban đầu" value={draft.startingBalance} onChange={(v) => set('startingBalance', v)} min={1} max={1000000} suffix="chip" />
        <NumberField label="Thưởng ba tiên" value={draft.baTienPayout} onChange={(v) => set('baTienPayout', v)} min={1} max={10} step={0.5} suffix="×" />
        <NumberField label="Thưởng cào (9)" value={draft.caoPayout} onChange={(v) => set('caoPayout', v)} min={1} max={10} step={0.5} suffix="×" />
        <NumberField label="Số người tối đa" value={draft.maxPlayers} onChange={(v) => set('maxPlayers', v)} min={2} max={16} />

        <p className="text-xs text-white/40">
          Đổi “chip ban đầu” và “số người tối đa” chỉ áp dụng cho người vào sau.
        </p>

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" onClick={save}>
            Lưu
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
}
