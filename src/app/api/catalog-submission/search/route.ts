import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  if (!(await auth())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const term = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (term.length < 2) return NextResponse.json({ results: [] });

  try {
    const cacheKey = `catalog-submission:steam-search:v1:${term.toLocaleLowerCase("fr")}`;
    let results = await redis.get(cacheKey).then((value) => value ? JSON.parse(value) as { id: number; name: string; tiny_image?: string }[] : null).catch(() => null);
    if (!results) {
      const response = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=french&cc=FR`, { cache: "no-store" });
      if (!response.ok) return NextResponse.json({ error: "Recherche Steam indisponible, réessaie dans un instant." }, { status: 502 });
      const json = await response.json();
      results = (json.items ?? [])
        .filter((item: { type?: string; id?: number; name?: string }) => item.type === "app" && Number.isSafeInteger(item.id) && !!item.name)
        .slice(0, 10);
      await redis.set(cacheKey, JSON.stringify(results), "EX", 45).catch(() => {});
    }
    const steamResults = results ?? [];
    const existing = await prisma.steamGame.findMany({
      where: { id: { in: steamResults.map((item) => String(item.id)) } },
      select: { id: true, name: true, contentType: true },
    });
    const byId = new Map(existing.map((game) => [game.id, game]));
    return NextResponse.json({ results: steamResults.map((item) => ({
      appid: String(item.id), name: item.name, image: item.tiny_image ?? null,
      existing: byId.get(String(item.id)) ?? null,
    })) });
  } catch {
    return NextResponse.json({ error: "Steam ne répond pas pour le moment." }, { status: 502 });
  }
}
