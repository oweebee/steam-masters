import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { activeTradeWhere, expireCardDeliveries } from "@/lib/tradeExpiry";
import { assertStakeCardAvailable, stakedCardCount } from "@/lib/battleStake";

async function currentUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  await expireCardDeliveries();
  const offers = await prisma.trade.findMany({
    where: { isDelivery: true, OR: [{ fromUserId: userId }, { toUserId: userId }] },
    include: {
      fromUser: { select: { id: true, username: true } },
      toUser: { select: { id: true, username: true } },
      cards: { include: { card: { include: {
        game: { select: { name: true, headerImage: true } },
        studio: { select: { name: true, avatarUrl: true } },
      } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(offers);
}

export async function POST(request: Request) {
  const fromUserId = await currentUserId();
  if (!fromUserId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  const toUserId = typeof body?.toUserId === "string" ? body.toUserId : "";
  const priceCoins = body?.priceCoins;
  if (!cardId || !toUserId || toUserId === fromUserId || !Number.isInteger(priceCoins) || priceCoins < 0 || priceCoins > 1_000_000) {
    return NextResponse.json({ error: "Carte, destinataire ou prix invalide" }, { status: 400 });
  }
  try {
    const offer = await prisma.$transaction(async (tx) => {
      const [card, recipient, pendingTrades, auctions, staked] = await Promise.all([
        tx.card.findFirst({ where: { id: cardId, userId: fromUserId }, select: { id: true } }),
        tx.user.findFirst({ where: { id: toUserId, status: "ACTIVE" }, select: { id: true } }),
        tx.tradeCard.count({ where: { cardId, trade: activeTradeWhere() } }),
        tx.auction.count({ where: { cardId, status: "ACTIVE" } }),
        stakedCardCount(tx, [cardId]),
      ]);
      if (!card) throw new Error("Cette carte ne t’appartient plus");
      if (!recipient) throw new Error("Joueur destinataire introuvable");
      if (pendingTrades || auctions || staked) throw new Error("Cette carte est déjà engagée ailleurs");
      await assertStakeCardAvailable(tx, fromUserId, cardId);
      return tx.trade.create({
        data: {
          fromUserId,
          toUserId,
          isDelivery: true,
          wantCoins: priceCoins,
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000),
          cards: { create: { cardId, side: "OFFER" } },
        },
        select: { id: true, expiresAt: true },
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(offer, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Envoi impossible" }, { status: 400 });
  }
}
