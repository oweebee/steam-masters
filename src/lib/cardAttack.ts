// Règle unique pour les statistiques issues des avis Steam.
// Une note exceptionnelle (98 % ou plus) vaut toujours l'ATK maximale 10.
export const MAX_ATK_REVIEW_SCORE = 98;

export function atkFromReviewScore(reviewScore: number): number {
  const score = Number.isFinite(reviewScore) ? Math.max(0, Math.min(100, Math.floor(reviewScore))) : 0;
  return score >= MAX_ATK_REVIEW_SCORE ? 10 : Math.floor(score / 10);
}

export function hasMaxAtkReviewScore(reviewScore: number | null | undefined): boolean {
  return typeof reviewScore === "number" && reviewScore >= MAX_ATK_REVIEW_SCORE;
}
