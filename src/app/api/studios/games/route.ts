import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSteamDeveloperGames } from "@/lib/steam";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const name = req.nextUrl.searchParams.get("name")?.trim();
  if (!name || name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Nom de studio invalide" }, { status: 400 });
  }

  try {
    const steamGames = await getSteamDeveloperGames(name);
    const localGames = await prisma.steamGame.findMany({
      where: { id: { in: steamGames.map((game) => game.appid) } },
      select: { id: true },
    });
    const localById = new Map(localGames.map((game) => [game.id, game]));

    return NextResponse.json(steamGames.map((game) => ({
      ...game,
      hasCard: localById.has(game.appid),
    })));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalogue Steam indisponible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
