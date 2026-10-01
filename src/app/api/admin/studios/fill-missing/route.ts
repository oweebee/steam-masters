import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getSteamDeveloperGames,
  getSteamGameData,
  upsertStudiosForDevelopers,
  sleep,
  STEAM_REQUEST_DELAY_MS,
} from "@/lib/steam";
import { persistRemoteImage } from "@/lib/storedImages";
import { writeAppLog } from "@/lib/appLog";
import { cardDefense } from "@/lib/cardDefense";
import { atkFromReviewScore } from "@/lib/cardAttack";
import { archiveCatalogIssue } from "@/lib/catalogIssueArchive";

export const maxDuration = 300;

const STATE_KEY = "STUDIO_FILL_MISSING";
const CANCEL_KEY = "STUDIO_FILL_MISSING_CANCEL";
// Jeux max à importer par appel (évite les timeouts serverless)
const GAMES_PER_CALL = 8;

type FillState = {
  cursor: string | null;        // dernier studio traité
  studiosScanned: number;
  total: number;
  imported: number;
  errors: number;
  done: boolean;
  cancelled?: boolean;
  runId: string;
  newGameIds: string[];          // IDs des jeux importés → DLC scan ciblé
  lastSteamRequestAt: number;
};

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

async function loadState(): Promise<FillState | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: STATE_KEY }, select: { value: true } });
  return row ? (JSON.parse(row.value) as FillState) : null;
}

async function saveState(state: FillState) {
  await prisma.appSetting.upsert({
    where: { key: STATE_KEY },
    update: { value: JSON.stringify(state) },
    create: { key: STATE_KEY, value: JSON.stringify(state) },
  });
}

async function cancelRequested() {
  return Boolean(await prisma.appSetting.findUnique({ where: { key: CANCEL_KEY }, select: { key: true } }));
}

async function finishScan(state: FillState, cancelled: boolean) {
  state.done = true;
  state.cancelled = cancelled;
  await upsertStudiosForDevelopers(
    Array.from(new Set(
      (await prisma.steamGame.findMany({ where: { id: { in: state.newGameIds }, contentType: "GAME" }, select: { developers: true } }))
        .flatMap((g) => g.developers)
    ))
  );
  await saveState(state);
  await prisma.appSetting.deleteMany({ where: { key: CANCEL_KEY } });
  await writeAppLog({
    runId: state.runId,
    category: "SYNC",
    level: state.errors ? "WARNING" : "SUCCESS",
    message: cancelled
      ? `Complétion studios interrompue : ${state.studiosScanned}/${state.total} studios, ${state.imported} jeux importés, ${state.errors} erreur(s)`
      : `Complétion studios terminée : ${state.studiosScanned}/${state.total} studios, ${state.imported} jeux importés, ${state.errors} erreur(s)`,
    details: { ...state },
  });
  return NextResponse.json(state);
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  return NextResponse.json({ state: await loadState() });
}

export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (body?.cancel === true) {
    const state = await loadState();
    if (!state || state.done) return NextResponse.json({ done: true, state });
    if (body?.defer === true) {
      await prisma.appSetting.upsert({
        where: { key: CANCEL_KEY },
        update: { value: "1" },
        create: { key: CANCEL_KEY, value: "1" },
      });
      return NextResponse.json({ stopRequested: true });
    }
    return finishScan(state, true);
  }

  const runId = typeof body?.runId === "string" ? body.runId : `fill-studios-${crypto.randomUUID()}`;
  const restart = body?.restart === true;

  if (restart) await prisma.appSetting.deleteMany({ where: { key: { in: [STATE_KEY, CANCEL_KEY] } } });

  let state: FillState = (restart || !(await loadState()))
    ? {
        cursor: null,
        studiosScanned: 0,
        total: await prisma.studio.count(),
        imported: 0,
        errors: 0,
        done: false,
        cancelled: false,
        runId,
        newGameIds: [],
        lastSteamRequestAt: 0,
      }
    : { ...(await loadState())!, lastSteamRequestAt: Number((await loadState())!.lastSteamRequestAt) || 0 };

  if (state.done && !restart) return NextResponse.json({ ...state, done: true });
  if (await cancelRequested()) return finishScan(state, true);

  // Prochain studio à traiter
  const studio = await prisma.studio.findFirst({
    where: state.cursor ? { name: { gt: state.cursor } } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (!studio) return finishScan(state, false);

  try {
    // Récupérer la liste officielle Steam des jeux de ce studio
    await sleep(Math.max(0, STEAM_REQUEST_DELAY_MS - (Date.now() - state.lastSteamRequestAt)));
    state.lastSteamRequestAt = Date.now();

    let officialGames: Awaited<ReturnType<typeof getSteamDeveloperGames>>;
    try {
      officialGames = await getSteamDeveloperGames(studio.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Steam indisponible";
      await writeAppLog({ runId, category: "SYNC", level: "WARNING", message: `${studio.name} : catalogue Steam inaccessible — ${msg}` });
      state.cursor = studio.name;
      state.studiosScanned += 1;
      state.errors += 1;
      await saveState(state);
      return NextResponse.json({ ...state, current: studio.name, warning: msg });
    }

    // Trouver les jeux absents de la DB
    const existingIds = new Set(
      (await prisma.steamGame.findMany({
        where: { id: { in: officialGames.map((g) => g.appid) } },
        select: { id: true },
      })).map((g) => g.id)
    );
    const missing = officialGames.filter((g) => !existingIds.has(g.appid)).slice(0, GAMES_PER_CALL);

    for (const game of missing) {
      if (await cancelRequested()) {
        state.cursor = studio.name;
        await saveState(state);
        return finishScan(state, true);
      }
      await sleep(Math.max(0, STEAM_REQUEST_DELAY_MS - (Date.now() - state.lastSteamRequestAt)));
      state.lastSteamRequestAt = Date.now();
      try {
        const data = await getSteamGameData(Number(game.appid));
        if (data.ownerEstimate <= 0) throw new Error("DEF invalide : ownerEstimate nul");
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
            rarity: "COMMON",
            atk: atkFromReviewScore(data.reviewScore),
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
        state.newGameIds = [...new Set([...state.newGameIds, String(data.appid)])];
        state.imported += 1;
        await writeAppLog({ runId, category: "SYNC", level: "SUCCESS", message: `${studio.name} : ${data.name} importé`, details: { appid: String(data.appid), studio: studio.name } });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import impossible";
        state.errors += 1;
        await archiveCatalogIssue({ scope: "GAME", itemId: game.appid, name: game.name, reason: msg });
        await writeAppLog({ runId, category: "SYNC", level: "WARNING", message: `${studio.name} : ${game.name} ignoré — ${msg}`, details: { appid: game.appid } });
      }
    }

    state.cursor = studio.name;
    state.studiosScanned += 1;
    await saveState(state);
    if (await cancelRequested()) return finishScan(state, true);
    return NextResponse.json({
      ...state,
      current: studio.name,
      foundMissing: missing.length,
      totalMissing: officialGames.length - existingIds.size,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inattendue";
    state.errors += 1;
    await saveState(state);
    await writeAppLog({ runId, category: "SYNC", level: "ERROR", message: `fill-missing interrompu sur ${studio.name} : ${msg}` });
    return NextResponse.json({ ...state, error: msg }, { status: 500 });
  }
}
