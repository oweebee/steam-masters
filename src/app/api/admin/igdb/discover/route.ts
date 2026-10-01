import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { discoverIgdbGames, getIgdbPlatformNames, normalizeCatalogTitle } from "@/lib/igdb";
import { igdbNumericId } from "@/lib/igdbIds";
import { writeAppLog } from "@/lib/appLog";

const COMPLETE_PLATFORMS_KEY = "IGDB_COMPLETE_PLATFORM_IDS";

async function rememberPlatformCompletion(platformId: number, complete: boolean) {
  const row = await prisma.appSetting.findUnique({ where: { key: COMPLETE_PLATFORMS_KEY } });
  let ids: number[] = [];
  try { ids = row ? JSON.parse(row.value) : []; } catch { ids = []; }
  const next = new Set(ids.filter(Number.isSafeInteger));
  if (complete) next.add(platformId); else next.delete(platformId);
  await prisma.appSetting.upsert({ where: { key: COMPLETE_PLATFORMS_KEY }, create: { key: COMPLETE_PLATFORMS_KEY, value: JSON.stringify([...next]) }, update: { value: JSON.stringify([...next]) } });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runId = req.nextUrl.searchParams.get("runId");
  await writeAppLog({ runId, category: "DISCOVERY", message: "Recherche de jeux IGDB absents du catalogue démarrée" });

  try {
    const platformParam = req.nextUrl.searchParams.get("platform");
    const platformId = platformParam ? parseInt(platformParam, 10) : NaN;
    if (!Number.isSafeInteger(platformId) || platformId <= 0) return NextResponse.json({ error: "Choisis une plateforme avant de lancer l'import en masse." }, { status: 400 });
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.max(1, Math.min(1000, parseInt(limitParam ?? "100", 10) || 100));
    // Une carte par (jeu, plateforme) : on n'exclut que les jeux déjà présents
    // SUR CETTE plateforme (Steam compte comme PC).
    const [platformName] = await getIgdbPlatformNames([platformId]);
    const onPlatform = platformName
      ? await prisma.steamGame.findMany({
          where: { OR: [{ source: "IGDB", platforms: { has: platformName } }, ...(platformName === "PC" ? [{ source: "STEAM" as const }] : [])] },
          select: { id: true, name: true, source: true },
        })
      : [];
    const excluded = new Set(onPlatform.filter((g) => g.source === "IGDB").map(({ id }) => igdbNumericId(id)).filter(Number.isSafeInteger));
    const names = new Set(onPlatform.map(({ name }) => normalizeCatalogTitle(name)));
    const discovered = await discoverIgdbGames(limit, platformId, excluded, names);
    const candidates = discovered.map((game) => ({ id: `igdb-${game.id}`, name: game.name }));
    await rememberPlatformCompletion(platformId, candidates.length === 0);
    await writeAppLog({ runId, category: "DISCOVERY", level: "SUCCESS", message: `${candidates.length} jeu(x) IGDB absent(s) du catalogue préparé(s)`, details: { discovered: discovered.length, available: candidates.length, platformId } });
    return NextResponse.json({ ids: candidates.map((candidate) => candidate.id), candidates, platformId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Découverte IGDB impossible";
    await writeAppLog({ runId, category: "DISCOVERY", level: "ERROR", message: `Découverte échouée : ${message}` });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
