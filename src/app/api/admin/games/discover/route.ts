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
    const discovered = await discoverSteamGameAppids(300);
    const existing = new Set((await prisma.steamGame.findMany({
      where: { id: { in: discovered } },
      select: { id: true },
    })).map((game) => game.id));

    return NextResponse.json({ appids: discovered.filter((appid) => !existing.has(appid)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Découverte Steam impossible";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
