import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamDlcAppIds, getSteamGameData, sleep, STEAM_REQUEST_DELAY_MS } from "@/lib/steam";
import { persistRemoteImage } from "@/lib/storedImages";
import { writeAppLog } from "@/lib/appLog";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { cardDefense } from "@/lib/cardDefense";

const STATE_KEY = "DLC_CATALOG_SCAN";
const CANCEL_KEY = "DLC_CATALOG_SCAN_CANCEL";
const ERROR_ARCHIVE_KEY = "DLC_CATALOG_ERROR_ARCHIVE";
const ERROR_ARCHIVE_PURGED_AT_KEY = "DLC_CATALOG_ERROR_ARCHIVE_PURGED_AT";
const DLC_BATCH_SIZE = 5;

type ArchivedSteamError = { scope: "DLC" | "GAME"; appId: string; parentAppId?: string; name: string; reason: string; firstSeen: string; lastSeen: string; attempts: number };

function isExpectedSteamSkip(message: string) {
  return /appid \d+ introuvable|n'est ni un jeu ni un DLC|n'est pas un jeu parent|type DLC ou jeu parent non confirmé|HTTP 404/i.test(message);
}

function isTransientSteamFailure(message: string) {
  return /HTTP (?:429|5\d\d)|indisponible après|timeout|timed out|ECONNRESET|fetch failed|network/i.test(message);
}

function isArchivableUnknownApp(message: string) {
  return /appid \d+ introuvable|n'est ni un jeu ni un DLC|HTTP 404/i.test(message);
}

async function readErrorArchive(): Promise<Record<string, ArchivedSteamError>> {
  const row = await prisma.appSetting.findUnique({ where: { key: ERROR_ARCHIVE_KEY }, select: { value: true } });
  if (!row) return {};
  try { return JSON.parse(row.value) as Record<string, ArchivedSteamError>; } catch { return {}; }
}

async function archiveSteamError(entry: Omit<ArchivedSteamError, "firstSeen" | "lastSeen" | "attempts">) {
  const archive = await readErrorArchive();
  const key = `${entry.scope}:${entry.appId}`;
  const now = new Date().toISOString();
  const previous = archive[key];
  archive[key] = { ...entry, firstSeen: previous?.firstSeen ?? now, lastSeen: now, attempts: (previous?.attempts ?? 0) + 1 };
  await prisma.appSetting.upsert({
    where: { key: ERROR_ARCHIVE_KEY },
    update: { value: JSON.stringify(archive) },
    create: { key: ERROR_ARCHIVE_KEY, value: JSON.stringify(archive) },
  });
}

