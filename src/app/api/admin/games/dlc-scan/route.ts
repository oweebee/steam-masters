import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamDlcAppIds, getSteamGameData, sleep } from "@/lib/steam";
import { persistRemoteImage } from "@/lib/storedImages";
import { writeAppLog } from "@/lib/appLog";
import { recalculateCatalogRarity } from "@/lib/catalogRarity";
import { cardDefense } from "@/lib/cardDefense";

const STATE_KEY = "DLC_CATALOG_SCAN";
const DLC_BATCH_SIZE = 5;

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

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const row = await prisma.appSetting.findUnique({ where: { key: STATE_KEY } });
  return NextResponse.json({ state: row ? JSON.parse(row.value) as ScanState : null });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const body = await req.json().catch(() => ({}));
  const runId = typeof body?.runId === "string" ? body.runId : `dlc-scan-${crypto.randomUUID()}`;
  const saved = await prisma.appSetting.findUnique({ where: { key: STATE_KEY } });
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
    runId,
  } : { ...(JSON.parse(saved.value) as ScanState), lastSteamRequestAt: Number((JSON.parse(saved.value) as Partial<ScanState>).lastSteamRequestAt) || 0 };

  if (state.done && body?.restart !== true) return NextResponse.json({ ...state, done: true });

  try {
    const parent = state.dlcOffset > 0 && state.cursor
      ? await prisma.steamGame.findFirst({ where: { id: state.cursor, contentType: "GAME" }, select: { id: true, name: true } })
      : await prisma.steamGame.findFirst({
          where: { contentType: "GAME", ...(state.cursor ? { id: { gt: state.cursor } } : {}) },
          orderBy: { id: "asc" },
          select: { id: true, name: true },
        });
    if (!parent) {
      state.done = true;
      await recalculateCatalogRarity();
      await writeAppLog({
        runId: state.runId,
        category: "SYNC",
        level: state.errors ? "WARNING" : "SUCCESS",
        message: `Scan DLC terminé : ${state.scannedGames} jeux analysés, ${state.imported} DLC importés, ${state.rejected} refusés, ${state.errors} erreurs`,
        details: { ...state },
      });
      await saveState(state);
      return NextResponse.json(state);
    }

    let dlcIds: string[];
    try {
      await sleep(Math.max(0, 900 - (Date.now() - state.lastSteamRequestAt)));
      state.lastSteamRequestAt = Date.now();
      dlcIds = (await getSteamDlcAppIds(Number(parent.id))).map(String);
    } catch (error) {
      state.cursor = parent.id;
      state.dlcOffset = 0;
      state.scannedGames += 1;
      state.errors += 1;
      const message = error instanceof Error ? error.message : "Lecture Steam impossible";
      await writeAppLog({ runId: state.runId, category: "SYNC", level: "ERROR", message: `DLC : lecture du jeu ${parent.name} impossible — ${message}`, details: { parentAppId: parent.id } });
      await saveState(state);
      return NextResponse.json({ ...state, current: parent.name });
    }

    await prisma.steamGame.update({ where: { id: parent.id }, data: { dlcAppIds: dlcIds } });
    const start = state.cursor === parent.id ? state.dlcOffset : 0;
    const batch = dlcIds.slice(start, start + DLC_BATCH_SIZE);
    let offset = start;

    for (const dlcId of batch) {
      offset += 1;
      const existing = await prisma.steamGame.findUnique({ where: { id: dlcId }, select: { contentType: true } });
      if (existing?.contentType === "GAME") {
        state.rejected += 1;
        await writeAppLog({ runId: state.runId, category: "SYNC", level: "WARNING", message: `DLC ${dlcId} ignoré : AppID déjà catalogué comme jeu`, details: { parentAppId: parent.id, dlcAppId: dlcId } });
        continue;
      }
      if (existing) continue;

      try {
        await sleep(Math.max(0, 900 - (Date.now() - state.lastSteamRequestAt)));
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
            developers: [],
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
        state.errors += 1;
        const message = error instanceof Error ? error.message : "Import DLC impossible";
        await writeAppLog({ runId: state.runId, category: "SYNC", level: "ERROR", message: `${parent.name} : DLC ${dlcId} en erreur — ${message}`, details: { appid: dlcId, parentAppId: parent.id } });
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
    return NextResponse.json({ ...state, current: parent.name, foundDlc: dlcIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan DLC impossible";
    await writeAppLog({ runId: state.runId, category: "SYNC", level: "ERROR", message: `Scan DLC interrompu : ${message}`, details: { ...state } });
    await saveState(state);
    return NextResponse.json({ error: message, ...state }, { status: 500 });
  }
}
