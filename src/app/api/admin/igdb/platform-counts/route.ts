import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getIgdbPlatformCatalogCounts, getIgdbPlatforms } from "@/lib/igdb";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rows, completion] = await Promise.all([
    prisma.steamGame.findMany({ where: { source: "IGDB", contentType: "GAME" }, select: { platforms: true } }),
    prisma.appSetting.findUnique({ where: { key: "IGDB_COMPLETE_PLATFORM_IDS" } }),
  ]);
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const platform of row.platforms) counts.set(platform, (counts.get(platform) ?? 0) + 1);
  }
  const list = [...counts.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);
  let completePlatformIds: number[] = [];
  try { completePlatformIds = completion ? JSON.parse(completion.value).filter(Number.isSafeInteger) : []; } catch { completePlatformIds = []; }

  let catalogTotals: { platformId: number; total: number }[] = [];
  try {
    const igdbPlatforms = await getIgdbPlatforms();
    const importedLabels = new Set([...counts.keys()].map((label) => label.toLocaleLowerCase("fr")));
    const importedPlatforms = igdbPlatforms.filter((platform) =>
      importedLabels.has(platform.name.toLocaleLowerCase("fr"))
      || Boolean(platform.abbreviation && importedLabels.has(platform.abbreviation.toLocaleLowerCase("fr")))
    );
    const totals = await getIgdbPlatformCatalogCounts(importedPlatforms.map((platform) => platform.id));
    catalogTotals = importedPlatforms
      .filter((platform) => totals[platform.id] !== undefined)
      .map((platform) => ({ platformId: platform.id, total: totals[platform.id] }));
  } catch {
    // Le comptage externe ne doit jamais masquer les quantités locales déjà fiables.
  }

  return NextResponse.json({ total: rows.length, platforms: list, completePlatformIds, catalogTotals });
}
