import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { settleExpiredAuctions } from "@/lib/market";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 1_000_000) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  await settleExpiredAuctions();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id },
        include: { bids: { orderBy: [{ amount: "desc" }, { createdAt: "asc" }], take: 1 } },
      });
      if (!auction || auction.status !== "ACTIVE" || auction.endsAt <= new Date()) {
        throw new Error("Cette enchère est terminée");
      }
      if (auction.sellerId === userId) throw new Error("Tu ne peux pas enchérir sur ta propre carte");

      const previous = auction.bids[0];
      const minimum = previous ? previous.amount + 1 : auction.startPrice;
      if (amount < minimum) throw new Error(`L’enchère minimale est de ${minimum} pièces`);
      const debit = previous?.userId === userId ? amount - previous.amount : amount;
      const bidder = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
      if (!bidder || bidder.coins < debit) throw new Error("Tu n’as pas assez de pièces");

      await tx.user.update({ where: { id: userId }, data: { coins: { decrement: debit } } });
      if (previous && previous.userId !== userId) {
        await tx.user.update({
          where: { id: previous.userId },
          data: { coins: { increment: previous.amount } },
        });
      }
      await tx.bid.create({ data: { auctionId: id, userId, amount } });
      await tx.auction.update({ where: { id }, data: { currentBid: amount } });
      return { amount, coins: bidder.coins - debit };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enchère impossible" }, { status: 400 });
  }
}
