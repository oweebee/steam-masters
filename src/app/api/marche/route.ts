import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { settleExpiredAuctions } from "@/lib/market";
import { activeDeckCardCount, stakedCardCount } from "@/lib/battleStake";
import { activeTradeWhere } from "@/lib/tradeExpiry";

const DURATIONS = new Set([10, 30, 60, 360, 1440]);

async function userIdFromSession() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET() {
  const userId = await userIdFromSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await settleExpiredAuctions();
  const [auctions, completed] = await Promise.all([
    prisma.auction.findMany({
      where: { status: "ACTIVE" },
      include: {
        seller: { select: { id: true, username: true } },
        card: { select: { id: true, rarity: true, atk: true } },
        game: { select: { id: true, name: true, headerImage: true, def: true } },
        studio: { select: { id: true, name: true, avatarUrl: true, def: true } },
        bids: {
          orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
          select: { userId: true, amount: true },
        },
      },
      orderBy: { endsAt: "asc" },
    }),
    prisma.auction.findMany({
      where: { status: "ENDED", bids: { some: {} } },
      select: { gameId: true, studioId: true, currentBid: true },
    }),
  ]);

  const totals = new Map<string, { total: number; count: number }>();
  for (const sale of completed) {
    const key = sale.gameId ? `GAME:${sale.gameId}` : sale.studioId ? `STUDIO:${sale.studioId}` : null;
    if (!key) continue;
    const aggregate = totals.get(key) ?? { total: 0, count: 0 };
    aggregate.total += sale.currentBid;
    aggregate.count += 1;
    totals.set(key, aggregate);
  }

  return NextResponse.json(auctions.map((auction) => {
    const key = auction.gameId ? `GAME:${auction.gameId}` : auction.studioId ? `STUDIO:${auction.studioId}` : null;
    const aggregate = key ? totals.get(key) : null;
    return {
      ...auction,
      bidCount: auction.bids.length,
      highestBidderId: auction.bids[0]?.userId ?? null,
      hasBid: auction.bids.some((bid) => bid.userId === userId),
      averagePrice: aggregate ? Math.round(aggregate.total / aggregate.count) : null,
      bids: undefined,
    };
  }));
}

export async function POST(request: Request) {
  const userId = await userIdFromSession();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const cardId = typeof body?.cardId === "string" ? body.cardId : "";
  const startPrice = Number(body?.startPrice);
  const durationMinutes = Number(body?.durationMinutes);

  if (!cardId || !Number.isInteger(startPrice) || startPrice < 1 || startPrice > 1_000_000) {
    return NextResponse.json({ error: "Prix de départ invalide (1 à 1 000 000 pièces)" }, { status: 400 });
  }
  if (!Number.isInteger(durationMinutes) || !DURATIONS.has(durationMinutes)) {
    return NextResponse.json({ error: "Durée d’enchère invalide" }, { status: 400 });
  }

  try {
    const auction = await prisma.$transaction(async (tx) => {
      const card = await tx.card.findUnique({
        where: { id: cardId },
        select: { id: true, userId: true, gameId: true, studioId: true },
      });
      if (!card || card.userId !== userId) throw new Error("Cette carte ne t’appartient plus");
      if (!card.gameId && !card.studioId) throw new Error("Carte incomplète, mise en vente impossible");

      const [pendingTrade, activeAuction, staked, activeDeck] = await Promise.all([
        tx.tradeCard.count({ where: { cardId, trade: activeTradeWhere() } }),
        tx.auction.count({ where: { cardId, status: "ACTIVE" } }),
        stakedCardCount(tx, [cardId]),
        activeDeckCardCount(tx, userId, [cardId]),
      ]);
      if (pendingTrade > 0) throw new Error("Cette carte est engagée dans un échange");
      if (activeAuction > 0) throw new Error("Cette carte est déjà sur le marché");
      if (staked > 0) throw new Error("Cette carte est misée dans un combat");
      if (activeDeck > 0) throw new Error("Cette carte est jouée dans un combat actif");

      return tx.auction.create({
        data: {
          cardId,
          sellerId: userId,
          gameId: card.gameId,
          studioId: card.studioId,
          startPrice,
          currentBid: startPrice,
          endsAt: new Date(Date.now() + durationMinutes * 60_000),
        },
      });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(auction, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mise en vente impossible" }, { status: 400 });
  }
}
