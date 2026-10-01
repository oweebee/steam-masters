import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Liste publique des fiches catalogue suivies par un joueur connecté. Ce ne
// sont pas des exemplaires possédés : aucune proposition d'échange n'est donc
// possible depuis cette vue.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const viewerId = (session.user as { id?: string } | undefined)?.id;
  const target = await prisma.user.findUnique({ where: { id }, select: { status: true } });
  if (!target || (target.status !== "ACTIVE" && id !== viewerId)) {
    return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });
  }
  const watches = await prisma.cardWatch.findMany({
    where: { userId: id },
    include: {
      game: { select: { id: true, name: true, headerImage: true, rarity: true, contentType: true } },
      studio: { select: { id: true, name: true, avatarUrl: true, rarity: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const cards: { id: string; label: string; headerImage: string | null; rarity: string; type: "GAME" | "DLC" | "STUDIO" }[] = [];
  for (const watch of watches) {
    if (watch.game) cards.push({
      id: watch.game.id,
      label: watch.game.name,
      headerImage: watch.game.headerImage,
      rarity: watch.game.rarity,
      type: watch.game.contentType,
    });
    else if (watch.studio) cards.push({
      id: watch.studio.id,
      label: watch.studio.name,
      headerImage: watch.studio.avatarUrl,
      rarity: watch.studio.rarity,
      type: "STUDIO",
    });
  }
  return NextResponse.json(cards);
}
