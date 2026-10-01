import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertStudiosForDevelopers } from "@/lib/steam";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { writeAppLog } from "@/lib/appLog";
import { cardDefense } from "@/lib/cardDefense";
import { persistRemoteImage } from "@/lib/storedImages";
import { archiveCatalogIssue } from "@/lib/catalogIssueArchive";

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
export async function POST(req: Request) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const body = await req.json().catch(() => null);
  const runId = typeof body?.runId === "string" ? body.runId : null;
  await writeAppLog({ runId, category: "REPAIR", message: "Scan de cohérence locale démarré" });

  const games = await prisma.steamGame.findMany({ where: { contentType: "GAME" }, select: { developers: true } });
  const developers = Array.from(new Set(games.flatMap((game) => game.developers).filter(Boolean)));
  await upsertStudiosForDevelopers(developers);

  const dlcs = await prisma.steamGame.findMany({
    where: { contentType: "DLC" },
    select: { id: true, name: true, ownerEstimate: true, def: true, developers: true, parentGameId: true, headerImage: true, parentGame: { select: { contentType: true, developers: true } } },
  });
  const imageKeys = dlcs.map((dlc) => `game:${dlc.id}`);
  const validImages = await prisma.storedImage.findMany({
    where: { key: { in: imageKeys }, data: { not: null }, mimeType: { not: null } },
    select: { key: true },
  });
  const imageKeySet = new Set(validImages.map((image) => image.key));
  const defRepairs = new Map<number, string[]>();
  const dlcStudioRepairs = new Map<string, string[]>();
  const dlcIssues: { id: string; reason: string }[] = [];
  let dlcImagesRestored = 0;
  let dlcImagesMissing = 0;
  let dlcParentsInvalid = 0;
  let dlcOwnersInvalid = 0;

  for (const dlc of dlcs) {
    if (dlc.ownerEstimate > 0) {
      const expectedDef = cardDefense(dlc.ownerEstimate);
      if (dlc.def !== expectedDef) defRepairs.set(expectedDef, [...(defRepairs.get(expectedDef) ?? []), dlc.id]);
    } else {
      dlcOwnersInvalid += 1;
      dlcIssues.push({ id: dlc.id, reason: "estimation de possesseurs non positive; DEF non fabriquée" });
    }

    if (!dlc.parentGameId || dlc.parentGame?.contentType !== "GAME") {
      dlcParentsInvalid += 1;
      dlcIssues.push({ id: dlc.id, reason: "jeu parent absent ou non typé GAME" });
    } else if (dlc.developers.length === 0 && dlc.parentGame.developers.length > 0) {
      const developerKey = JSON.stringify(dlc.parentGame.developers);
      dlcStudioRepairs.set(developerKey, [...(dlcStudioRepairs.get(developerKey) ?? []), dlc.id]);
    } else if (dlc.developers.length === 0) {
      dlcIssues.push({ id: dlc.id, reason: "aucun studio renseigné sur le DLC ou son jeu parent" });
    }

    const imageKey = `game:${dlc.id}`;
    if (!imageKeySet.has(imageKey)) {
      const stored = await prisma.storedImage.findUnique({ where: { key: imageKey }, select: { sourceUrl: true } });
      const sourceUrl = stored?.sourceUrl ?? (dlc.headerImage.startsWith("https://") ? dlc.headerImage : null);
      if (sourceUrl) {
        try {
          await persistRemoteImage("game", dlc.id, sourceUrl);
          dlcImagesRestored += 1;
          continue;
        } catch (error) {
          dlcIssues.push({ id: dlc.id, reason: `image non restaurée: ${error instanceof Error ? error.message : "source inaccessible"}` });
        }
      }
      dlcImagesMissing += 1;
    }
  }

  for (const [def, ids] of defRepairs) {
    await prisma.steamGame.updateMany({ where: { id: { in: ids }, contentType: "DLC", ownerEstimate: { gt: 0 } }, data: { def } });
  }
  for (const [developerKey, ids] of dlcStudioRepairs) {
    await prisma.steamGame.updateMany({ where: { id: { in: ids }, contentType: "DLC" }, data: { developers: JSON.parse(developerKey) as string[] } });
  }

  const orphanStudios = await prisma.studio.findMany({
    where: { gameCount: 0 },
    select: { id: true, name: true, _count: { select: { cards: true } } },
  });
  const removable = orphanStudios.filter((studio) => studio._count.cards === 0);
  if (removable.length > 0) {
    await prisma.studio.deleteMany({ where: { id: { in: removable.map((s) => s.id) } } });
  }

  let rarityResult: Awaited<ReturnType<typeof recalculateCatalogRarity>> | null = null;
  try {
    rarityResult = await recalculateCatalogRarity();
  } catch (err) {
    console.error("[consistency] recalculateCatalogRarity a planté :", err);
    // On continue le reste de la cohérence même si le recalcul échoue
  }

  const dlcDefenseFixed = Array.from(defRepairs.values()).reduce((sum, ids) => sum + ids.length, 0);
  const dlcStudiosLinked = Array.from(dlcStudioRepairs.values()).reduce((sum, ids) => sum + ids.length, 0);
  const repairedDlcIds = new Set(Array.from(dlcStudioRepairs.values()).flat());
  const unresolvedDlcIssues = dlcIssues.filter((issue) => !repairedDlcIds.has(issue.id));
  for (const issue of unresolvedDlcIssues) {
    const dlc = dlcs.find((entry) => entry.id === issue.id);
    await archiveCatalogIssue({ scope: issue.reason.includes("studio") ? "LINK" : "DLC", itemId: issue.id, parentId: dlc?.parentGameId ?? undefined, name: dlc?.name ?? issue.id, reason: issue.reason });
  }
  const dlcsWithoutStudio = dlcs.filter((dlc) => dlc.developers.length === 0 && !repairedDlcIds.has(dlc.id) && (!dlc.parentGame || dlc.parentGame.developers.length === 0)).length;
  await writeAppLog({
    runId,
    category: "REPAIR",
    level: dlcIssues.length ? "WARNING" : "SUCCESS",
    message: `Scan terminé : ${developers.length} studio(s), ${dlcs.length} DLC vérifié(s), ${dlcStudiosLinked} lien(s) studio réparé(s), ${dlcDefenseFixed} DEF corrigée(s), ${dlcImagesRestored} image(s) restaurée(s), ${dlcIssues.length} anomalie(s) DLC`,
    details: { entriesScanned: rarityResult?.entriesScanned ?? 0, gamesFixed: rarityResult?.gamesFixed ?? 0, studiosFixed: rarityResult?.studiosFixed ?? 0, cardsFixed: rarityResult?.cardsFixed ?? 0, orphanStudiosRemoved: removable.length, dlcsScanned: dlcs.length, dlcStudiosLinked, dlcsWithoutStudio, dlcDefenseFixed, dlcImagesRestored, dlcImagesMissing, dlcParentsInvalid, dlcOwnersInvalid, dlcIssues },
  });

  return NextResponse.json({
    gamesScanned: rarityResult?.entriesScanned ?? 0,
    gamesRarityFixed: (rarityResult?.gamesFixed ?? 0) + (rarityResult?.studiosFixed ?? 0),
    cardsRarityFixed: rarityResult?.cardsFixed ?? 0,
    studiosUpserted: developers.length,
    orphanStudiosRemoved: removable.length,
    orphanStudiosKept: orphanStudios.length - removable.length,
    dlcsScanned: dlcs.length,
    dlcStudiosLinked,
    dlcsWithoutStudio,
    dlcDefenseFixed,
    dlcImagesRestored,
    dlcImagesMissing,
    dlcParentsInvalid,
    dlcOwnersInvalid,
  });
}
