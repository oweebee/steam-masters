import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stakedCardCount } from "@/lib/battleStake";

// Acceptation par le destinataire : ré-vérifie tout (propriété des cartes,
// soldes de jetons) au moment T, puis exécute le transfert de façon atomique.
// Rien n'est jamais transféré à moitié : soit tout passe, soit l'échange
// échoue et repasse en erreur explicite (carte déjà revendue/échangée entre-
// temps, jetons dépensés ailleurs, etc.) sans toucher à rien.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findUnique({
        where: { id },
        include: { cards: true },
      });
      if (!trade) throw new Error("Échange introuvable");
      if (trade.toUserId !== userId) throw new Error("Seul le destinataire peut accepter cet échange");
      if (trade.status !== "PENDING") throw new Error("Cet échange n'est plus en attente");
      if (trade.expiresAt && trade.expiresAt <= new Date()) throw new Error("Cette proposition a expiré");

      const offerCardIds = trade.cards.filter((c) => c.side === "OFFER").map((c) => c.cardId);
      const wantCardIds = trade.cards.filter((c) => c.side === "WANT").map((c) => c.cardId);

      const [offerOwned, wantOwned, fromUser, toUser] = await Promise.all([
        tx.card.count({ where: { id: { in: offerCardIds }, userId: trade.fromUserId } }),
        tx.card.count({ where: { id: { in: wantCardIds }, userId: trade.toUserId } }),
        tx.user.findUnique({ where: { id: trade.fromUserId }, select: { coins: true } }),
        tx.user.findUnique({ where: { id: trade.toUserId }, select: { coins: true } }),
      ]);
      if (offerOwned !== offerCardIds.length) throw new Error("L'initiateur ne possède plus toutes les cartes offertes");
      if (wantOwned !== wantCardIds.length) throw new Error("Tu ne possèdes plus toutes les cartes demandées");
      if (!fromUser || fromUser.coins < trade.offerCoins) throw new Error("L'initiateur n'a plus assez de jetons");
      if (!toUser || toUser.coins < trade.wantCoins) throw new Error("Tu n'as plus assez de jetons");
      if (await stakedCardCount(tx, [...offerCardIds, ...wantCardIds])) throw new Error("Une carte de cet échange est misée dans un combat");
      if (trade.isDelivery && (offerCardIds.length !== 1 || wantCardIds.length !== 0 || trade.offerCoins !== 0)) {
        throw new Error("Envoi de carte invalide");
      }

      const activeAuctions = await tx.auction.count({ where: { cardId: { in: [...offerCardIds, ...wantCardIds] }, status: "ACTIVE" } });
      if (activeAuctions) throw new Error("Une carte est déjà en vente");

      if (offerCardIds.length > 0) {
        const moved = await tx.card.updateMany({ where: { id: { in: offerCardIds }, userId: trade.fromUserId }, data: { userId: trade.toUserId } });
        if (moved.count !== offerCardIds.length) throw new Error("La carte offerte a changé de propriétaire");
      }
      if (wantCardIds.length > 0) {
        const moved = await tx.card.updateMany({ where: { id: { in: wantCardIds }, userId: trade.toUserId }, data: { userId: trade.fromUserId } });
        if (moved.count !== wantCardIds.length) throw new Error("La carte demandée a changé de propriétaire");
      }
      if (trade.offerCoins > 0) {
        const paid = await tx.user.updateMany({ where: { id: trade.fromUserId, coins: { gte: trade.offerCoins } }, data: { coins: { decrement: trade.offerCoins } } });
        if (paid.count !== 1) throw new Error("L'initiateur n'a plus assez de pièces");
        await tx.user.update({ where: { id: trade.toUserId }, data: { coins: { increment: trade.offerCoins } } });
      }
      if (trade.wantCoins > 0) {
        const paid = await tx.user.updateMany({ where: { id: trade.toUserId, coins: { gte: trade.wantCoins } }, data: { coins: { decrement: trade.wantCoins } } });
        if (paid.count !== 1) throw new Error("Tu n'as plus assez de pièces");
        await tx.user.update({ where: { id: trade.fromUserId }, data: { coins: { increment: trade.wantCoins } } });
      }

      return tx.trade.update({
        where: { id },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });
    }, { isolationLevel: "Serializable" });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Échec de l'échange" }, { status: 400 });
  }
}
