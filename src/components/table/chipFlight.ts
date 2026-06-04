/**
 * Cosmetic chip-flight: when a bet is placed, a few chips fly from the betting
 * bar onto the felt (where the pot sits) to give instant feedback that masks
 * the ~1s server round trip. Purely presentational — imperative DOM + Web
 * Animations API, never part of state or the protocol.
 */

const CHIP_SIZE = 52; // matches .chip-btn
const FLIGHT_MS = 700;
const STAGGER_MS = 90;
const CHIP_COUNT = 3;

/** Fly chips from `from` (the bet button) to the pot. `label` rides the top chip. */
export function flyChipsToPot(from: HTMLElement, chipStyle: string, label: string): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  // The pot only renders once a bet lands, so aim at the felt centre (= where
  // the centred pot appears) and fall back to the existing pot stack if shown.
  const target = document.querySelector('.pot-chips') ?? document.querySelector('.felt-inner');
  if (!target || typeof from.animate !== 'function') return;

  const f = from.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const sx = f.left + f.width / 2 - CHIP_SIZE / 2;
  const sy = f.top + f.height / 2 - CHIP_SIZE / 2;
  const dx = t.left + t.width / 2 - CHIP_SIZE / 2 - sx;
  const dy = t.top + t.height / 2 - CHIP_SIZE / 2 - sy;

  for (let i = 0; i < CHIP_COUNT; i++) {
    const chip = document.createElement('div');
    chip.className = `chip-btn ${chipStyle} chip-fly`;
    chip.style.left = `${sx}px`;
    chip.style.top = `${sy}px`;
    if (i === CHIP_COUNT - 1) {
      const face = document.createElement('span');
      face.className = 'chip-face';
      face.textContent = label;
      chip.appendChild(face);
    }
    document.body.appendChild(chip);

    // Deterministic per-chip scatter so the stack doesn't land in one point.
    const scatter = (i - (CHIP_COUNT - 1) / 2) * 10;
    const anim = chip.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${dx * 0.5 + scatter}px, ${dy * 0.5 - 70}px) scale(0.85) rotate(${scatter * 8}deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${dx + scatter}px, ${dy}px) scale(0.45) rotate(${scatter * 14}deg)`, opacity: 0.9 },
        { transform: `translate(${dx + scatter}px, ${dy}px) scale(0.45)`, opacity: 0 },
      ],
      {
        duration: FLIGHT_MS,
        delay: i * STAGGER_MS,
        easing: 'cubic-bezier(0.22, 0.9, 0.3, 1)',
        fill: 'forwards',
      },
    );
    const cleanup = () => chip.remove();
    anim.onfinish = cleanup;
    anim.oncancel = cleanup;
  }
}
