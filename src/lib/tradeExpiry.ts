import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function activeTradeWhere(now = new Date()): Prisma.TradeWhereInput {
  return { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

// Les cartes restent chez leur propriétaire pendant la proposition. Expirer
// l'offre libère donc immédiatement l'exemplaire, sans transfert inverse.
// Couvre les envois (isDelivery=true, 3j) et les échanges classiques (isDelivery=false, 48h).
export async function expireCardDeliveries() {
  return prisma.trade.updateMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });
}
