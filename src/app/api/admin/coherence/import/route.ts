import { igdbNumericId } from "@/lib/igdbIds";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { coherenceWrite, getCoherenceReport, rememberCoherenceFailure, repairCoherenceLocally } from "@/lib/catalogCoherence";
import { normalizeCoherenceName } from "@/lib/catalogCoherenceCore";
import { importCatalogGame } from "@/lib/catalogImport";
import { importCatalogGameIgdb } from "@/lib/catalogImportIgdb";
import { getSteamGameData, searchSteamCatalog, sleep } from "@/lib/steam";
import { getIgdbGameData, searchIgdbCatalog } from "@/lib/igdb";
import { writeAppLog } from "@/lib/appLog";
export const maxDuration = 300;
const LOCK = "CATALOG_COHERENCE_STEAM_LOCK";

export async function POST(req: NextRequest) {
  if (((await auth())?.user as { role?: string } | undefined)?.role !== "ADMIN") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.key !== "string" || body.key.length > 2000) return NextResponse.json({ error: "Lien invalide" }, { status: 400 });
  const token = crypto.randomUUID();
  // Un seul verrou partagé Steam+IGDB : les deux pipelines écrivent la même
  // table SteamGame, un verrou par source aurait pu créer des écritures
  // concurrentes sur les mêmes lignes Studio pendant un repair.
  const wait = await coherenceWrite(async (db) => {
    const row = await db.appSetting.findUnique({ where: { key: LOCK } });
    const lease = row ? JSON.parse(row.value) : { until: 0 };
    const stale = lease.until > Date.now() + 11 * 60_000;
    if (!stale && lease.until > Date.now()) return Math.ceil((lease.until - Date.now()) / 1000);
    const value = JSON.stringify({ token, until: Date.now() + 10 * 60_000 });
    await db.appSetting.upsert({ where: { key: LOCK }, create: { key: LOCK, value }, update: { value } });
    return 0;
  });
  if (wait) return NextResponse.json({ error: "Un traitement est en cours ou en pause. Réessaie après le délai indiqué.", retryAfter: wait, paused: true }, { status: 429, headers: { "Retry-After": String(wait) } });
  let cooldown = 4000;
  const runId = `coherence-${token}`;
  try {
    const report = await getCoherenceReport();
    const issue = report.issues.find((entry) => entry.key === body.key);
    if (!issue) return NextResponse.json({ resolved: true, message: "Lien déjà corrigé ou retiré." });
    if (issue.method !== "STEAM" && issue.method !== "IGDB") return NextResponse.json({ error: "Utilise la réparation locale pour ce lien." }, { status: 409 });
    const isIgdb = issue.method === "IGDB";
    try {
      let appId = issue.appId;
      if (!appId && issue.relation === "STUDIO_GAME") {
        if (isIgdb) {
          const found = (await searchIgdbCatalog(issue.targetName)).filter((entry) => normalizeCoherenceName(entry.name) === normalizeCoherenceName(issue.targetName));
          if (found.length !== 1) throw new Error(found.length ? "Plusieurs id IGDB correspondent au nom : vérification manuelle nécessaire." : "Aucune correspondance IGDB exacte pour ce titre.");
          appId = `igdb-${found[0].igdbId}`;
        } else {
          const found = (await searchSteamCatalog(issue.targetName)).filter((entry) => normalizeCoherenceName(entry.name) === normalizeCoherenceName(issue.targetName));
          if (found.length !== 1) throw new Error(found.length ? "Plusieurs AppID correspondent au nom : vérification manuelle nécessaire." : "Aucune correspondance Steam exacte pour ce titre.");
          appId = found[0].appid;
        }
        await sleep(4000);
      }
      const importOne = async (id: string) => {
        const response = isIgdb ? await importCatalogGameIgdb(id, runId) : await importCatalogGame(id, runId);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Import refusé.");
      };
      if (isIgdb) {
        if (!appId || !appId.startsWith("igdb-")) throw new Error("id IGDB fiable introuvable.");
        const igdbNumId = igdbNumericId(appId);
        const data = await getIgdbGameData(igdbNumId);
        if (issue.relation === "STUDIO_GAME" && (data.contentType !== "GAME" || !data.developers.some((name) => normalizeCoherenceName(name) === normalizeCoherenceName(issue.sourceName)))) throw new Error("IGDB ne confirme pas ce jeu pour ce studio. Aucune association créée.");
        if (issue.relation === "GAME_DLC" && (data.contentType !== "DLC" || `igdb-${data.parentIgdbId}` !== issue.sourceId)) throw new Error("IGDB ne confirme pas que ce DLC appartient à ce jeu. Lien à supprimer ou vérifier.");
        if (data.contentType === "DLC" && data.parentIgdbId) {
          const parentId = `igdb-${data.parentIgdbId}`;
          const parent = await prisma.steamGame.findUnique({ where: { id: parentId }, select: { contentType: true } });
          if (parent?.contentType !== "GAME") { await sleep(IGDB_DELAY); await importOne(parentId); }
        }
        await sleep(IGDB_DELAY);
        await importOne(appId);
      } else {
        if (!appId || !/^\d+$/.test(appId)) throw new Error("AppID fiable introuvable.");
        const data = await getSteamGameData(Number(appId));
        if (issue.relation === "STUDIO_GAME" && (data.contentType !== "GAME" || !data.developers.some((name) => normalizeCoherenceName(name) === normalizeCoherenceName(issue.sourceName)))) throw new Error("Steam ne confirme pas ce jeu pour ce studio. Aucune association créée.");
        if (issue.relation === "GAME_DLC" && (data.contentType !== "DLC" || String(data.parentAppId) !== issue.sourceId)) throw new Error("Steam ne confirme pas que ce DLC appartient à ce jeu. Lien à supprimer ou vérifier.");
        if (data.contentType === "DLC" && data.parentAppId) {
          const parent = await prisma.steamGame.findUnique({ where: { id: String(data.parentAppId) }, select: { contentType: true } });
          if (parent?.contentType !== "GAME") { await sleep(4000); await importOne(String(data.parentAppId)); }
        }
        await sleep(4000);
        await importOne(appId);
      }
      await repairCoherenceLocally([issue.key]);
      const remaining = (await getCoherenceReport()).issues.find((entry) => entry.key === issue.key);
      if (remaining) throw new Error(`Données importées, mais le lien n'est pas validé : ${remaining.reason}`);
      await writeAppLog({ runId, category: "REPAIR", level: "SUCCESS", message: `Lien validé après import ${isIgdb ? "IGDB" : "Steam"} : ${issue.sourceName} → ${issue.targetName}` });
      return NextResponse.json({ resolved: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Import interrompu.";
      const rateLimited = /429|rate.?limit/i.test(reason);
      if (rateLimited) cooldown = 5 * 60_000;
      await rememberCoherenceFailure(issue, reason);
      await writeAppLog({ runId, category: "REPAIR", level: "ERROR", message: `${issue.sourceName} → ${issue.targetName} : ${reason}` });
      return NextResponse.json({ error: reason, paused: rateLimited, retryAfter: rateLimited ? 300 : undefined }, { status: rateLimited ? 429 : 422 });
    }
  } finally {
    await coherenceWrite(async (db) => {
      const row = await db.appSetting.findUnique({ where: { key: LOCK } });
      if (row && JSON.parse(row.value).token === token) await db.appSetting.update({ where: { key: LOCK }, data: { value: JSON.stringify({ token, until: Date.now() + cooldown }) } });
    });
  }
}

const IGDB_DELAY = 500;
