import { prisma } from "@/lib/prisma";

export type CatalogSubmission = {
  id: string;
  userId: string;
  rootGameId: string;
  rootGameName: string;
  developers: string[];
  phase: "STUDIOS" | "DLC" | "DONE";
  studioIndex: number;
  gameIds: string[];
  gameIndex: number;
  dlcIds: string[];
  dlcOffset: number;
  scannedGames: number;
  importedDlcs: number;
  rejectedDlcs: number;
  errors: number;
  lastSteamRequestAt: number;
  error?: string;
  updatedAt: string;
};

export function submissionSettingKey(id: string) { return `CATALOG_SUBMISSION:${id}`; }
export function activeSubmissionSettingKey(userId: string) { return `CATALOG_SUBMISSION_ACTIVE:${userId}`; }

export async function readCatalogSubmission(id: string): Promise<CatalogSubmission | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: submissionSettingKey(id) }, select: { value: true } });
  if (!row) return null;
  try { return JSON.parse(row.value) as CatalogSubmission; } catch { return null; }
}

export async function writeCatalogSubmission(submission: CatalogSubmission) {
  submission.updatedAt = new Date().toISOString();
  await prisma.appSetting.upsert({
    where: { key: submissionSettingKey(submission.id) },
    update: { value: JSON.stringify(submission) },
    create: { key: submissionSettingKey(submission.id), value: JSON.stringify(submission) },
  });
}

export async function getSubmissionGameIds(submission: CatalogSubmission) {
  const games = await prisma.steamGame.findMany({
    where: { contentType: "GAME", developers: { hasSome: submission.developers } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return Array.from(new Set([submission.rootGameId, ...submission.gameIds, ...games.map((game) => game.id)]));
}
