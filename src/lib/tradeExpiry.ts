import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function activeTradeWhere(now = new Date()): Prisma.TradeWhereInput {
  return { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

// Les cartes restent chez leur propriétaire pendant la proposition. Expirer
// l'offre libère donc immédiatement l'exemplaire, sans transfert inverse.
export async function expireCardDeliveries() {
  return prisma.trade.updateMany({
    where: { isDelivery: true, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });
}
