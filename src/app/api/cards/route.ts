import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

// Vue catalogue complète — tous les utilisateurs connectés.
// Optimisations (mesuré : ~27k fiches, 21 Mo, 3,5 s côté serveur) :
// - plus de liste de jeux par studio (StudioCard la charge lui-même via
//   /api/studios/games quand la carte est affichée) : supprime le calcul
//   buildStudioGamesByDeveloper sur ~5 000 studios et ~2,4 Mo de JSON ;
// - select ciblé (plus de dlcAppIds/parentGameId/updatedAt inutiles) ;
// - réponse mise en cache Redis 60 s (identique pour tous les joueurs).
const CACHE_KEY = "api:cards:v2";
const CACHE_TTL_S = 60;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cached = await redis.get(CACHE_KEY).catch(() => null);
  if (cached) return new NextResponse(cached, { headers: { "Content-Type": "application/json", "X-Cache": "HIT" } });

  const [games, studios] = await Promise.all([
    prisma.steamGame.findMany({
      select: {
        id: true, contentType: true, source: true, platforms: true, name: true, headerImage: true,
        description: true, rarity: true, atk: true, def: true, ownerEstimate: true, reviewScore: true,
        peakCcu: true, priceCents: true, isFree: true, tags: true, developers: true,
        _count: { select: { cards: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.studio.findMany({
      select: {
        id: true, name: true, rarity: true, atk: true, def: true, totalOwnerEstimate: true,
        avgReviewScore: true, gameCount: true, about: true, avatarUrl: true,
        _count: { select: { cards: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const items = [
    ...games.map(({ _count, ...g }) => ({ type: "GAME" as const, ...g, copies: _count.cards })),
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
      about: s.about,
      avatarUrl: s.avatarUrl,
      copies: s._count.cards,
    })),
  ];

  const body = JSON.stringify(items);
  await redis.set(CACHE_KEY, body, "EX", CACHE_TTL_S).catch(() => {});
  return new NextResponse(body, { headers: { "Content-Type": "application/json", "X-Cache": "MISS" } });
}
