// One clock for the replay, canvas particles, damage labels and training bot.
export const BATTLE_ANIMATION_SPEED = 0.8;
export const CARD_REVEAL_GAP_MS = 180;
export const CARD_ATTACK_GAP_MS = 520;
export const PHASE_PAUSE_MS = 200;
export function battleAnimationTiming(cardCount = 1) {
  const stagger = Math.max(0, cardCount - 1) * CARD_ATTACK_GAP_MS;
  const revealAt = 800 / BATTLE_ANIMATION_SPEED;
  const flightDelay = 720 / BATTLE_ANIMATION_SPEED + stagger + PHASE_PAUSE_MS;
  const impactDelay = flightDelay + 1000 / BATTLE_ANIMATION_SPEED;
  return {
    revealAt, flightDelay, impactDelay,
    damageDuration: 1450 / BATTLE_ANIMATION_SPEED,
    fadeAt: revealAt + impactDelay + PHASE_PAUSE_MS,
    completeAt: Math.ceil(revealAt + flightDelay + 2450 / BATTLE_ANIMATION_SPEED + PHASE_PAUSE_MS),
  };
}
