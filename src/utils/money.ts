/** Chip amount with Vietnamese digit grouping: 2480000 → "2.480.000". */
export function formatChips(n: number): string {
  return n.toLocaleString('vi-VN');
}

/** Compact money label for room cards: 0 → "Miễn phí", 50000 → "50K", 1000000 → "1M". */
export function moneyShort(n: number): string {
  if (n === 0) return 'Miễn phí';
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}
