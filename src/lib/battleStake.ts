import type { Prisma } from "@prisma/client";
import { activeTradeWhere } from "@/lib/tradeExpiry";

export function parseStakeCoins(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000) {
    throw new Error("Mise invalide : 0 à 1 000 000 pièces");
  }
  return value as number;
}

export function parseStakeCardId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Carte misée invalide");
  return value;
}

export async function stakedCardCount(tx: Prisma.TransactionClient, cardIds: string[]): Promise<number> {
  if (!cardIds.length) return 0;
  return tx.battle.count({ where: {
    status: { in: ["PENDING", "ACTIVE"] },
    OR: [{ challengerStakeCardId: { in: cardIds } }, { opponentStakeCardId: { in: cardIds } }],
  } });
}

export async function activeDeckCardCount(tx: Prisma.TransactionClient, userId: string, cardIds: string[]): Promise<number> {
  if (!cardIds.length) return 0;
  const ids = new Set(cardIds);
  const active = await tx.battle.findMany({
    where: { status: "ACTIVE", OR: [{ challengerId: userId }, { opponentId: userId }] },
    select: { challengerId: true, challengerDeck: true, opponentDeck: true },
  });
  return active.reduce((count, battle) => {
    const deck = battle.challengerId === userId ? battle.challengerDeck : battle.opponentDeck;
    return count + (Array.isArray(deck) ? deck.filter((item) => typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" && ids.has(item.id)).length : 0);
  }, 0);
}

export async function assertStakeCardAvailable(tx: Prisma.TransactionClient, userId: string, cardId: string | null): Promise<void> {
  if (!cardId) return;
  const card = await tx.card.findFirst({ where: { id: cardId, userId }, select: { id: true } });
  if (!card) throw new Error("La carte misée ne t'appartient plus");
  const [trades, auctions, battles] = await Promise.all([
    tx.tradeCard.count({ where: { cardId, trade: activeTradeWhere() } }),
    tx.auction.count({ where: { cardId, status: "ACTIVE" } }),
    stakedCardCount(tx, [cardId]),
  ]);
  if (trades || auctions || battles) throw new Error("Cette carte est déjà engagée ailleurs");
  if (await activeDeckCardCount(tx, userId, [cardId])) throw new Error("Cette carte est déjà jouée dans un combat actif");
}

export async function settleBattleStake(tx: Prisma.TransactionClient, stake: {
  challengerId: string; opponentId: string; challengerStakeCoins: number; opponentStakeCoins: number;
  challengerStakeCardId: string | null; opponentStakeCardId: string | null;
}, winnerId: string): Promise<void> {
  const total = stake.challengerStakeCoins + stake.opponentStakeCoins;
  for (const [cardId, ownerId] of [[stake.challengerStakeCardId, stake.challengerId], [stake.opponentStakeCardId, stake.opponentId]] as const) {
    if (!cardId) continue;
    const card = await tx.card.findFirst({ where: { id: cardId, userId: ownerId }, select: { id: true } });
    if (!card) throw new Error("Carte misée introuvable : résultat non validé");
    if (ownerId !== winnerId) {
      const moved = await tx.card.updateMany({ where: { id: cardId, userId: ownerId }, data: { userId: winnerId, isPinned: false } });
      if (moved.count !== 1) throw new Error("Transfert de la mise impossible");
    }
  }
  if (total > 0) await tx.user.update({ where: { id: winnerId }, data: { coins: { increment: total } } });
}
