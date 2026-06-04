/** Deterministic per-seat avatar/chip colours (from the design handoff). */
const AVA_COLORS = ['#b3242b', '#3f9d77', '#c79a44', '#8a4fb9', '#3a7bd5', '#d98a2b', '#2bb3a3', '#b94f8a'];

export function avatarColor(idx: number): string {
  return AVA_COLORS[((idx % AVA_COLORS.length) + AVA_COLORS.length) % AVA_COLORS.length]!;
}
