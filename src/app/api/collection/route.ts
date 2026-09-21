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
      auctionCard: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const studioGamesMap = await buildStudioGamesByDeveloper(
    cards.flatMap((c) => c.studio?.name ? [c.studio.name] : [])
  );

  const out = cards.map(({ tradeCards, auctionCard, ...card }) => ({
    ...card,
    sellable: tradeCards.length === 0 && !auctionCard,
    studio: card.studio
      ? { ...card.studio, games: studioGamesMap.get(card.studio.name) ?? [] }
      : null,
  }));

  return NextResponse.json(out);
}
