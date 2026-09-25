import { z } from "zod";
import { writeAppLog } from "@/lib/appLog";
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
              game: { select: { name: true, headerImage: true, rarity: true, contentType: true } },
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


const tradeInput = z.object({
  toUserId: z.string().min(1).max(100),
  offerCardIds: z.array(z.string().min(1).max(100)).max(200).default([]),
  wantCardIds: z.array(z.string().min(1).max(100)).max(200).default([]),
  offerCoins: z.number().int().min(0).max(2147483647).default(0),
  wantCoins: z.number().int().min(0).max(2147483647).default(0),
  requestId: z.string().uuid().optional(),
});
export async function POST(req: Request) {
  const session = await auth();
  const fromUserId = session?.user?.id;
  if (!fromUserId) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const parsed = tradeInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Proposition invalide : cartes et montants entiers positifs requis." }, { status: 400 });
  const { toUserId, offerCardIds, wantCardIds, offerCoins, wantCoins } = parsed.data;
  const requestId = parsed.data.requestId ?? crypto.randomUUID();
  if (toUserId === fromUserId) return NextResponse.json({ error: "Choisis un autre joueur." }, { status: 400 });
  if (!offerCardIds.length && !wantCardIds.length && !offerCoins && !wantCoins) return NextResponse.json({ error: "Échange vide." }, { status: 400 });
  if (new Set([...offerCardIds, ...wantCardIds]).size !== offerCardIds.length + wantCardIds.length) return NextResponse.json({ error: "Une carte figure plusieurs fois dans la proposition." }, { status: 400 });
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.trade.findUnique({ where: { requestId }, include: { cards: true } });
      if (previous) return previous.fromUserId === fromUserId ? NextResponse.json(previous) : NextResponse.json({ error: "Identifiant de proposition déjà utilisé." }, { status: 409 });
      const recipient = await tx.user.findUnique({ where: { id: toUserId }, select: { status: true } });
      if (recipient?.status !== "ACTIVE") return NextResponse.json({ error: "Ce joueur n’est plus disponible." }, { status: 400 });
  const allCardIds = [...offerCardIds, ...wantCardIds];
  const [offerOwned, wantOwned, fromUser, staked, locked, auctions] = await Promise.all([
    tx.card.count({ where: { id: { in: offerCardIds }, userId: fromUserId } }),
    tx.card.count({ where: { id: { in: wantCardIds }, userId: toUserId } }),
    tx.user.findUnique({ where: { id: fromUserId }, select: { coins: true } }),
    tx.battle.count({ where: { status: { in: ["PENDING", "ACTIVE"] }, OR: [
      { challengerStakeCardId: { in: [...offerCardIds, ...wantCardIds] } },
      { opponentStakeCardId: { in: [...offerCardIds, ...wantCardIds] } },
    ] } }),
    tx.tradeCard.count({ where: { cardId: { in: allCardIds }, trade: activeTradeWhere() } }),
    tx.auction.count({ where: { cardId: { in: allCardIds }, status: "ACTIVE" } }),
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

  const trade = await tx.trade.create({
    data: {
      fromUserId,
      requestId,
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
    }, { isolationLevel: "Serializable", timeout: 15000, maxWait: 5000 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002" || code === "P2034") return NextResponse.json({ error: "La proposition a peut-être déjà été traitée. Actualise ou réessaie : aucun doublon ne sera créé." }, { status: 409 });
    await writeAppLog({ category: "APP", level: "ERROR", message: "Création échange impossible", details: { userId: fromUserId, code: code ?? "UNKNOWN" } });
    return NextResponse.json({ error: "Impossible d’envoyer la proposition pour le moment. Réessaie dans un instant." }, { status: 500 });
  }
}
