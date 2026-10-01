import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAppLog } from "@/lib/appLog";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function POST() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  // Nullifier les mises de cartes dans les combats en cours
  await prisma.battle.updateMany({ where: { challengerStakeCardId: { not: null } }, data: { challengerStakeCardId: null } });
  await prisma.battle.updateMany({ where: { opponentStakeCardId: { not: null } }, data: { opponentStakeCardId: null } });

  // Supprimer toutes les cartes (cascade → TradeCard, CardCategoryAssignment ; SetNull → Auction.cardId)
  const { count } = await prisma.card.deleteMany({});

  await writeAppLog({ category: "ADMIN", level: "WARNING", message: `Remise à zéro des cartes joueurs : ${count} cartes supprimées` });
  return NextResponse.json({ deleted: count });
}
