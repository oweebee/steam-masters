import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Collection publique d'un joueur (tout user connecté) : nécessaire pour proposer
// un échange en choisissant des cartes qu'on ne possède pas soi-même.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cards = await prisma.card.findMany({
    where: { userId: id },
    include: {
      game: { select: { id: true, name: true, headerImage: true, rarity: true, contentType: true } },
      studio: { select: { id: true, name: true, rarity: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const out = cards.map((c) => ({
    id: c.id,
    label: c.game?.name ?? c.studio?.name ?? "?",
    headerImage: c.game?.headerImage ?? null,
    // Rareté propre à cet exemplaire, pas celle du jeu/studio catalogue.
    rarity: c.rarity,
    type: c.game ? c.game.contentType : ("STUDIO" as const),
  }));

  return NextResponse.json(out);
}
