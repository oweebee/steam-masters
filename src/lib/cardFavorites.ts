export function confirmedFavoriteCardIds(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : []);
}

export function assertFavoriteCardsConfirmed(cards: readonly { id: string; isPinned: boolean }[], confirmedIds: Set<string>) {
  if (cards.some((card) => card.isPinned && !confirmedIds.has(card.id))) {
    throw new Error("Une carte favorite nécessite une confirmation avant cette action");
  }
}
