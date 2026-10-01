import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CATALOG_ISSUES_KEY, DLC_ERROR_ARCHIVE_KEY, purgeCatalogIssueArchives, readCatalogIssueArchive, type CatalogIssue } from "@/lib/catalogIssueArchive";
import { writeAppLog } from "@/lib/appLog";

async function requireAdmin() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function GET() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const [general, legacyDlc] = await Promise.all([
    readCatalogIssueArchive(),
    prisma.appSetting.findUnique({ where: { key: DLC_ERROR_ARCHIVE_KEY }, select: { value: true } }),
  ]);
  const issues = Object.values(general);
  try {
    const archive = JSON.parse(legacyDlc?.value ?? "{}") as Record<string, { scope: "GAME" | "DLC"; appId: string; parentAppId?: string; name: string; reason: string; firstSeen: string; lastSeen: string; attempts: number }>;
    for (const legacy of Object.values(archive)) {
      issues.push({ scope: legacy.scope, itemId: legacy.appId, parentId: legacy.parentAppId, name: legacy.name, reason: legacy.reason, firstSeen: legacy.firstSeen, lastSeen: legacy.lastSeen, attempts: legacy.attempts });
    }
  } catch { /* Archive historique mal formée : les entrées générales restent visibles. */ }
  const deduplicated = Array.from(new Map(issues.map((issue) => [`${issue.scope}:${issue.itemId}`, issue] as [string, CatalogIssue])).values())
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return NextResponse.json({ issues: deduplicated, count: deduplicated.length, categories: { GAME: deduplicated.filter((issue) => issue.scope === "GAME").length, DLC: deduplicated.filter((issue) => issue.scope === "DLC").length, STUDIO: deduplicated.filter((issue) => issue.scope === "STUDIO").length, LINK: deduplicated.filter((issue) => issue.scope === "LINK").length } });
}

export async function DELETE() {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const purged = await purgeCatalogIssueArchives();
  await writeAppLog({ category: "REPAIR", level: "WARNING", message: `Archives d’échecs du catalogue purgées : ${purged} entrée(s)` });
  return NextResponse.json({ purged, count: 0 });
}
