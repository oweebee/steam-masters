import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

  const items = [
    ...games.map((g) => ({
      type: "GAME" as const,
      id: g.id,
      name: g.name,
      headerImage: g.headerImage,
      rarity: g.rarity,
      atk: g.atk,
      def: g.def,
      ownerEstimate: g.ownerEstimate,
      reviewScore: g.reviewScore,
      tags: g.tags,
      developers: g.developers,
      claimedBy: g.cards[0]?.user.username ?? null,
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
      claimedBy: s.cards[0]?.user.username ?? null,
      updatedAt: s.updatedAt,
    })),
  ];

  return NextResponse.json(items);
}
