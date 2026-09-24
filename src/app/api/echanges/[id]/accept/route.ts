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

      if (offerCardIds.length > 0) {
        await tx.card.updateMany({ where: { id: { in: offerCardIds } }, data: { userId: trade.toUserId } });
      }
      if (wantCardIds.length > 0) {
        await tx.card.updateMany({ where: { id: { in: wantCardIds } }, data: { userId: trade.fromUserId } });
      }
      if (trade.offerCoins > 0) {
        await tx.user.update({ where: { id: trade.fromUserId }, data: { coins: { decrement: trade.offerCoins } } });
        await tx.user.update({ where: { id: trade.toUserId }, data: { coins: { increment: trade.offerCoins } } });
      }
      if (trade.wantCoins > 0) {
        await tx.user.update({ where: { id: trade.toUserId }, data: { coins: { decrement: trade.wantCoins } } });
        await tx.user.update({ where: { id: trade.fromUserId }, data: { coins: { increment: trade.wantCoins } } });
      }

      return tx.trade.update({
        where: { id },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      });
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Échec de l'échange" }, { status: 400 });
  }
}
