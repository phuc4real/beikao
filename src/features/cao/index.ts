/**
 * Bài cào game engine — pure, deterministic, no I/O.
 *
 * Public surface used by the authority (host) to run a round:
 *   createDeck → shuffle(seed) → dealFromDeck → evaluateHand → compareHands → settle*
 */
export * from './cards';
export * from './deck';
export * from './hand';
export * from './deal';
export * from './settlement';
