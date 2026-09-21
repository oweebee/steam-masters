import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildStudioGamesByDeveloper } from "@/lib/studioGames";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.card.findMany({
    where: { userId: (session.user as any).id },
    include: { game: true, studio: true },
    orderBy: { createdAt: "desc" },
  });

  const studioGamesMap = await buildStudioGamesByDeveloper(
    cards.flatMap((c) => c.studio?.name ? [c.studio.name] : [])
  );

  const out = cards.map((c) => ({
    ...c,
    studio: c.studio
      ? { ...c.studio, games: studioGamesMap.get(c.studio.name) ?? [] }
      : null,
  }));

  return NextResponse.json(out);
}
