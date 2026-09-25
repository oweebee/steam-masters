import { prisma } from "@/lib/prisma";

export const CATALOG_ISSUES_KEY = "CATALOG_ISSUES_ARCHIVE";
export const DLC_ERROR_ARCHIVE_KEY = "DLC_CATALOG_ERROR_ARCHIVE";
export const DLC_ERROR_ARCHIVE_PURGED_AT_KEY = "DLC_CATALOG_ERROR_ARCHIVE_PURGED_AT";

export type CatalogIssueScope = "GAME" | "DLC" | "STUDIO" | "LINK";
export type CatalogIssue = {
  scope: CatalogIssueScope;
  itemId: string;
  parentId?: string;
  name: string;
  reason: string;
  firstSeen: string;
  lastSeen: string;
  attempts: number;
};
export type CatalogIssueArchive = Record<string, CatalogIssue>;

export function isRetryableCatalogFailure(reason: string) {
  return /HTTP (?:408|425|429|5\d\d)|timeout|timed out|ECONNRESET|ECONNREFUSED|fetch failed|network|indisponible|rate.?limit/i.test(reason);
}

export async function readCatalogIssueArchive(): Promise<CatalogIssueArchive> {
  const row = await prisma.appSetting.findUnique({ where: { key: CATALOG_ISSUES_KEY }, select: { value: true } });
  if (!row) return {};
  try { return JSON.parse(row.value) as CatalogIssueArchive; } catch { return {}; }
}

export async function archiveCatalogIssue(input: Omit<CatalogIssue, "firstSeen" | "lastSeen" | "attempts">) {
  if (isRetryableCatalogFailure(input.reason)) return false;
  const archive = await readCatalogIssueArchive();
  const key = `${input.scope}:${input.itemId}`;
  const previous = archive[key];
  const now = new Date().toISOString();
  archive[key] = { ...input, firstSeen: previous?.firstSeen ?? now, lastSeen: now, attempts: (previous?.attempts ?? 0) + 1 };
  await prisma.appSetting.upsert({
    where: { key: CATALOG_ISSUES_KEY },
    update: { value: JSON.stringify(archive) },
    create: { key: CATALOG_ISSUES_KEY, value: JSON.stringify(archive) },
  });
  return true;
}

export async function purgeCatalogIssueArchives() {
  const [general, dlc] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: CATALOG_ISSUES_KEY }, select: { value: true } }),
    prisma.appSetting.findUnique({ where: { key: DLC_ERROR_ARCHIVE_KEY }, select: { value: true } }),
  ]);
  const countEntries = (value?: string | null) => {
    try { return Object.keys(JSON.parse(value ?? "{}") as object).length; } catch { return 0; }
  };
  const purged = countEntries(general?.value) + countEntries(dlc?.value);
  const purgedAt = new Date().toISOString();
  await prisma.$transaction([
    prisma.appSetting.deleteMany({ where: { key: { in: [CATALOG_ISSUES_KEY, DLC_ERROR_ARCHIVE_KEY] } } }),
    prisma.appSetting.upsert({ where: { key: DLC_ERROR_ARCHIVE_PURGED_AT_KEY }, update: { value: purgedAt }, create: { key: DLC_ERROR_ARCHIVE_PURGED_AT_KEY, value: purgedAt } }),
  ]);
  return purged;
}
