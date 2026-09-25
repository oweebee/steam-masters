import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildStudioGamesByDeveloper } from "@/lib/studioGames";
import { activeTradeWhere } from "@/lib/tradeExpiry";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.card.findMany({
    where: { userId },
    include: {
      game: true,
      studio: true,
      categories: {
        where: { category: { userId } },
        include: { category: { select: { id: true, name: true, color: true } } },
        orderBy: { category: { name: "asc" } },
      },
      tradeCards: {
        where: { trade: activeTradeWhere() },
        select: { id: true },
      },
      auctions: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const stakes = await prisma.battle.findMany({
    where: { status: { in: ["PENDING", "ACTIVE"] }, OR: [
      { challengerStakeCardId: { in: cards.map((card) => card.id) } },
      { opponentStakeCardId: { in: cards.map((card) => card.id) } },
    ] },
    select: { challengerStakeCardId: true, opponentStakeCardId: true },
  });
  const stakedIds = new Set(stakes.flatMap((stake) => [stake.challengerStakeCardId, stake.opponentStakeCardId]).filter((id): id is string => !!id));
  const activeBattles = await prisma.battle.findMany({
    where: { status: "ACTIVE", OR: [{ challengerId: userId }, { opponentId: userId }] },
    select: { challengerId: true, challengerDeck: true, opponentDeck: true },
  });
  const playingIds = new Set(activeBattles.flatMap((battle) => {
    const deck = battle.challengerId === userId ? battle.challengerDeck : battle.opponentDeck;
    return Array.isArray(deck) ? deck.flatMap((item) => typeof item === "object" && item !== null && "id" in item && typeof item.id === "string" ? [item.id] : []) : [];
  }));

  const studioGamesMap = await buildStudioGamesByDeveloper(
    cards.flatMap((c) => c.studio?.name ? [c.studio.name] : [])
  );

  const out = cards.map(({ tradeCards, auctions, categories, ...card }) => ({
    ...card,
    categories: categories.map(({ category }) => category),
    sellable: tradeCards.length === 0 && auctions.length === 0 && !stakedIds.has(card.id) && !playingIds.has(card.id),
    staked: stakedIds.has(card.id),
    studio: card.studio
      ? { ...card.studio, games: studioGamesMap.get(card.studio.name) ?? [] }
      : null,
  }));

  return NextResponse.json(out);
}
