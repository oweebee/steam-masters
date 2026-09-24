import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildStudioGamesByDeveloper } from "@/lib/studioGames";

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
      tradeCards: {
        where: { trade: { status: "PENDING" } },
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

  const studioGamesMap = await buildStudioGamesByDeveloper(
    cards.flatMap((c) => c.studio?.name ? [c.studio.name] : [])
  );

  const out = cards.map(({ tradeCards, auctions, ...card }) => ({
    ...card,
    sellable: tradeCards.length === 0 && auctions.length === 0 && !stakedIds.has(card.id),
    staked: stakedIds.has(card.id),
    studio: card.studio
      ? { ...card.studio, games: studioGamesMap.get(card.studio.name) ?? [] }
      : null,
  }));

  return NextResponse.json(out);
}
