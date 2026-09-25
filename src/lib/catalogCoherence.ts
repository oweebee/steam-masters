import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cardDefense } from "@/lib/cardDefense";
import { analyzeCoherence, isIgnored, normalizeCoherenceName, studioTitleKey, type Snapshot, type Registry, type CoherenceIssue } from "./catalogCoherenceCore";
export { studioGameIsIgnored, studioTitleKey } from "./catalogCoherenceCore";
export type { CoherenceIssue, Registry } from "./catalogCoherenceCore";
type Db = Prisma.TransactionClient;
const IGNORED = "CATALOG_COHERENCE_IGNORED";
const FAILURES = "CATALOG_COHERENCE_FAILURES";
export async function readSnapshot(db: Db = prisma): Promise<Snapshot> {
  const [games, studios] = await Promise.all([
    db.steamGame.findMany({ select: { id: true, name: true, contentType: true, developers: true, parentGameId: true, dlcAppIds: true, reviewScore: true, ownerEstimate: true }, orderBy: { name: "asc" } }),
    db.studio.findMany({ select: { id: true, name: true, games: true }, orderBy: { name: "asc" } }),
  ]);
  return { games, studios };
}
export async function readCoherenceRegistry(db: Db = prisma): Promise<Registry> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [IGNORED, FAILURES] } } });
  const read = (key: string) => {
    const row = rows.find((entry) => entry.key === key);
    if (!row) return {};
    const data = JSON.parse(row.value);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Archives de cohérence illisibles ; aucune archive n’a été effacée.");
    return data;
  };
  return { ignored: read(IGNORED), failures: read(FAILURES) };
}
async function saveRegistry(db: Db, registry: Registry) {
  for (const [key, value] of [[IGNORED, registry.ignored], [FAILURES, registry.failures]] as const) await db.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
}
export async function coherenceWrite<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (db) => {
        await db.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(93845071)`;
        return fn(db);
      }, { isolationLevel: "Serializable", timeout: 60_000, maxWait: 10_000 });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
    }
  }
}
export async function getCoherenceReport() {
  // Transaction is read-only (snapshot + registry). analyzeCoherence is pure CPU — runs OUTSIDE to avoid transaction timeout.
  const [snapshot, registry] = await prisma.$transaction(
    async (db) => Promise.all([readSnapshot(db), readCoherenceRegistry(db)]),
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
  const issues = analyzeCoherence(snapshot).filter((issue) => !isIgnored(issue, registry)).map((issue) => {
    const failure = registry.failures[issue.key];
    return { ...issue, status: failure || issue.method === "BLOCKED" ? "FAILED" as const : "MISSING" as const, failureReason: failure?.reason ?? (issue.method === "BLOCKED" ? issue.reason : undefined), failedAt: failure?.failedAt };
  });
  return { issues, scannedAt: new Date().toISOString(), steamRequests: 0, counts: { games: snapshot.games.filter((g) => g.contentType === "GAME").length, dlcs: snapshot.games.filter((g) => g.contentType === "DLC").length, studios: snapshot.studios.length }, ignoredCount: new Set(Object.values(registry.ignored).map((entry) => entry.issue.key)).size };
}
export async function rememberCoherenceFailure(issue: CoherenceIssue, reason: string) {
  await coherenceWrite(async (db) => {
    const registry = await readCoherenceRegistry(db);
    if (isIgnored(issue, registry)) return;
    registry.failures[issue.key] = { issue, reason: reason.slice(0, 1000), failedAt: new Date().toISOString() };
    await saveRegistry(db, registry);
  });
}
export async function dismissCoherenceIssues(keys: string[]) {
  return coherenceWrite(async (db) => {
    const [snapshot, registry] = await Promise.all([readSnapshot(db), readCoherenceRegistry(db)]);
    const selected = analyzeCoherence(snapshot).filter((issue) => keys.includes(issue.key) && !isIgnored(issue, registry));
    for (const issue of selected) {
      const entry = { issue, ignoredAt: new Date().toISOString() };
      // Retain the source evidence; permanently suppress this relationship in
      // scans, repairs and clickable links, including after a Steam refresh.
      registry.ignored[issue.linkKey] = entry;
      if (issue.sourceType === "STUDIO") registry.ignored[studioTitleKey(issue.sourceId, issue.targetName)] = entry;
      if (issue.targetType === "STUDIO") {
        const studio = snapshot.studios.find((s) => normalizeCoherenceName(s.name) === normalizeCoherenceName(issue.targetName));
        if (studio) registry.ignored[studioTitleKey(studio.id, issue.sourceName)] = entry;
      }
      delete registry.failures[issue.key];
    }
    await saveRegistry(db, registry);
    return selected.length;
  });
}
export async function repairCoherenceLocally(keys?: string[], createStudios = false) {
  return coherenceWrite(async (db) => {
    const [snapshot, registry] = await Promise.all([readSnapshot(db), readCoherenceRegistry(db)]);
    const changedGames = new Set<string>();
    const changedStudios = new Set<string>();
    let links = 0;
    let created = 0;
    for (let pass = 0; pass < 4; pass++) {
      let progress = false;
      for (const issue of analyzeCoherence(snapshot)) {
        if (isIgnored(issue, registry) || (keys && !keys.includes(issue.key))) continue;
        const repair = issue.repair;
        if (issue.method === "LOCAL_STUDIO" && createStudios && repair?.developer) {
          const name = repair.developer;
          if (snapshot.studios.some((s) => normalizeCoherenceName(s.name) === normalizeCoherenceName(name))) continue;
          const studioGames = snapshot.games.filter((g) => g.contentType === "GAME" && g.developers.some((d) => normalizeCoherenceName(d) === normalizeCoherenceName(name)));
          if (!studioGames.length) continue;
          const owners = studioGames.reduce((sum, game) => sum + game.ownerEstimate, 0);
          const atk = Math.round(studioGames.reduce((sum, game) => sum + game.reviewScore, 0) / studioGames.length);
          const studio = await db.studio.create({ data: { name, games: studioGames.map((g) => g.name), gameCount: studioGames.length, avgReviewScore: atk, atk, totalOwnerEstimate: owners, def: cardDefense(owners), rarity: "COMMON" }, select: { id: true, name: true, games: true } });
          snapshot.studios.push(studio);
          created++;
          progress = true;
        } else if (issue.method === "LOCAL_LINK" && repair && !createStudios) {
          const game = snapshot.games.find((g) => g.id === repair.gameId);
          const studio = snapshot.studios.find((s) => s.id === repair.studioId);
          if (game) {
            if (repair.developer && !game.developers.includes(repair.developer)) game.developers.push(repair.developer);
            if (repair.parentId) game.parentGameId = repair.parentId;
            if (repair.dlcId && !game.dlcAppIds.includes(repair.dlcId)) game.dlcAppIds.push(repair.dlcId);
            changedGames.add(game.id);
          }
          if (studio && repair.gameName && !studio.games.includes(repair.gameName)) { studio.games.push(repair.gameName); changedStudios.add(studio.id); }
          links++;
          progress = true;
        }
      }
      if (!progress) break;
    }
    for (const game of snapshot.games.filter((g) => changedGames.has(g.id))) {
      await db.steamGame.update({ where: { id: game.id }, data: { developers: game.developers, parentGameId: game.parentGameId, dlcAppIds: game.dlcAppIds } });
      game.developers.forEach((name) => snapshot.studios.filter((s) => normalizeCoherenceName(s.name) === normalizeCoherenceName(name)).forEach((s) => changedStudios.add(s.id)));
    }
    for (const studio of snapshot.studios.filter((s) => changedStudios.has(s.id))) {
      const games = snapshot.games.filter((g) => g.contentType === "GAME" && g.developers.some((d) => normalizeCoherenceName(d) === normalizeCoherenceName(studio.name)));
      const owners = games.reduce((sum, g) => sum + g.ownerEstimate, 0);
      const atk = games.length ? Math.round(games.reduce((sum, g) => sum + g.reviewScore, 0) / games.length) : 0;
      await db.studio.update({ where: { id: studio.id }, data: { games: studio.games, gameCount: games.length, avgReviewScore: atk, atk, totalOwnerEstimate: owners, def: cardDefense(owners) } });
    }
    const remaining = new Set(analyzeCoherence(snapshot).map((issue) => issue.key));
    for (const key of Object.keys(registry.failures)) if (!remaining.has(key)) delete registry.failures[key];
    await saveRegistry(db, registry);
    return { links, created };
  });
}
