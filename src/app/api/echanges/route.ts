import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { activeTradeWhere, expireCardDeliveries } from "@/lib/tradeExpiry";

// Système d'échange : N cartes contre M cartes (N ou M peuvent être 0), plus
// optionnellement des jetons de chaque côté. L'initiateur (fromUser) propose,
// le destinataire (toUser) accepte ou refuse — les DEUX doivent être d'accord
// (création = accord de l'initiateur, accept = accord du destinataire) avant
// tout transfert. Rien n'est déplacé à la création, seulement à l'acceptation.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  await expireCardDeliveries();

  const trades = await prisma.trade.findMany({
    where: { isDelivery: false, OR: [{ fromUserId: userId }, { toUserId: userId }] },
    include: {
      fromUser: { select: { id: true, username: true } },
      toUser: { select: { id: true, username: true } },
      cards: {
        include: {
          card: {
            include: {
              game: { select: { name: true, headerImage: true, rarity: true } },
              studio: { select: { name: true, rarity: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(trades);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fromUserId = (session.user as any).id as string;

  const body = await req.json();
  const toUserId: string = body.toUserId;
  const offerCardIds: string[] = Array.isArray(body.offerCardIds) ? body.offerCardIds : [];
  const wantCardIds: string[] = Array.isArray(body.wantCardIds) ? body.wantCardIds : [];
  const offerCoins: number = Number.isInteger(body.offerCoins) ? body.offerCoins : 0;
  const wantCoins: number = Number.isInteger(body.wantCoins) ? body.wantCoins : 0;

  if (!toUserId || toUserId === fromUserId) {
    return NextResponse.json({ error: "Destinataire invalide" }, { status: 400 });
  }
  if (offerCardIds.length === 0 && wantCardIds.length === 0 && offerCoins === 0 && wantCoins === 0) {
    return NextResponse.json({ error: "Échange vide" }, { status: 400 });
  }
  if (offerCoins < 0 || wantCoins < 0) {
    return NextResponse.json({ error: "Montant de jetons invalide" }, { status: 400 });
  }
  if (new Set(offerCardIds).size !== offerCardIds.length || new Set(wantCardIds).size !== wantCardIds.length) {
    return NextResponse.json({ error: "Une carte figure plusieurs fois dans la proposition" }, { status: 400 });
  }

  // Vérifie que les cartes offertes appartiennent bien à l'initiateur, et les
  // cartes demandées au destinataire (pas de triche en manipulant le payload).
  const allCardIds = [...offerCardIds, ...wantCardIds];
  const [offerOwned, wantOwned, fromUser, staked, locked, auctions] = await Promise.all([
    prisma.card.count({ where: { id: { in: offerCardIds }, userId: fromUserId } }),
    prisma.card.count({ where: { id: { in: wantCardIds }, userId: toUserId } }),
    prisma.user.findUnique({ where: { id: fromUserId }, select: { coins: true } }),
    prisma.battle.count({ where: { status: { in: ["PENDING", "ACTIVE"] }, OR: [
      { challengerStakeCardId: { in: [...offerCardIds, ...wantCardIds] } },
      { opponentStakeCardId: { in: [...offerCardIds, ...wantCardIds] } },
    ] } }),
    prisma.tradeCard.count({ where: { cardId: { in: allCardIds }, trade: activeTradeWhere() } }),
    prisma.auction.count({ where: { cardId: { in: allCardIds }, status: "ACTIVE" } }),
  ]);
  if (offerOwned !== offerCardIds.length) {
    return NextResponse.json({ error: "Une des cartes offertes ne t'appartient pas (plus)" }, { status: 400 });
  }
  if (wantOwned !== wantCardIds.length) {
    return NextResponse.json({ error: "Une des cartes demandées n'appartient pas (plus) au destinataire" }, { status: 400 });
  }
  if (!fromUser || fromUser.coins < offerCoins) {
    return NextResponse.json({ error: "Solde de jetons insuffisant" }, { status: 400 });
  }
  if (staked > 0) return NextResponse.json({ error: "Une carte est misée dans un combat" }, { status: 400 });
  if (locked > 0 || auctions > 0) return NextResponse.json({ error: "Une carte est déjà engagée dans une autre proposition ou une enchère" }, { status: 400 });

  const trade = await prisma.trade.create({
    data: {
      fromUserId,
      toUserId,
      offerCoins,
      wantCoins,
      cards: {
        create: [
          ...offerCardIds.map((cardId) => ({ cardId, side: "OFFER" as const })),
          ...wantCardIds.map((cardId) => ({ cardId, side: "WANT" as const })),
        ],
      },
    },
    include: { cards: true },
  });

  return NextResponse.json(trade);
}
