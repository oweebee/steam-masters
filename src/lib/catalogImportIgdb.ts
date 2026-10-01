import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIgdbGameData, getIgdbPlatformNames, upsertStudiosForIgdbDevelopers } from "@/lib/igdb";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { persistRemoteImage } from "@/lib/storedImages";
import { writeAppLog } from "@/lib/appLog";
import { igdbDefense } from "@/lib/cardDefense";
import { atkFromReviewScore } from "@/lib/cardAttack";
import { archiveCatalogIssue } from "@/lib/catalogIssueArchive";
import { IGDB_PC_PLATFORM_ID, igdbPlatformCardId, pcReleaseAllowed } from "@/lib/igdbIds";

// Duplication volontaire de catalogImport.ts (Steam), adaptée à IGDB :
// - id catalogue = `igdb-<id>` (jamais numérique pur, pour ne jamais collisionner
//   avec un AppID Steam)
// - pas de contrôle "DEF > 0" bloquant comme Steam (ownerEstimate IGDB peut être
//   légitimement 0 pour un titre confidentiel/rétro peu suivi) : igdbDefense(0)=5,
//   donc DEF minimum 5 au lieu de refuser l'import
export async function importCatalogGameIgdb(igdbIdRaw: string | number, runId?: string, skipRecalc = false, expectedPlatformId?: number): Promise<NextResponse> {
  const igdbId = Number(igdbIdRaw);
  if (!Number.isSafeInteger(igdbId) || igdbId <= 0) return NextResponse.json({ error: "id IGDB requis" }, { status: 400 });
  // Une carte par (jeu, plateforme) : sans plateforme imposée (import manuel),
  // on importe une carte pour chaque support IGDB du jeu.
  if (!expectedPlatformId) {
    let platformIds: number[] = [];
    let allPlatformIds: number[] = [];
    try {
      const pre = await getIgdbGameData(igdbId);
      allPlatformIds = pre.platformIds;
      // PC seulement si sortie PC avant 2005 (après : géré par Steam).
      platformIds = allPlatformIds.filter((pid) => pid !== IGDB_PC_PLATFORM_ID || pcReleaseAllowed(pre.releaseDates));
    } catch { /* erreur gérée par le chemin normal */ }
    if (allPlatformIds.length > 0 && platformIds.length === 0) {
      return NextResponse.json({ error: "Jeu PC sorti en 2005 ou après (ou sans date PC) : géré par Steam, pas d'import IGDB." }, { status: 422 });
    }
    if (platformIds.length > 0) {
      const results = [];
      for (const pid of platformIds) {
        const res: NextResponse = await importCatalogGameIgdb(igdbId, runId, true, pid);
        if (res.ok) results.push(await res.json());
      }
      if (!skipRecalc && results.length) await recalculateCatalogRarity();
      if (!results.length) return NextResponse.json({ error: "Aucune carte IGDB importée" }, { status: 422 });
      return NextResponse.json({ ...results[0], platformCards: results.length });
    }
  }
  let cardId = `igdb-${igdbId}`;
  if (expectedPlatformId) {
    // Carte historique `igdb-<id>` réutilisée si elle porte déjà exactement ce support.
    const [platformName] = await getIgdbPlatformNames([expectedPlatformId]);
    const legacy = await prisma.steamGame.findUnique({ where: { id: cardId }, select: { platforms: true } });
    if (!(legacy && platformName && legacy.platforms.length === 1 && legacy.platforms[0] === platformName)) {
      cardId = igdbPlatformCardId(igdbId, expectedPlatformId);
    }
  }
  await writeAppLog({ runId, category: "IMPORT", message: `Import IGDB démarré pour l'id ${igdbId}`, details: { igdbId } });

  let data;
  try {
    data = await getIgdbGameData(igdbId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import IGDB impossible";
    await archiveCatalogIssue({ scope: "GAME", itemId: cardId, name: `IGDB #${igdbId}`, reason: message });
    await writeAppLog({ runId, category: "IMPORT", level: "ERROR", message: `Import ${igdbId} refusé : ${message}`, details: { igdbId } });
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (!data.headerImage) {
    await archiveCatalogIssue({ scope: data.contentType, itemId: cardId, name: data.name, reason: "Aucune image de couverture IGDB" });
    await writeAppLog({ runId, category: "IMPORT", level: "WARNING", message: `${data.name} refusé : pas de cover IGDB`, details: { igdbId } });
    return NextResponse.json({ error: "Jeu refusé : aucune image de couverture IGDB" }, { status: 422 });
  }
  if (expectedPlatformId === IGDB_PC_PLATFORM_ID && !pcReleaseAllowed(data.releaseDates)) {
    await writeAppLog({ runId, category: "IMPORT", level: "WARNING", message: `${data.name} refusé : PC sorti en 2005 ou après (ou sans date PC) — géré par Steam`, details: { igdbId } });
    return NextResponse.json({ error: "Jeu PC sorti en 2005 ou après (ou sans date PC) : géré par Steam." }, { status: 422 });
  }
  if (expectedPlatformId && !data.platformIds.includes(expectedPlatformId)) {
    await writeAppLog({ runId, category: "IMPORT", level: "WARNING", message: `${data.name} refusé : plateforme IGDB inattendue`, details: { igdbId, expectedPlatformId, platformIds: data.platformIds } });
    return NextResponse.json({ error: "Jeu refusé : il n'appartient pas à la plateforme sélectionnée." }, { status: 422 });
  }
  const parentGameId = data.parentIgdbId ? `igdb-${data.parentIgdbId}` : null;
  if (data.contentType === "DLC" && !parentGameId) {
    await archiveCatalogIssue({ scope: "DLC", itemId: cardId, name: data.name, reason: "DLC sans jeu parent IGDB confirmé" });
    await writeAppLog({ runId, category: "IMPORT", level: "WARNING", message: `${data.name} refusé : IGDB ne fournit aucun jeu parent`, details: { igdbId } });
    return NextResponse.json({ error: "DLC refusé : jeu parent IGDB introuvable" }, { status: 422 });
  }
  let developers = data.developers;
  let resolvedParentId = parentGameId;
  if (data.contentType === "DLC") {
    const parent = await prisma.steamGame.findFirst({
      where: { OR: [{ id: parentGameId! }, { id: { startsWith: `${parentGameId}-p` } }] },
      select: { id: true, contentType: true, developers: true },
      orderBy: { id: "asc" },
    });
    if (parent?.contentType !== "GAME") {
      await archiveCatalogIssue({ scope: "DLC", itemId: cardId, parentId: parentGameId ?? undefined, name: data.name, reason: "Jeu parent absent du catalogue; importer le jeu avant le DLC" });
      return NextResponse.json({ error: "DLC refusé : importez d'abord son jeu parent" }, { status: 422 });
    }
    resolvedParentId = parent.id;
    if (parent.developers.length > 0) developers = parent.developers;
  }

  let headerImage: string;
  try {
    headerImage = await persistRemoteImage("game", cardId, data.headerImage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image du jeu impossible à enregistrer";
    await writeAppLog({ runId, category: "IMAGE", level: "ERROR", message: `Image de ${data.name} non enregistrée : ${message}`, details: { igdbId } });
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const existing = await prisma.steamGame.findUnique({ where: { id: cardId }, select: { rarity: true } });
  const rarity = existing?.rarity ?? "COMMON";

  // En import en masse, le support affiché est exactement celui demandé dans
  // l’interface. Une fiche IGDB peut aussi lister Arcade/ports secondaires.
  const displayedPlatformIds = expectedPlatformId ? [expectedPlatformId] : data.platformIds;
  const common = {
    name: data.name,
    description: data.description,
    headerImage,
    reviewScore: data.reviewScore,
    peakCcu: data.peakCcu,
    ownerEstimate: data.ownerEstimate,
    atk: atkFromReviewScore(data.reviewScore),
    def: igdbDefense(data.ownerEstimate),
    tags: data.tags,
    developers,
    priceCents: data.priceCents,
    isFree: data.isFree,
    contentType: data.contentType,
    source: "IGDB" as const,
    parentGameId: resolvedParentId,
    dlcAppIds: data.dlcIgdbIds.map((id) => `igdb-${id}`),
    platforms: await getIgdbPlatformNames(displayedPlatformIds),
  };

  const game = await prisma.steamGame.upsert({
    where: { id: cardId },
    update: { ...common, rarity },
    create: { id: cardId, ...common, rarity },
  });

  const studioImport = data.contentType === "GAME"
    ? await upsertStudiosForIgdbDevelopers(data.developers)
    : { created: 0, updated: 0, linked: 0 };
  if (!skipRecalc) await recalculateCatalogRarity();

  const finalGame = await prisma.steamGame.findUnique({ where: { id: game.id } });
  await writeAppLog({
    runId,
    category: "IMPORT",
    level: "SUCCESS",
    message: `${data.name} (${data.contentType}) importé depuis IGDB${data.contentType === "GAME" ? ` — ${studioImport.created} studio(s) créé(s), ${studioImport.updated} mis à jour` : ` — parent ${parentGameId}`}`,
    details: { igdbId, contentType: data.contentType, parentGameId, developers, studioImport, def: data.ownerEstimate, reviewScore: data.reviewScore },
  });
  return NextResponse.json({ ...(finalGame ?? game), studioImport });
}
