import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getSteamDeveloperGames,
  getSteamGameData,
  upsertStudiosForDevelopers,
  sleep,
} from "@/lib/steam";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { persistRemoteImage } from "@/lib/storedImages";
import { writeAppLog } from "@/lib/appLog";
import { cardDefense } from "@/lib/cardDefense";
import { archiveCatalogIssue } from "@/lib/catalogIssueArchive";
import { readCatalogSubmission, writeCatalogSubmission } from "@/lib/catalogSubmission";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const studios = await prisma.studio.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ studios: studios.map((studio) => studio.name) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Nom de studio requis" }, { status: 400 });
  const session = await auth();
  const sessionUser = session?.user as { id?: string; role?: string } | undefined;
  const isAdmin = sessionUser?.role === "ADMIN";
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId : "";
  let playerSubmission = null;
  if (submissionId) {
    if (!sessionUser?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    playerSubmission = await readCatalogSubmission(submissionId);
    if (!playerSubmission || (!isAdmin && playerSubmission.userId !== sessionUser.id) || playerSubmission.phase !== "STUDIOS" || playerSubmission.developers[playerSubmission.studioIndex] !== name) {
      return NextResponse.json({ error: "Ce studio ne fait pas partie de cette soumission ou a déjà été traité." }, { status: 403 });
    }
  } else if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runId = playerSubmission?.id ?? (typeof body?.runId === "string" ? body.runId : null);
  const skipRecalc = body?.skipRecalc === true;

  const studio = await prisma.studio.findUnique({ where: { name }, select: { id: true } });
  if (!studio) return NextResponse.json({ error: "Studio introuvable" }, { status: 404 });

  await writeAppLog({ runId, category: "SYNC", message: `Synchronisation du studio ${name} démarrée` });
  let officialGames: Awaited<ReturnType<typeof getSteamDeveloperGames>>;
  try {
    officialGames = await getSteamDeveloperGames(name, (message, details) =>
      writeAppLog({ runId, category: "SYNC", message, details })
    );
    await writeAppLog({ runId, category: "SYNC", message: `${name} : ${officialGames.length} jeu(x) officiel(s) trouvé(s)` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalogue Steam indisponible";
    await writeAppLog({ runId, category: "SYNC", level: "ERROR", message: `${name} : recherche Steam échouée — ${message}` });
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const existing = new Set((await prisma.steamGame.findMany({
    where: { id: { in: officialGames.map((game) => game.appid) } },
    select: { id: true },
  })).map((game) => game.id));

  let imported = 0;
  const errors: { appid: string; error: string }[] = [];
  const affectedDevelopers = new Set<string>([name]);

  let processed = 0;
  for (const officialGame of officialGames) {
    if (existing.has(officialGame.appid)) continue;
    if (processed > 0) await sleep(900);
    processed += 1;
    try {
      const data = await getSteamGameData(Number(officialGame.appid));
      if (data.ownerEstimate <= 0) throw new Error("Jeu refusé : DEF doit être supérieur à 0");
      const headerImage = await persistRemoteImage("game", String(data.appid), data.headerImage);
      await prisma.steamGame.create({
        data: {
          id: String(data.appid),
          name: data.name,
          description: data.description,
          headerImage,
          reviewScore: data.reviewScore,
          peakCcu: data.peakCcu,
          ownerEstimate: data.ownerEstimate,
          rarity: "COMMON", // provisoire, recalculée par recalculateCatalogRarity() ci-dessous
          atk: data.reviewScore,
          def: cardDefense(data.ownerEstimate),
          tags: data.tags,
          developers: data.developers,
          priceCents: data.priceCents,
          isFree: data.isFree,
          contentType: "GAME",
          parentGameId: null,
          dlcAppIds: data.dlcAppIds.map(String),
        },
      });
      data.developers.forEach((developer) => affectedDevelopers.add(developer));
      imported += 1;
      await writeAppLog({
        runId,
        category: "SYNC",
        level: "SUCCESS",
        message: `${name} : ${data.name} importé (${processed}/${officialGames.length})`,
        details: { appid: String(data.appid), studio: name, developers: data.developers },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import impossible";
      await archiveCatalogIssue({ scope: "GAME", itemId: officialGame.appid, name: name, reason: `${officialGame.appid} — ${message}` });
      errors.push({
        appid: officialGame.appid,
        error: message,
      });
      await writeAppLog({ runId, category: "SYNC", level: "ERROR", message: `${name} : AppID ${officialGame.appid} en erreur — ${message}`, details: { appid: officialGame.appid, studio: name } });
    }
  }

  // Les fiches DLC héritent des studios du jeu parent. On vérifie les DLC
  // déjà présents pour les jeux de ce studio; la découverte/import Steam des
  // AppID manquants reste au scanner DLC dédié (évite les appels en rafale).
  const studioGames = await prisma.steamGame.findMany({
    where: { contentType: "GAME", developers: { has: name } },
    select: { id: true, developers: true, dlcAppIds: true },
  });
  const studioGameIds = studioGames.map((game) => game.id);
  const studioDlcs = studioGameIds.length ? await prisma.steamGame.findMany({
    where: { contentType: "DLC", parentGameId: { in: studioGameIds } },
    select: { id: true, developers: true, parentGameId: true },
  }) : [];
  const parentById = new Map(studioGames.map((game) => [game.id, game]));
  const dlcDeveloperRepairs = new Map<string, string[]>();
  for (const dlc of studioDlcs) {
    const parent = dlc.parentGameId ? parentById.get(dlc.parentGameId) : null;
    if (dlc.developers.length === 0 && parent?.developers.length) {
      const key = JSON.stringify(parent.developers);
      dlcDeveloperRepairs.set(key, [...(dlcDeveloperRepairs.get(key) ?? []), dlc.id]);
    }
  }
  for (const [developerKey, ids] of dlcDeveloperRepairs) {
    await prisma.steamGame.updateMany({ where: { id: { in: ids }, contentType: "DLC" }, data: { developers: JSON.parse(developerKey) as string[] } });
  }
  const cataloguedDlcIds = new Set(studioDlcs.map((dlc) => dlc.id));
  const missingDlcIds = new Set(studioGames.flatMap((game) => game.dlcAppIds).filter((id) => !cataloguedDlcIds.has(id)));
  const dlcsLinked = Array.from(dlcDeveloperRepairs.values()).reduce((sum, ids) => sum + ids.length, 0);

  await upsertStudiosForDevelopers(Array.from(affectedDevelopers));
  if (!skipRecalc) await recalculateCatalogRarity();
  if (playerSubmission) {
    const cataloguedIds = await prisma.steamGame.findMany({
      where: { id: { in: officialGames.map((game) => game.appid) }, contentType: "GAME" },
      select: { id: true },
    });
    playerSubmission.gameIds = Array.from(new Set([...playerSubmission.gameIds, ...cataloguedIds.map((game) => game.id)]));
    playerSubmission.studioIndex += 1;
    if (playerSubmission.studioIndex >= playerSubmission.developers.length) playerSubmission.phase = "DLC";
    await writeCatalogSubmission(playerSubmission);
  }
  await writeAppLog({
    runId,
    category: "SYNC",
    level: errors.length > 0 ? "WARNING" : "SUCCESS",
    message: `${name} terminé : ${imported} jeu(x) ajouté(s), ${studioDlcs.length} DLC vérifié(s), ${dlcsLinked} lien(s) studio réparé(s), ${missingDlcIds.size} DLC à cataloguer, ${errors.length} erreur(s)`,
    details: { studio: name, official: officialGames.length, imported, errors: errors.length, dlcsChecked: studioDlcs.length, dlcsLinked, dlcsMissing: missingDlcIds.size, relatedStudios: Array.from(affectedDevelopers) },
  });
  return NextResponse.json({
    studio: name,
    official: officialGames.length,
    imported,
    existing: officialGames.length - imported - errors.length,
    errors,
    relatedStudios: Array.from(affectedDevelopers),
    dlcsChecked: studioDlcs.length,
    dlcsLinked,
    dlcsMissing: missingDlcIds.size,
    submissionIndex: playerSubmission?.studioIndex ?? null,
    submissionPhase: playerSubmission?.phase ?? null,
  });
}
