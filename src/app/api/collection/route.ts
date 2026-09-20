import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildGameLinkMap, toStudioGameLinks } from "@/lib/studioGames";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.card.findMany({
    where: { userId: (session.user as any).id },
    include: { game: true, studio: true },
    orderBy: { createdAt: "desc" },
  });

  const gameLinkMap = await buildGameLinkMap(
    cards.flatMap((c) => c.studio?.games ?? [])
  );

  const out = cards.map((c) => ({
    ...c,
    studio: c.studio
      ? { ...c.studio, games: toStudioGameLinks(c.studio.games, gameLinkMap) }
      : null,
  }));

  return NextResponse.json(out);
}
