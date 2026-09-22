import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { discoverSteamGameAppids } from "@/lib/steam";
import { CURATED_STEAM_APPIDS } from "@/lib/curatedSteamGames";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    }
    // Les résultats distants passent d'abord car leur fiche SteamSpy vient
    // d'être mise en cache en lot ; la réserve codée complète si nécessaire.
    const candidates = Array.from(new Set([...discovered, ...CURATED_STEAM_APPIDS]));
    const existing = new Set((await prisma.steamGame.findMany({
      where: { id: { in: candidates } },
      select: { id: true },
    })).map((game) => game.id));

    return NextResponse.json({
      appids: candidates.filter((appid) => !existing.has(appid)).slice(0, 500),
      warning: discoveryWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Découverte Steam impossible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
