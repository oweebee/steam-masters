import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.shopOffer.findUnique({
        where: { id },
        include: { rotation: { select: { endsAt: true } } },
      });
      if (!offer || (!offer.gameId && !offer.studioId)) throw new Error("Offre introuvable");
      if (offer.purchasedAt) throw new Error("Cette carte a déjà été achetée");
      if (offer.rotation.endsAt <= now) throw new Error("Cette offre vient d’expirer, actualise le magasin");

      const debited = await tx.user.updateMany({
        where: { id: userId, coins: { gte: offer.price } },
        data: { coins: { decrement: offer.price } },
      });
      if (debited.count !== 1) throw new Error("Tu n’as pas assez de gigapuissances");

      const claimed = await tx.shopOffer.updateMany({
        where: { id, purchasedAt: null },
        data: { purchasedAt: now, purchasedById: userId },
      });
      if (claimed.count !== 1) throw new Error("Cette carte vient d’être achetée par un autre joueur");

      const card = await tx.card.create({
        data: {
          userId,
          gameId: offer.gameId,
          studioId: offer.studioId,
          rarity: offer.rarity,
          atk: offer.atk,
        },
      });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } });
      return { cardId: card.id, coins: user.coins, price: offer.price };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Achat simultané détecté, actualise le magasin" }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Achat impossible" }, { status: 400 });
  }
}
