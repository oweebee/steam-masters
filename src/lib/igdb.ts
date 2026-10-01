import { IGDB_PC_PLATFORM_ID, PC_MAX_RELEASE_TS, igdbNumericId, isPcPlatformLabel, pcReleaseAllowed } from "@/lib/igdbIds";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { igdbDefense } from "@/lib/cardDefense";
import { atkFromReviewScore } from "@/lib/cardAttack";

const CACHE_TTL = 60 * 30; // 30 min

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// IGDB (api.igdb.com/v4) est nettement moins strict que Steam sur le débit,
// mais on garde une cadence prudente par cohérence avec le reste de l'admin.
export const IGDB_REQUEST_DELAY_MS = 500;
const IGDB_REQUEST_TIMEOUT_MS = 12_000;
const IGDB_MAX_RETRIES = 3;

async function getIgdbCredentials(): Promise<{ clientId: string; clientSecret: string } | null> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ["IGDB_CLIENT_ID", "IGDB_CLIENT_SECRET"] } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!map.IGDB_CLIENT_ID || !map.IGDB_CLIENT_SECRET) return null;
  return { clientId: map.IGDB_CLIENT_ID, clientSecret: map.IGDB_CLIENT_SECRET };
}

async function getIgdbAccessToken(): Promise<{ token: string; clientId: string }> {
  const creds = await getIgdbCredentials();
  if (!creds) throw new Error("Identifiants IGDB manquants. Renseigne IGDB_CLIENT_ID et IGDB_CLIENT_SECRET dans Admin → Configuration.");
  const cacheKey = "igdb:oauth-token:v1";
  const cached = await redis.get(cacheKey);
  if (cached) return { token: cached, clientId: creds.clientId };
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(creds.clientId)}&client_secret=${encodeURIComponent(creds.clientSecret)}&grant_type=client_credentials`,
    { method: "POST", cache: "no-store", signal: AbortSignal.timeout(IGDB_REQUEST_TIMEOUT_MS) }
  );
  if (!res.ok) throw new Error(`IGDB OAuth HTTP ${res.status} — vérifie IGDB_CLIENT_ID / IGDB_CLIENT_SECRET.`);
  const json = await res.json();
  if (!json.access_token) throw new Error("IGDB OAuth : jeton d'accès absent de la réponse.");
  // Marge de sécurité de 5 min avant l'expiration réelle.
  await redis.set(cacheKey, json.access_token, "EX", Math.max(60, (json.expires_in ?? 3600) - 300));
  return { token: json.access_token, clientId: creds.clientId };
}

async function igdbQuery<T = unknown[]>(endpoint: string, apicalypse: string): Promise<T> {
  const { token, clientId } = await getIgdbAccessToken();
  for (let attempt = 0; attempt <= IGDB_MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
        body: apicalypse,
        signal: AbortSignal.timeout(IGDB_REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429) {
        if (attempt === IGDB_MAX_RETRIES) throw new Error("IGDB rate-limit (HTTP 429) : trop de requêtes.");
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`IGDB ${endpoint} HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (error) {
      if (attempt >= IGDB_MAX_RETRIES) {
        const reason = error instanceof Error ? error.message : "délai dépassé";
        throw new Error(`IGDB indisponible après ${IGDB_MAX_RETRIES + 1} tentatives : ${reason}`);
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error("IGDB : requête impossible.");
}

function coverUrl(imageId: string | undefined | null): string {
  if (!imageId) return "";
  return `https://images.igdb.com/igdb/image/upload/t_720p/${imageId}.jpg`;
}

type IgdbRawGame = {
  id: number;
  name: string;
  summary?: string;
  cover?: { image_id?: string } | null;
  aggregated_rating?: number;
  total_rating?: number;
  follows?: number;
  hypes?: number;
  total_rating_count?: number;
  platforms?: number[];
  genres?: { name: string }[];
  category?: number;
  parent_game?: number | { id: number } | null;
  dlcs?: number[];
  expansions?: number[];
  involved_companies?: { company: { name: string }; developer: boolean }[];
  release_dates?: { date?: number; platform?: number }[];
};

const GAME_FIELDS = "id,name,summary,cover.image_id,aggregated_rating,total_rating,follows,hypes,total_rating_count,platforms,genres.name,category,parent_game,dlcs,expansions,involved_companies.company.name,involved_companies.developer,release_dates.date,release_dates.platform";

// category IGDB : 0=main_game, 1=dlc_addon, 2=expansion, 4=standalone_expansion,
// 10=expanded_game — tout le reste (mod, saison, port…) hors périmètre cartes.
const DLC_CATEGORIES = new Set([1, 2, 4, 10]);

export interface IgdbGameData {
  igdbId: number;
  name: string;
  description: string;
  headerImage: string;
  reviewScore: number;   // aggregated_rating IGDB (note critique 0-100), 0 si absente — équivalent reviewScore Steam
  peakCcu: number;       // IGDB n'a aucun équivalent CCU en direct : toujours 0
  ownerEstimate: number; // proxy popularité = follows + hypes (PAS un nombre de possesseurs réel, voir igdbDefense())
  tags: string[];
  developers: string[];
  priceCents: null;      // IGDB ne fournit aucune donnée de prix
  isFree: false;
  contentType: "GAME" | "DLC";
  parentIgdbId: number | null;
  dlcIgdbIds: number[];
  platformIds: number[];
  releaseDates: { platform: number; date: number }[]; // sorties datées par plateforme (règle PC <= 2004)
}

function parentIdOf(raw: IgdbRawGame): number | null {
  const p = raw.parent_game;
  if (typeof p === "number") return p;
  if (p && typeof p === "object" && typeof p.id === "number") return p.id;
  return null;
}

function mapRawGame(raw: IgdbRawGame): IgdbGameData {
  const isDlc = DLC_CATEGORIES.has(raw.category ?? 0);
  const follows = Number(raw.follows) || 0;
  const hypes = Number(raw.hypes) || 0;
  const totalRatingCount = Number(raw.total_rating_count) || 0;
  // HEURISTIQUE (non calibrée sur une distribution réelle de la base — à ajuster si besoin) :
  // aggregated_rating (note critique) et follows/hypes (engouement pré-sortie) sont quasi
  // toujours absents pour les jeux retro/confidentiels, ce qui écrasait ATK/DEF à 0/5 pour
  // la quasi-totalité du catalogue IGDB. total_rating (note mixte critiques+joueurs) et
  // total_rating_count (nb d'avis IGDB) sont renseignés beaucoup plus souvent, y compris
  // pour du rétro peu suivi : on les utilise en priorité/complément.
  const reviewScore = raw.total_rating ?? raw.aggregated_rating ?? 0;
  const popularity = follows + hypes + totalRatingCount * 5;
  return {
    igdbId: raw.id,
    name: raw.name,
    description: raw.summary ?? "",
    headerImage: coverUrl(raw.cover?.image_id),
    reviewScore: Math.round(reviewScore),
    peakCcu: 0,
    ownerEstimate: popularity,
    tags: (raw.genres ?? []).map((g) => g.name),
    developers: (raw.involved_companies ?? []).filter((c) => c.developer).map((c) => c.company?.name).filter((n): n is string => !!n),
    priceCents: null,
    isFree: false,
    contentType: isDlc ? "DLC" : "GAME",
    parentIgdbId: isDlc ? parentIdOf(raw) : null,
    dlcIgdbIds: !isDlc ? [...new Set([...(raw.dlcs ?? []), ...(raw.expansions ?? [])])] : [],
    platformIds: raw.platforms ?? [],
    releaseDates: (raw.release_dates ?? [])
      .filter((r) => typeof r.platform === "number" && typeof r.date === "number")
      .map((r) => ({ platform: r.platform as number, date: r.date as number })),
  };
}

export interface IgdbPlatform { id: number; name: string; abbreviation: string | null; logo: string | null }

export async function getIgdbPlatforms(): Promise<IgdbPlatform[]> {
  const cacheKey = "igdb:platforms:v2";
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as IgdbPlatform[];
  const rows = await igdbQuery<{ id: number; name: string; abbreviation?: string; platform_logo?: { image_id?: string } }[]>(
    "platforms",
    "fields id,name,abbreviation,platform_logo.image_id; sort name asc; limit 500;"
  );
  const platforms = rows.map((row) => ({
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation ?? null,
    logo: row.platform_logo?.image_id ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${row.platform_logo.image_id}.png` : null,
  }));
  await redis.set(cacheKey, JSON.stringify(platforms), "EX", 60 * 60 * 24);
  return platforms;
}

type IgdbMultiqueryCountRow = {
  name: string;
  count?: number;
  result?: { count?: number } | { count?: number }[];
};

function multiqueryCount(row: IgdbMultiqueryCountRow): number | null {
  if (Number.isFinite(row.count)) return Number(row.count);
  const result = Array.isArray(row.result) ? row.result[0] : row.result;
  return result && Number.isFinite(result.count) ? Number(result.count) : null;
}

/** Total de jeux IGDB importables par plateforme, mis en cache 24 h.
 * Les requêtes sont groupées par 10, limite officielle de l'endpoint multiquery.
 */
export async function getIgdbPlatformCatalogCounts(platformIds: number[]): Promise<Record<number, number>> {
  const ids = [...new Set(platformIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (ids.length === 0) return {};

  const totals: Record<number, number> = {};
  const cacheKeys = ids.map((id) => `igdb:platform-game-count:v1:${id}`);
  const cached = await redis.mget(...cacheKeys);
  const missing: number[] = [];
  ids.forEach((id, index) => {
    const value = cached[index];
    if (value !== null && Number.isFinite(Number(value))) totals[id] = Number(value);
    else missing.push(id);
  });

  for (let offset = 0; offset < missing.length; offset += 10) {
    const batch = missing.slice(offset, offset + 10);
    const query = batch.map((platformId) => {
      const pcFilter = platformId === IGDB_PC_PLATFORM_ID
        ? ` & release_dates.platform = ${IGDB_PC_PLATFORM_ID} & release_dates.date < ${PC_MAX_RELEASE_TS}`
        : "";
      return `query games/count "platform-${platformId}" { where cover != null & parent_game = null & platforms = (${platformId})${pcFilter}; };`;
    }).join("\n");
    const rows = await igdbQuery<IgdbMultiqueryCountRow[]>("multiquery", query);
    for (const row of rows) {
      const match = /^platform-(\d+)$/.exec(row.name);
      const count = multiqueryCount(row);
      if (!match || count === null) continue;
      const platformId = Number(match[1]);
      totals[platformId] = count;
      await redis.set(`igdb:platform-game-count:v1:${platformId}`, String(count), "EX", 60 * 60 * 24);
    }
    if (offset + 10 < missing.length) await sleep(IGDB_REQUEST_DELAY_MS);
  }
  return totals;
}

export async function getIgdbGamePageUrl(igdbId: number): Promise<string> {
  if (!Number.isSafeInteger(igdbId) || igdbId <= 0) throw new Error("Identifiant IGDB invalide");
  const key = `igdb:page-url:${igdbId}`;
  const cached = await redis.get(key);
  if (cached) return cached;
  const [game] = await igdbQuery<{ url?: string }[]>("games", `fields url; where id = ${igdbId};`);
  const url = new URL(game?.url ?? "");
  if (url.protocol !== "https:" || !["www.igdb.com", "igdb.com"].includes(url.hostname)) throw new Error("Page IGDB indisponible");
  await redis.set(key, url.href, "EX", 86400);
  return url.href;
}

export async function getIgdbPlatformNames(platformIds: number[]): Promise<string[]> {
  if (platformIds.length === 0) return [];
  const byId = new Map((await getIgdbPlatforms()).map((platform) => [platform.id, platform.abbreviation || platform.name]));
  return [...new Set(platformIds.map((id) => byId.get(id)).filter((name): name is string => !!name))];
}

export async function searchIgdbCatalog(term: string, platformId?: number): Promise<{ igdbId: number; name: string }[]> {
  const platformSuffix = platformId ? `-p${platformId}` : "";
  const key = `igdb:catalog-search:${term.trim().toLocaleLowerCase("fr")}${platformSuffix}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const platformFilter = platformId ? ` where platforms = (${platformId});` : "";
  const query = `search "${term.replace(/"/g, '\\"')}"; fields id,name;${platformFilter} limit 20;`;
  const items = (await igdbQuery<{ id: number; name: string }[]>("games", query)).map((g) => ({ igdbId: g.id, name: g.name }));
  await redis.set(key, JSON.stringify(items), "EX", CACHE_TTL);
  return items;
}

export type IgdbDiscoveryGame = { id: number; name: string };

export function normalizeCatalogTitle(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function buildIgdbDiscoveryQuery(platformId: number, limit: number, offset: number) {
  // `category` est déprécié par IGDB et peut être absent sur les anciens jeux.
  // Un jeu sans parent évite les DLC/extensions sans écarter le rétro.
  // PC : pré-filtre sur une sortie PC avant 2005 (vérifiée précisément à l'import).
  const pcFilter = platformId === IGDB_PC_PLATFORM_ID ? ` & release_dates.platform = ${IGDB_PC_PLATFORM_ID} & release_dates.date < ${PC_MAX_RELEASE_TS}` : "";
  return `fields id,name; where cover != null & parent_game = null & platforms = (${platformId})${pcFilter}; sort total_rating_count desc; limit ${limit}; offset ${offset};`;
}

export async function discoverIgdbGames(
  targetCount = 50,
  platformId?: number,
  excludedIds: ReadonlySet<number> = new Set(),
  excludedNames: ReadonlySet<string> = new Set()
): Promise<IgdbDiscoveryGame[]> {
  if (!Number.isSafeInteger(platformId) || (platformId ?? 0) <= 0) throw new Error("Choisis une plateforme IGDB pour l'import en masse.");
  const games: IgdbDiscoveryGame[] = [];
  const pageSize = 500;
  const maxPages = 20;
  for (let pageIndex = 0; pageIndex < maxPages && games.length < targetCount; pageIndex += 1) {
    const offset = pageIndex * pageSize;
    const query = buildIgdbDiscoveryQuery(platformId!, pageSize, offset);
    const page = await igdbQuery<IgdbDiscoveryGame[]>("games", query);
    for (const game of page) {
      if (!excludedIds.has(game.id) && !excludedNames.has(normalizeCatalogTitle(game.name))) games.push(game);
      if (games.length >= targetCount) break;
    }
    if (page.length < pageSize) break;
    await sleep(IGDB_REQUEST_DELAY_MS);
  }
  return games;
}

export async function getIgdbDlcIds(igdbId: number): Promise<number[]> {
  const cacheKey = `igdb:dlc-list:v1:${igdbId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as number[];
  const query = `fields dlcs,expansions; where id = ${igdbId};`;
  const [raw] = await igdbQuery<IgdbRawGame[]>("games", query);
  const ids = raw ? [...new Set([...(raw.dlcs ?? []), ...(raw.expansions ?? [])])] : [];
  await redis.set(cacheKey, JSON.stringify(ids), "EX", CACHE_TTL);
  return ids;
}

export async function getIgdbGameData(igdbId: number): Promise<IgdbGameData> {
  const cacheKey = `igdb:game:v4:${igdbId}`; // v4 : + release_dates (règle PC <= 2004) // v3 : reviewScore/ownerEstimate recalcules (total_rating + total_rating_count)
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const query = `fields ${GAME_FIELDS}; where id = ${igdbId};`;
  const [raw] = await igdbQuery<IgdbRawGame[]>("games", query);
  if (!raw) throw new Error(`IGDB : id ${igdbId} introuvable`);
  const data = mapRawGame(raw);
  await redis.set(cacheKey, JSON.stringify(data), "EX", CACHE_TTL);
  return data;
}

export interface IgdbDeveloperGame {
  igdbId: string;
  name: string;
  headerImage: string;
}

// Catalogue officiel d'un développeur sur IGDB. Même logique que
// getSteamDeveloperGames : chargé à la demande, caché 30 min.
export async function getIgdbDeveloperGames(
  developerName: string,
  onProgress?: (message: string, details?: Record<string, number>) => void | Promise<void>
): Promise<IgdbDeveloperGame[]> {
  const normalizedName = developerName.trim().toLocaleLowerCase("fr");
  const cacheKey = `igdb:developer-games:${normalizedName}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const companyQuery = `search "${developerName.replace(/"/g, '\\"')}"; fields id,name; limit 10;`;
  const companies = await igdbQuery<{ id: number; name: string }[]>("companies", companyQuery);
  const exact = companies.filter((c) => c.name.trim().toLocaleLowerCase("fr") === normalizedName);
  if (!exact.length) { await redis.set(cacheKey, "[]", "EX", CACHE_TTL); return []; }

  const games: IgdbDeveloperGame[] = [];
  for (const company of exact) {
    const gamesQuery = `fields id,name,cover.image_id,category; where involved_companies.company = ${company.id} & involved_companies.developer = true & category = 0; limit 500;`;
    const raw = await igdbQuery<IgdbRawGame[]>("games", gamesQuery);
    for (const g of raw) {
      if (!g.cover?.image_id) continue;
      games.push({ igdbId: `igdb-${g.id}`, name: g.name, headerImage: coverUrl(g.cover.image_id) });
    }
    await onProgress?.(`${developerName} : ${games.length} jeu(x) IGDB trouvé(s)`, { discovered: games.length, total: games.length });
    await sleep(IGDB_REQUEST_DELAY_MS);
  }

  await redis.set(cacheKey, JSON.stringify(games), "EX", CACHE_TTL);
  return games;
}

// Même agrégation Studio que upsertStudiosForDevelopers (steam.ts), mais ne
// touche que les SteamGame de source IGDB pour ne pas fausser les stats des
// studios déjà alimentés par Steam. Les deux pipelines partagent la table
// Studio ; un studio ayant des jeux Steam ET IGDB voit son ownerEstimate/
// reviewScore recalculés par la DERNIÈRE des deux fonctions appelée — c'est
// volontaire (pas de fusion pondérée), documenté ici pour éviter la surprise.
export async function upsertStudiosForIgdbDevelopers(developers: string[]) {
  const names = new Set(developers.filter(Boolean));
  if (names.size === 0) return { created: 0, updated: 0, linked: 0 };

  const existingStudios = await prisma.studio.findMany({ where: { name: { in: Array.from(names) } }, select: { name: true, games: true } });
  const knownTitles = new Map(existingStudios.map((studio) => [studio.name, studio.games]));

  const games = await prisma.steamGame.findMany({
    where: { contentType: "GAME", source: "IGDB", developers: { hasSome: Array.from(names) } },
    select: { name: true, reviewScore: true, ownerEstimate: true, developers: true },
  });
  const gamesByDeveloper = new Map<string, typeof games>();
  for (const game of games) {
    for (const developer of new Set(game.developers)) {
      if (!names.has(developer)) continue;
      const list = gamesByDeveloper.get(developer);
      if (list) list.push(game);
      else gamesByDeveloper.set(developer, [game]);
    }
  }

  const upserts = Array.from(gamesByDeveloper, ([name, studioGames]) => {
    const gameCount = studioGames.length;
    const avgReviewScore = Math.round(studioGames.reduce((s, g) => s + g.reviewScore, 0) / gameCount);
    const totalOwnerEstimate = studioGames.reduce((s, g) => s + g.ownerEstimate, 0);
    const gameNames = [...new Set([...(knownTitles.get(name) ?? []), ...studioGames.map((g) => g.name)])].sort();
    const stats = { gameCount, avgReviewScore, totalOwnerEstimate, games: gameNames, atk: atkFromReviewScore(avgReviewScore), def: igdbDefense(totalOwnerEstimate) };
    return prisma.studio.upsert({
      where: { name },
      update: stats,
      create: { name, ...stats, rarity: "COMMON" },
    });
  });
  for (let i = 0; i < upserts.length; i += 200) {
    await prisma.$transaction(upserts.slice(i, i + 200));
  }
  const linked = gamesByDeveloper.size;
  const created = Array.from(gamesByDeveloper.keys()).filter((name) => !knownTitles.has(name)).length;
  const studioNames = Array.from(gamesByDeveloper.keys());
  const studioRecords = studioNames.length > 0
    ? await prisma.studio.findMany({ where: { name: { in: studioNames } }, select: { id: true, name: true, gameCount: true, atk: true, def: true, rarity: true, games: true } })
    : [];
  return { created, updated: linked - created, linked, studios: studioRecords };
}

// Backfill plateformes : les cartes IGDB importées avant l'ajout du champ
// platforms ont platforms=[] en base. Récupère les IDs plateforme IGDB par
// lots de 400 (limite Apicalypse confortable) puis résout les noms et met
// à jour chaque fiche concernée.
export async function backfillIgdbPlatforms(): Promise<{ scanned: number; updated: number }> {
  const targets = await prisma.steamGame.findMany({
    where: { source: "IGDB", platforms: { equals: [] } },
    select: { id: true },
  });
  if (targets.length === 0) return { scanned: 0, updated: 0 };

  const numericIds = targets.map((t) => igdbNumericId(t.id));
  const platformsByNumericId = new Map<number, number[]>();
  for (let i = 0; i < numericIds.length; i += 400) {
    const chunk = numericIds.slice(i, i + 400);
    const query = `fields id,platforms; where id = (${chunk.join(",")}); limit ${chunk.length};`;
    const rows = await igdbQuery<{ id: number; platforms?: number[] }[]>("games", query);
    for (const row of rows) platformsByNumericId.set(row.id, row.platforms ?? []);
    if (i + 400 < numericIds.length) await sleep(IGDB_REQUEST_DELAY_MS);
  }

  const nameById = new Map((await getIgdbPlatforms()).map((p) => [p.id, p.abbreviation || p.name]));

  const updates = targets
    .map((t) => {
      const numericId = igdbNumericId(t.id);
      const ids = (platformsByNumericId.get(numericId) ?? []).filter((pid) => pid !== IGDB_PC_PLATFORM_ID); // backfill sans date : pas de PC
      const names = [...new Set(ids.map((id) => nameById.get(id)).filter((n): n is string => !!n))];
      return names.length > 0 ? prisma.steamGame.update({ where: { id: t.id }, data: { platforms: names } }) : null;
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  for (let i = 0; i < updates.length; i += 200) {
    await prisma.$transaction(updates.slice(i, i + 200));
  }
  return { scanned: targets.length, updated: updates.length };
}

// Recalcule reviewScore/ownerEstimate/atk/def de tout le catalogue IGDB deja importe
// avec la formule totalRating/totalRatingCount ci-dessus (mapRawGame), sans re-telecharger
// les images ni toucher description/tags/plateformes. A lancer une fois apres le fix de
// formule pour corriger les fiches existantes (ATK proche de 0/DEF=5 pour la quasi-totalite
// du catalogue retro), puis ponctuellement si besoin.
export async function recalcIgdbStats(): Promise<{ scanned: number; updated: number }> {
  const targets = await prisma.steamGame.findMany({
    where: { source: "IGDB" },
    select: { id: true, reviewScore: true, ownerEstimate: true },
  });
  if (targets.length === 0) return { scanned: 0, updated: 0 };

  const numericIds = targets.map((t) => igdbNumericId(t.id));
  type StatsRow = { id: number; aggregated_rating?: number; total_rating?: number; follows?: number; hypes?: number; total_rating_count?: number };
  const statsByNumericId = new Map<number, StatsRow>();
  for (let i = 0; i < numericIds.length; i += 400) {
    const chunk = numericIds.slice(i, i + 400);
    const query = `fields id,aggregated_rating,total_rating,follows,hypes,total_rating_count; where id = (${chunk.join(",")}); limit ${chunk.length};`;
    const rows = await igdbQuery<StatsRow[]>("games", query);
    for (const row of rows) statsByNumericId.set(row.id, row);
    if (i + 400 < numericIds.length) await sleep(IGDB_REQUEST_DELAY_MS);
  }

  const updates = targets
    .map((t) => {
      const numericId = igdbNumericId(t.id);
      const row = statsByNumericId.get(numericId);
      if (!row) return null;
      const follows = Number(row.follows) || 0;
      const hypes = Number(row.hypes) || 0;
      const totalRatingCount = Number(row.total_rating_count) || 0;
      const reviewScore = Math.round(row.total_rating ?? row.aggregated_rating ?? 0);
      const ownerEstimate = follows + hypes + totalRatingCount * 5;
      if (reviewScore === t.reviewScore && ownerEstimate === t.ownerEstimate) return null;
      return prisma.steamGame.update({
        where: { id: t.id },
        data: { reviewScore, ownerEstimate, atk: atkFromReviewScore(reviewScore), def: igdbDefense(ownerEstimate) },
      });
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  for (let i = 0; i < updates.length; i += 200) {
    await prisma.$transaction(updates.slice(i, i + 200));
  }
  return { scanned: targets.length, updated: updates.length };
}

// Une carte par (jeu, plateforme) : scinde les fiches IGDB historiques qui
// portaient plusieurs supports. La fiche d'origine garde le 1er support (et
// ses éventuelles cartes joueurs) ; chaque autre support devient une fiche
// `igdb-<jeu>-p<plateforme>` avec les mêmes stats.
export async function splitMultiPlatformIgdbGames(): Promise<{ split: number; created: number; unresolved: string[] }> {
  const rows = await prisma.steamGame.findMany({ where: { source: "IGDB" } });
  const multi = rows.filter((row) => row.platforms.length > 1);
  if (multi.length === 0) return { split: 0, created: 0, unresolved: [] };
  const idByLabel = new Map<string, number>();
  for (const p of await getIgdbPlatforms()) {
    if (p.abbreviation && !idByLabel.has(p.abbreviation)) idByLabel.set(p.abbreviation, p.id);
    if (!idByLabel.has(p.name)) idByLabel.set(p.name, p.id);
  }
  let created = 0;
  const unresolved = new Set<string>();
  for (const row of multi) {
    const { id, updatedAt: _updatedAt, platforms, ...fields } = row;
    void _updatedAt;
    const gameId = igdbNumericId(id);
    // Les cartes PC ainsi créées sont ensuite filtrées par purgeIgdbPcGames (règle <= 2004).
    const [first, ...rest] = platforms;
    for (const label of rest) {
      const platformId = idByLabel.get(label);
      if (!platformId) { unresolved.add(label); continue; }
      const newId = `igdb-${gameId}-p${platformId}`;
      await prisma.steamGame.upsert({
        where: { id: newId },
        update: { platforms: [label] },
        create: { ...fields, id: newId, platforms: [label] },
      });
      created++;
    }
    await prisma.steamGame.update({ where: { id }, data: { platforms: [first] } });
  }
  return { split: multi.length, created, unresolved: [...unresolved] };
}

// PC : Steam gère tout ce qui sort à partir de 2005. Supprime les fiches IGDB
// mono-PC sans sortie PC datée avant 2005 (sauf si possédées par un joueur :
// conservées et listées), et retire "PC" des fiches multi-supports concernées.
export async function purgeIgdbPcGames(): Promise<{ deleted: number; cleaned: number; kept: number; keptOwned: string[] }> {
  const rows = await prisma.steamGame.findMany({
    where: { source: "IGDB" },
    select: { id: true, name: true, platforms: true, _count: { select: { cards: true } } },
  });
  const pcRows = rows.filter((row) => row.platforms.some(isPcPlatformLabel));
  if (pcRows.length === 0) return { deleted: 0, cleaned: 0, kept: 0, keptOwned: [] };
  const numericIds = [...new Set(pcRows.map((row) => igdbNumericId(row.id)))];
  const allowed = new Set<number>();
  for (let i = 0; i < numericIds.length; i += 400) {
    const chunk = numericIds.slice(i, i + 400);
    const res = await igdbQuery<{ id: number; release_dates?: { date?: number; platform?: number }[] }[]>(
      "games",
      `fields id,release_dates.date,release_dates.platform; where id = (${chunk.join(",")}); limit ${chunk.length};`
    );
    for (const g of res) {
      const dates = (g.release_dates ?? []).filter((r) => typeof r.platform === "number" && typeof r.date === "number")
        .map((r) => ({ platform: r.platform as number, date: r.date as number }));
      if (pcReleaseAllowed(dates)) allowed.add(g.id);
    }
    if (i + 400 < numericIds.length) await sleep(IGDB_REQUEST_DELAY_MS);
  }
  const toDelete: string[] = [];
  const keptOwned: string[] = [];
  let cleaned = 0;
  let kept = 0;
  for (const row of pcRows) {
    if (allowed.has(igdbNumericId(row.id))) { kept++; continue; }
    const others = row.platforms.filter((label) => !isPcPlatformLabel(label));
    if (others.length > 0) {
      await prisma.steamGame.update({ where: { id: row.id }, data: { platforms: others } });
      cleaned++;
    } else if (row._count.cards > 0) {
      keptOwned.push(`${row.name} (${row.id})`);
    } else {
      toDelete.push(row.id);
    }
  }
  if (toDelete.length) await prisma.steamGame.deleteMany({ where: { id: { in: toDelete } } });
  return { deleted: toDelete.length, cleaned, kept, keptOwned };
}
