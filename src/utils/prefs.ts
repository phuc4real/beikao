import { create } from 'zustand';

/**
 * Client-only cosmetic preferences (the prototype's "Tweaks", made real).
 * Persisted per browser in localStorage — never part of the protocol.
 */

export type CardBackDesign = 'drum' | 'phoenix' | 'lotus';
export type ChipStyle = 'classic' | 'gold' | 'jade';

export const CARD_BACKS: readonly CardBackDesign[] = ['drum', 'phoenix', 'lotus'];
export const CHIP_STYLES: readonly ChipStyle[] = ['classic', 'gold', 'jade'];

interface PrefsState {
  cardBack: CardBackDesign;
  chipStyle: ChipStyle;
  setCardBack: (d: CardBackDesign) => void;
  setChipStyle: (c: ChipStyle) => void;
}

const KEY = 'beikao.uiPrefs';

function load(): Pick<PrefsState, 'cardBack' | 'chipStyle'> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Record<string, string>>;
      return {
        cardBack: CARD_BACKS.includes(p.cardBack as CardBackDesign) ? (p.cardBack as CardBackDesign) : 'drum',
        chipStyle: CHIP_STYLES.includes(p.chipStyle as ChipStyle) ? (p.chipStyle as ChipStyle) : 'classic',
      };
    }
  } catch {
    /* storage unavailable / corrupt — fall through to defaults */
  }
  return { cardBack: 'drum', chipStyle: 'classic' };
}

function persist(s: Pick<PrefsState, 'cardBack' | 'chipStyle'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ cardBack: s.cardBack, chipStyle: s.chipStyle }));
  } catch {
    /* degrade silently */
  }
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...load(),
  setCardBack: (cardBack) => {
    set({ cardBack });
    persist(get());
  },
  setChipStyle: (chipStyle) => {
    set({ chipStyle });
    persist(get());
  },
}));
