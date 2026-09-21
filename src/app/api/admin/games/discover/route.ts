import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { discoverSteamGameAppids } from "@/lib/steam";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Une réserve large est nécessaire lorsque les listes populaires ont déjà
    // été importées : le client s'arrête dès que 20 ajouts valides aboutissent.
    const discovered = await discoverSteamGameAppids(1000);
    const existing = new Set((await prisma.steamGame.findMany({
      where: { id: { in: discovered } },
      select: { id: true },
    })).map((game) => game.id));

    return NextResponse.json({ appids: discovered.filter((appid) => !existing.has(appid)).slice(0, 500) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Découverte Steam impossible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
