import { avatarColor } from '@/utils/colors';

/**
 * Round initial avatar with a deterministic per-seat colour and an optional
 * gold "Cái" (dealer) badge — shared by the lobby list, table seats and chat.
 */
export function Avatar({
  name,
  idx,
  isCai = false,
  small = false,
}: {
  name: string;
  idx: number;
  isCai?: boolean;
  small?: boolean;
}) {
  const c = avatarColor(idx);
  return (
    <span
      className={`seat-ava ${small ? 'seat-ava-sm' : ''}`}
      style={{ background: `linear-gradient(150deg, ${c}, ${c}99)` }}
      aria-hidden
    >
      <span>{(name.trim()[0] ?? '?').toUpperCase()}</span>
      {isCai && <span className="seat-dealer">Cái</span>}
    </span>
  );
}
