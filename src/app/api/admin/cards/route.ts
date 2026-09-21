import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildGameLinkMap, toStudioGameLinks } from "@/lib/studioGames";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

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
      // Plus d'unicité : un jeu peut avoir 0, 1 ou N exemplaires tirés (par le même
      // joueur ou des joueurs différents), chacun avec sa propre rareté.
      copies: g.cards.length,
      instances: g.cards.map((c) => ({ id: c.id, username: c.user.username, rarity: c.rarity })),
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
      instances: s.cards.map((c) => ({ id: c.id, username: c.user.username, rarity: c.rarity })),
      updatedAt: s.updatedAt,
    })),
  ];

  return NextResponse.json(items);
}
