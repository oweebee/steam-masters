import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { discoverSteamGameAppids } from "@/lib/steam";
import { CURATED_STEAM_APPIDS } from "@/lib/curatedSteamGames";
import { writeAppLog } from "@/lib/appLog";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runId = req.nextUrl.searchParams.get("runId");
  await writeAppLog({ runId, category: "DISCOVERY", message: "Recherche de nouveaux jeux Steam démarrée" });

  try {
    let discovered: string[] = [];
    let discoveryWarning: string | null = null;
    try {
      discovered = await discoverSteamGameAppids(1000);
    } catch (error) {
      // La réserve codée reste exploitable même si toutes les sources de
      // découverte sont temporairement bloquées. Les données de chaque jeu
      // seront tout de même validées par l'import individuel.
      discoveryWarning = error instanceof Error ? error.message : "Découverte distante indisponible";
      await writeAppLog({ runId, category: "DISCOVERY", level: "WARNING", message: `Source distante indisponible : ${discoveryWarning}` });
    }
    // Les résultats distants passent d'abord car leur fiche SteamSpy vient
    // d'être mise en cache en lot ; la réserve codée complète si nécessaire.
    const candidates = Array.from(new Set([...discovered, ...CURATED_STEAM_APPIDS]));
    const existing = new Set((await prisma.steamGame.findMany({
      where: { id: { in: candidates } },
      select: { id: true },
    })).map((game) => game.id));

    const appids = candidates.filter((appid) => !existing.has(appid)).slice(0, 500);
    await writeAppLog({ runId, category: "DISCOVERY", level: "SUCCESS", message: `${appids.length} candidat(s) inédit(s) préparé(s)`, details: { discovered: discovered.length, curated: CURATED_STEAM_APPIDS.length, available: appids.length } });
    return NextResponse.json({
      appids,
      warning: discoveryWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Découverte Steam impossible";
    await writeAppLog({ runId, category: "DISCOVERY", level: "ERROR", message: `Découverte échouée : ${message}` });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
