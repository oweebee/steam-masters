import { prisma } from "@/lib/prisma";

/**
 * Clôture les enchères expirées. Le meilleur enchérisseur a déjà déposé ses
 * pièces : la clôture paie donc le vendeur puis transfère l'exemplaire.
 * Chaque enchère est traitée dans sa propre transaction pour rester idempotente.
 */
export async function settleExpiredAuctions() {
  const expired = await prisma.auction.findMany({
    where: { status: "ACTIVE", endsAt: { lte: new Date() } },
    select: { id: true },
  });

  for (const { id } of expired) {
    await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({
        where: { id },
        include: {
          card: { select: { id: true, userId: true } },
          bids: { orderBy: [{ amount: "desc" }, { createdAt: "asc" }], take: 1 },
        },
      });

      if (!auction || auction.status !== "ACTIVE" || auction.endsAt > new Date()) return;
      const winningBid = auction.bids[0];

      if (!winningBid) {
        await tx.auction.update({ where: { id }, data: { status: "ENDED" } });
        return;
      }

      // Une carte supprimée ou déplacée hors du vendeur ne peut plus être livrée.
      // Le dépôt du meilleur enchérisseur lui est alors intégralement rendu.
      if (!auction.card || auction.card.userId !== auction.sellerId) {
        await tx.user.update({
          where: { id: winningBid.userId },
          data: { coins: { increment: winningBid.amount } },
        });
        await tx.auction.update({ where: { id }, data: { status: "CANCELLED" } });
        return;
      }

      await tx.card.update({
        where: { id: auction.card.id },
        data: { userId: winningBid.userId, isPinned: false },
      });
      await tx.user.update({
        where: { id: auction.sellerId },
        data: { coins: { increment: winningBid.amount } },
      });
      await tx.auction.update({
        where: { id },
        data: { status: "ENDED", currentBid: winningBid.amount },
      });
    }, { isolationLevel: "Serializable" });
  }
}
