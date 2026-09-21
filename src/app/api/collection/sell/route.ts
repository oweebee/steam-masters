import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_CARDS_PER_SALE = 100;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rawIds: unknown[] = Array.isArray(body?.cardIds) ? body.cardIds : [];
  const cardIds: string[] = Array.from(
    new Set(rawIds.filter((id): id is string => typeof id === "string" && id.length > 0))
  );

  if (cardIds.length === 0 || cardIds.length > MAX_CARDS_PER_SALE) {
    return NextResponse.json({ error: "Sélection invalide" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const cards = await tx.card.findMany({
        where: { id: { in: cardIds }, userId },
        select: { id: true },
      });

      if (cards.length !== cardIds.length) {
        throw new Error("Une carte sélectionnée ne t’appartient plus");
      }
      const [pendingTrades, linkedAuctions] = await Promise.all([
        tx.tradeCard.count({
          where: { cardId: { in: cardIds }, trade: { status: "PENDING" } },
        }),
        tx.auction.count({ where: { cardId: { in: cardIds }, status: "ACTIVE" } }),
      ]);
      if (pendingTrades > 0) {
        throw new Error("Une carte sélectionnée est engagée dans un échange");
      }
      if (linkedAuctions > 0) {
        throw new Error("Une carte sélectionnée est liée au marché");
      }

      // Les liens d'échanges terminés ne doivent pas retenir physiquement un
      // exemplaire vendu. Le catalogue Jeu/Studio reste intact dans la pioche.
      await tx.tradeCard.deleteMany({ where: { cardId: { in: cardIds } } });
      const deleted = await tx.card.deleteMany({ where: { id: { in: cardIds }, userId } });
      if (deleted.count !== cardIds.length) throw new Error("La collection a changé, recommence la vente");

      const user = await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: deleted.count } },
        select: { coins: true },
      });

      return { sold: deleted.count, earned: deleted.count, coins: user.coins };
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vente impossible";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
