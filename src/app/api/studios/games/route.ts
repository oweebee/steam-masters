import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamDeveloperGames } from "@/lib/steam";
import { readCoherenceRegistry, studioGameIsIgnored } from "@/lib/catalogCoherence";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name || name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Nom de studio invalide" }, { status: 400 });
  }

  const studio = await prisma.studio.findUnique({
    where: { name },
    select: { id: true, name: true, games: true },
  });
  const localGames = await prisma.steamGame.findMany({
    where: {
      contentType: "GAME",
      OR: [
        { developers: { has: name } },
        ...(studio?.games.length ? [{ name: { in: studio.games } }] : []),
      ],
    },
    select: { id: true, name: true, headerImage: true },
    orderBy: { name: "asc" },
  });
  const localById = new Map(localGames.map((game) => [game.id, game]));
  const registry = await readCoherenceRegistry();
  const isIgnored = (gameName: string, id: string) => !!studio && studioGameIsIgnored(studio, { id, name: gameName }, registry);

  try {
    const steamGames = await getSteamDeveloperGames(name);
    const merged = new Map(steamGames.map((game) => [game.appid, {
      ...game,
      // Une fiche distante sans carte locale ne doit jamais exposer directement
      // l'URL Steam : seules les images enregistrées sur notre serveur sont servies.
      headerImage: localById.get(game.appid)?.headerImage ?? null,
      hasCard: localById.has(game.appid),
    }]));
    localGames.forEach((game) => merged.set(game.id, {
      appid: game.id,
      name: game.name,
      headerImage: game.headerImage,
      hasCard: true,
    }));

    return NextResponse.json(Array.from(merged.values()).map((game) => ({ ...game, hasCard: game.hasCard && !isIgnored(game.name, game.appid) })));
  } catch (error) {
    if (localGames.length > 0) {
      return NextResponse.json(localGames.map((game) => ({
        appid: game.id,
        name: game.name,
        headerImage: game.headerImage,
        hasCard: !isIgnored(game.name, game.id),
      })));
    }
    const message = error instanceof Error ? error.message : "Catalogue Steam indisponible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
