import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildStudioGamesByDeveloper } from "@/lib/studioGames";

// Vue catalogue complète réservée aux administrateurs.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [games, studios] = await Promise.all([
    prisma.steamGame.findMany({
      include: { _count: { select: { cards: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.studio.findMany({
      include: { _count: { select: { cards: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const studioGamesMap = await buildStudioGamesByDeveloper(studios.map((s) => s.name));

  const items = [
    ...games.map((g) => ({
      type: "GAME" as const,
      id: g.id,
      name: g.name,
      headerImage: g.headerImage,
      description: g.description,
      rarity: g.rarity,
      atk: g.atk,
      def: g.def,
      ownerEstimate: g.ownerEstimate,
      reviewScore: g.reviewScore,
      peakCcu: g.peakCcu,
      priceCents: g.priceCents,
      isFree: g.isFree,
      tags: g.tags,
      developers: g.developers,
      copies: g._count.cards,
      updatedAt: g.updatedAt,
    })),
    ...studios.map((s) => ({
      type: "STUDIO" as const,
      id: s.id,
      name: s.name,
      headerImage: null,
      rarity: s.rarity,
      atk: s.atk,
      def: s.def,
      ownerEstimate: s.totalOwnerEstimate,
      reviewScore: s.avgReviewScore,
      tags: [] as string[],
      developers: [] as string[],
      gameCount: s.gameCount,
      games: studioGamesMap.get(s.name) ?? [],
      about: s.about,
      avatarUrl: s.avatarUrl,
      copies: s._count.cards,
      updatedAt: s.updatedAt,
    })),
  ];

  return NextResponse.json(items);
}
