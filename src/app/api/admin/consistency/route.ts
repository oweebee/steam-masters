import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertStudiosForDevelopers } from "@/lib/steam";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

// Scan local (aucun appel Steam, instantané) : recrée/recalcule les fiches
// Studio à partir des SteamGame réels en base (couvre le cas d'un développeur
// présent dans des jeux mais sans fiche Studio), purge les Studio orphelins
// (0 jeu et 0 carte possédée par un joueur, donc sans impact sur l'historique
// figé), puis recalcule la rareté catalogue de TOUT le classement (cibles
// 0.5%/5%/10%/20%/64.5%). La rareté Studio est ensuite plafonnée par la
// meilleure tranche réellement atteinte par l'un de ses jeux.
export async function POST() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const games = await prisma.steamGame.findMany({ select: { developers: true } });
  const developers = Array.from(new Set(games.flatMap((game) => game.developers).filter(Boolean)));
  await upsertStudiosForDevelopers(developers);

  const orphanStudios = await prisma.studio.findMany({
    where: { gameCount: 0 },
    select: { id: true, name: true, _count: { select: { cards: true } } },
  });
  const removable = orphanStudios.filter((studio) => studio._count.cards === 0);
  if (removable.length > 0) {
    await prisma.studio.deleteMany({ where: { id: { in: removable.map((s) => s.id) } } });
  }

  const rarityResult = await recalculateCatalogRarity();

  return NextResponse.json({
    gamesScanned: rarityResult?.entriesScanned ?? 0,
    gamesRarityFixed: (rarityResult?.gamesFixed ?? 0) + (rarityResult?.studiosFixed ?? 0),
    studiosUpserted: developers.length,
    orphanStudiosRemoved: removable.length,
    orphanStudiosKept: orphanStudios.length - removable.length,
  });
}