async function archiveHistoricalUnknownDlcErrors() {
  const purgedAt = await prisma.appSetting.findUnique({ where: { key: ERROR_ARCHIVE_PURGED_AT_KEY }, select: { value: true } });
  const logs = await prisma.appLog.findMany({
    where: { category: "SYNC", message: { contains: "DLC" }, ...(purgedAt?.value ? { createdAt: { gt: new Date(purgedAt.value) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { message: true, details: true, createdAt: true },
  });
  const archive = await readErrorArchive();
  let added = 0;
  for (const log of logs) {
    if (!/appid \d+ introuvable|n'est ni un jeu ni un DLC|HTTP 404/i.test(log.message)) continue;
    const details = log.details && typeof log.details === "object" ? log.details as Record<string, unknown> : {};
    const dlcMatch = log.message.match(/DLC\s+(\d+)/i);
    const parentMatch = log.message.match(/jeu\s+([^—]+?)\s+ignoré/i);
    const appId = String(details.appid ?? dlcMatch?.[1] ?? details.parentAppId ?? "");
    if (!/^\d+$/.test(appId)) continue;
    const scope = details.appid || dlcMatch ? "DLC" : "GAME";
    const key = `${scope}:${appId}`;
    if (archive[key]) continue;
    const reason = log.message.split("—").at(-1)?.trim() || log.message;
    archive[key] = {
      scope,
      appId,
      ...(details.parentAppId ? { parentAppId: String(details.parentAppId) } : {}),
      name: parentMatch?.[1]?.trim() ?? "Historique du scan DLC",
      reason,
      firstSeen: log.createdAt.toISOString(),
      lastSeen: log.createdAt.toISOString(),
      attempts: 1,
    };
    added += 1;
  }
  if (added) await prisma.appSetting.upsert({
    where: { key: ERROR_ARCHIVE_KEY },
    update: { value: JSON.stringify(archive) },
    create: { key: ERROR_ARCHIVE_KEY, value: JSON.stringify(archive) },
  });
  return added;
}

type ScanState = {
  cursor: string | null;
  dlcOffset: number;
  scannedGames: number;
  imported: number;
  rejected: number;
  errors: number;
  total: number;
  lastSteamRequestAt: number;
  done: boolean;
  cancelled?: boolean;
  runId: string;
};

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

async function saveState(state: ScanState) {
  await prisma.appSetting.upsert({
    where: { key: STATE_KEY },
    update: { value: JSON.stringify(state) },
    create: { key: STATE_KEY, value: JSON.stringify(state) },
  });
}

async function cancelRequested() {
  return Boolean(await prisma.appSetting.findUnique({ where: { key: CANCEL_KEY }, select: { key: true } }));
}

async function finishScan(state: ScanState, cancelled: boolean) {
  state.done = true;
  state.cancelled = cancelled;
  await recalculateCatalogRarity();
  await writeAppLog({
    runId: state.runId,
    category: "SYNC",
    level: state.errors ? "WARNING" : "SUCCESS",
    message: cancelled
      ? `Scan DLC interrompu et catalogue validé : ${state.scannedGames} jeux analysés, ${state.imported} DLC importés, ${state.rejected} refusés, ${state.errors} erreurs`
      : `Scan DLC terminé : ${state.scannedGames} jeux analysés, ${state.imported} DLC importés, ${state.rejected} refusés, ${state.errors} erreurs`,
    details: { ...state },
  });
  await saveState(state);
  await prisma.appSetting.deleteMany({ where: { key: CANCEL_KEY } });
  return NextResponse.json(state);
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const row = await prisma.appSetting.findUnique({ where: { key: STATE_KEY } });
  return NextResponse.json({ state: row ? JSON.parse(row.value) as ScanState : null, archivedErrors: Object.keys(await readErrorArchive()).length });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const saved = await prisma.appSetting.findUnique({ where: { key: STATE_KEY } });
  if (body?.purgeErrorArchive === true) {
    const archivedErrors = Object.keys(await readErrorArchive()).length;
    await prisma.appSetting.deleteMany({ where: { key: ERROR_ARCHIVE_KEY } });
    const purgedAt = new Date().toISOString();
    await prisma.appSetting.upsert({ where: { key: ERROR_ARCHIVE_PURGED_AT_KEY }, update: { value: purgedAt }, create: { key: ERROR_ARCHIVE_PURGED_AT_KEY, value: purgedAt } });
    await writeAppLog({ runId: typeof body?.runId === "string" ? body.runId : null, category: "SYNC", level: "WARNING", message: `Archive des AppID Steam DLC inconnus purgée : ${archivedErrors} entrée(s)` });
    return NextResponse.json({ purged: archivedErrors, archivedErrors: 0 });
  }
  if (body?.cancel === true) {
    const state = saved ? JSON.parse(saved.value) as ScanState : null;
    if (!state || state.done) return NextResponse.json({ done: true, state });
    if (body?.defer === true) {
      await prisma.appSetting.upsert({
        where: { key: CANCEL_KEY },
        update: { value: JSON.stringify({ requestedAt: Date.now() }) },
        create: { key: CANCEL_KEY, value: JSON.stringify({ requestedAt: Date.now() }) },
      });
      return NextResponse.json({ stopRequested: true, state });
    }
    return finishScan(state, true);
  }
  const runId = typeof body?.runId === "string" ? body.runId : `dlc-scan-${crypto.randomUUID()}`;
  if (body?.restart === true || !saved) await prisma.appSetting.deleteMany({ where: { key: CANCEL_KEY } });
  let state: ScanState = body?.restart === true || !saved ? {
    cursor: null,
    dlcOffset: 0,
    scannedGames: 0,
    imported: 0,
    rejected: 0,
    errors: 0,
    total: await prisma.steamGame.count({ where: { contentType: "GAME" } }),
    lastSteamRequestAt: 0,
    done: false,
    cancelled: false,
    runId,
  } : { ...(JSON.parse(saved.value) as ScanState), lastSteamRequestAt: Number((JSON.parse(saved.value) as Partial<ScanState>).lastSteamRequestAt) || 0 };

  if (state.done && body?.restart !== true) return NextResponse.json({ ...state, done: true });
  if (await cancelRequested()) return finishScan(state, true);
  if (body?.restart === true || !saved) await archiveHistoricalUnknownDlcErrors();
  const errorArchive = await readErrorArchive();

  try {
    const parent = state.dlcOffset > 0 && state.cursor
      ? await prisma.steamGame.findFirst({ where: { id: state.cursor, contentType: "GAME" }, select: { id: true, name: true, developers: true } })
      : await prisma.steamGame.findFirst({
          where: { contentType: "GAME", ...(state.cursor ? { id: { gt: state.cursor } } : {}) },
          orderBy: { id: "asc" },
          select: { id: true, name: true, developers: true },
        });
    if (!parent) {
      return finishScan(state, false);
    }
    if (errorArchive[`GAME:${parent.id}`]) {
      state.cursor = parent.id;
      state.dlcOffset = 0;
      state.scannedGames += 1;
      state.rejected += 1;
      await saveState(state);
      return NextResponse.json({ ...state, current: parent.name, archivedSkip: true });
    }

    let dlcIds: string[];
    try {
      await sleep(Math.max(0, STEAM_REQUEST_DELAY_MS - (Date.now() - state.lastSteamRequestAt)));
      state.lastSteamRequestAt = Date.now();
      dlcIds = (await getSteamDlcAppIds(Number(parent.id))).map(String);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lecture Steam impossible";
      if (await cancelRequested()) return finishScan(state, true);
      if (isExpectedSteamSkip(message)) {
        if (isArchivableUnknownApp(message)) await archiveSteamError({ scope: "GAME", appId: parent.id, name: parent.name, reason: message });
        state.cursor = parent.id;
        state.dlcOffset = 0;
        state.scannedGames += 1;
        state.rejected += 1;
        await writeAppLog({ runId: state.runId, category: "SYNC", level: "WARNING", message: `DLC : jeu ${parent.name} ignoré — ${message}`, details: { parentAppId: parent.id } });
        await saveState(state);
        return NextResponse.json({ ...state, current: parent.name });
      }
      // Keep the cursor before this parent. The client stops on 503; a manual
      // resume retries this exact game instead of silently skipping its DLCs.
      state.errors += 1;
      await writeAppLog({ runId: state.runId, category: "SYNC", level: "ERROR", message: `DLC : lecture du jeu ${parent.name} interrompue, reprise conservée — ${message}`, details: { parentAppId: parent.id, retryable: isTransientSteamFailure(message) } });
      await saveState(state);
      return NextResponse.json({ ...state, current: parent.name, error: message, retryable: isTransientSteamFailure(message) }, { status: 503 });
    }

    await prisma.steamGame.update({ where: { id: parent.id }, data: { dlcAppIds: dlcIds } });
    const start = state.cursor === parent.id ? state.dlcOffset : 0;
    const batch = dlcIds.slice(start, start + DLC_BATCH_SIZE);
    let offset = start;

    for (const dlcId of batch) {
      offset += 1;
      if (errorArchive[`DLC:${dlcId}`]) {
        state.rejected += 1;
        continue;
      }
      const existing = await prisma.steamGame.findUnique({ where: { id: dlcId }, select: { contentType: true, developers: true } });
      if (existing?.contentType === "GAME") {
        state.rejected += 1;
        await writeAppLog({ runId: state.runId, category: "SYNC", level: "WARNING", message: `DLC ${dlcId} ignoré : AppID déjà catalogué comme jeu`, details: { parentAppId: parent.id, dlcAppId: dlcId } });
        continue;
      }
      if (existing?.contentType === "DLC") {
        if (existing.developers.length === 0 && parent.developers.length > 0) {
          await prisma.steamGame.update({ where: { id: dlcId }, data: { developers: parent.developers } });
        }
        continue;
      }

      try {
        await sleep(Math.max(0, STEAM_REQUEST_DELAY_MS - (Date.now() - state.lastSteamRequestAt)));
        state.lastSteamRequestAt = Date.now();
        const dlc = await getSteamGameData(Number(dlcId));
        if (dlc.contentType !== "DLC" || dlc.parentAppId !== Number(parent.id)) throw new Error("Type DLC ou jeu parent non confirmé par Steam");
        if (dlc.ownerEstimate <= 0) {
          state.rejected += 1;
          await writeAppLog({ runId: state.runId, category: "SYNC", level: "WARNING", message: `${dlc.name} refusé : DEF nulle (estimation SteamSpy absente ou égale à zéro)`, details: { appid: dlcId, parentAppId: parent.id, ownerEstimate: dlc.ownerEstimate } });
          continue;
        }
        const headerImage = await persistRemoteImage("game", dlcId, dlc.headerImage);
        await prisma.steamGame.create({
          data: {
            id: dlcId,
            name: dlc.name,
            description: dlc.description,
            headerImage,
            reviewScore: dlc.reviewScore,
            peakCcu: dlc.peakCcu,
            ownerEstimate: dlc.ownerEstimate,
            rarity: "COMMON",
            atk: dlc.reviewScore,
            def: cardDefense(dlc.ownerEstimate),
            tags: dlc.tags,
            developers: parent.developers,
            priceCents: dlc.priceCents,
            isFree: dlc.isFree,
            contentType: "DLC",
            parentGameId: parent.id,
            dlcAppIds: [],
          },
        });
        state.imported += 1;
        await writeAppLog({ runId: state.runId, category: "SYNC", level: "SUCCESS", message: `${dlc.name} (DLC) importé pour ${parent.name}`, details: { appid: dlcId, parentAppId: parent.id, ownerEstimate: dlc.ownerEstimate } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Import DLC impossible";
        if (isExpectedSteamSkip(message)) {
          if (isArchivableUnknownApp(message)) {
            await archiveSteamError({ scope: "DLC", appId: dlcId, parentAppId: parent.id, name: parent.name, reason: message });
            errorArchive[`DLC:${dlcId}`] = { scope: "DLC", appId: dlcId, parentAppId: parent.id, name: parent.name, reason: message, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), attempts: 1 };
          }
          state.rejected += 1;
          await writeAppLog({ runId: state.runId, category: "SYNC", level: "WARNING", message: `${parent.name} : DLC ${dlcId} ignoré — ${message}`, details: { appid: dlcId, parentAppId: parent.id } });
          continue;
        }
        if (await cancelRequested()) return finishScan(state, true);
        // Offset points at the failed DLC, so resuming will retry it. Earlier
        // successes in this batch are safe: existing catalog entries are skipped.
        state.cursor = parent.id;
        state.dlcOffset = offset - 1;
        state.errors += 1;
        await writeAppLog({ runId: state.runId, category: "SYNC", level: "ERROR", message: `${parent.name} : DLC ${dlcId} interrompu, reprise conservée — ${message}`, details: { appid: dlcId, parentAppId: parent.id, retryable: isTransientSteamFailure(message) } });
        await saveState(state);
        return NextResponse.json({ ...state, current: parent.name, error: message, retryable: isTransientSteamFailure(message) }, { status: 503 });
      }
    }

    if (offset >= dlcIds.length) {
      state.cursor = parent.id;
      state.dlcOffset = 0;
      state.scannedGames += 1;
    } else {
      state.cursor = parent.id;
      state.dlcOffset = offset;
    }
    await saveState(state);
    if (await cancelRequested()) return finishScan(state, true);
    return NextResponse.json({ ...state, current: parent.name, foundDlc: dlcIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan DLC impossible";
    await writeAppLog({ runId: state.runId, category: "SYNC", level: "ERROR", message: `Scan DLC interrompu : ${message}`, details: { ...state } });
    await saveState(state);
    return NextResponse.json({ error: message, ...state }, { status: 500 });
  }
}
