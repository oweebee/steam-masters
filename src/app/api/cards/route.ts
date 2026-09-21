import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildGameLinkMap, toStudioGameLinks } from "@/lib/studioGames";

// Vue publique (tout user connecté) de toutes les cartes du jeu — "Toutes les cartes"
// façon WikiMasters. Mêmes données que /api/admin/cards, sans nécessiter le rôle ADMIN.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [games, studios] = await Promise.all([
    prisma.steamGame.findMany({
      include: { cards: { include: { user: { select: { username: true } } } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.studio.findMany({
      include: { cards: { include: { user: { select: { username: true } } } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const gameLinkMap = await buildGameLinkMap(studios.flatMap((s) => s.games));

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
      copies: g.cards.length,
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
      games: toStudioGameLinks(s.games, gameLinkMap),
      about: s.about,
      avatarUrl: s.avatarUrl,
      copies: s.cards.length,
      updatedAt: s.updatedAt,
    })),
  ];

  return NextResponse.json(items);
}
