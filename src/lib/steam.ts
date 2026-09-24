import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { cardDefense } from "@/lib/cardDefense";

const CACHE_TTL = 60 * 30; // 30 min

// Rate limiting Steam : au-delà d'un certain débit, Steam renvoie HTTP 429 sur
// appdetails/appreviews/search. On espace les requêtes et on retente avec
// backoff (Retry-After si fourni, sinon exponentiel) plutôt que d'abandonner.
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STEAM_REQUEST_DELAY_MS = 900;
const STEAM_MAX_RETRIES = 4;
const STEAM_REQUEST_TIMEOUT_MS = 12_000;
const STEAM_NETWORK_MAX_RETRIES = 1;

async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= STEAM_MAX_RETRIES; attempt += 1) {
    try {
      const timeoutSignal = AbortSignal.timeout(STEAM_REQUEST_TIMEOUT_MS);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
      const res = await fetch(url, { ...init, signal });
      if (res.status !== 429) return res;
      const retryAfter = Number(res.headers.get("retry-after"));
      const requestedBackoffMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2000 * 2 ** attempt;
      const backoffMs = Math.min(requestedBackoffMs, 15_000);
      if (attempt === STEAM_MAX_RETRIES) return res;
      await sleep(backoffMs);
    } catch (error) {
      if (attempt >= STEAM_NETWORK_MAX_RETRIES) {
        const reason = error instanceof Error ? error.message : "délai dépassé";
        throw new Error(`Steam indisponible après ${STEAM_NETWORK_MAX_RETRIES + 1} tentatives : ${reason}`);
      }
      await sleep(1000 * 2 ** attempt);
    }
  }
  // Inatteignable (boucle retourne toujours dans les cas ci-dessus), mais TS veut un retour.
  return fetch(url, init);
}

async function getSteamApiKey(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: "STEAM_API_KEY" } });
  return row?.value ?? null;
}

export interface SteamGameData {
  appid: number;
  name: string;
  description: string;
  headerImage: string;
  reviewScore: number;   // % d'avis positifs (0-100) — source: appreviews (public, sans clé)
  peakCcu: number;       // joueurs connectés actuellement — source: GetNumberOfCurrentPlayers (public, sans clé)
                          // NOTE: Steam ne publie pas le pic HISTORIQUE via API publique, ceci est un proxy (CCU instantané)
  ownerEstimate: number; // NOTE: pas de donnée officielle Steam pour le nombre de possesseurs.
                          // Source: SteamSpy (tiers, non-officiel), estimation moyenne de la fourchette publiée.
  tags: string[];
  developers: string[]; // source: appdetails.developers (Steam officiel)
  priceCents: number | null; // source: appdetails.price_overview.final (devise EUR, cc=fr) — null si non disponible
  isFree: boolean;            // source: appdetails.is_free (Steam officiel)
}

export interface SteamDeveloperGame {
  appid: string;
  name: string;
  headerImage: string;
}

export async function discoverSteamGameAppids(maxResults = 200): Promise<string[]> {
  const appids = new Set<string>();
  const pageSize = 50;

  for (let start = 0; start < maxResults; start += pageSize) {
    const response = await fetchWithRetry(
      `https://store.steampowered.com/search/results/?query&start=${start}&count=${pageSize}` +
        `&dynamic_data=&sort_by=Reviews_DESC&category1=998&ndl=1&infinite=1&ignore_preferences=1`,
      { cache: "no-store", headers: { "User-Agent": "SteamMasters/1.0" } }
    );
    if (!response.ok) throw new Error(`Steam discovery HTTP ${response.status}`);
    const payload = await response.json();
    const pageIds = Array.from(
      String(payload.results_html ?? "").matchAll(/data-ds-appid="(\d+)"/g),
      (match) => match[1]
    );
    pageIds.forEach((appid) => appids.add(appid));
    if (pageIds.length === 0) break;
  }

  return Array.from(appids);
}

async function fetchAppDetails(appid: number) {
  const res = await fetchWithRetry(
    `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=fr&l=french`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Steam appdetails HTTP ${res.status}`);
  const json = await res.json();
  const entry = json[String(appid)];
  if (!entry?.success) throw new Error(`Steam appdetails: appid ${appid} introuvable`);
  return entry.data;
}

async function fetchReviewScore(appid: number): Promise<number> {
  const res = await fetchWithRetry(
    `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all`,
    { cache: "no-store" }
  );
  if (!res.ok) return 0;
  const json = await res.json();
  const summary = json?.query_summary;
  if (!summary || !summary.total_reviews) return 0;
  return Math.round((summary.total_positive / summary.total_reviews) * 100);
}

async function fetchCurrentPlayers(appid: number): Promise<number> {
  const res = await fetchWithRetry(
    `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`,
    { cache: "no-store" }
  );
  if (!res.ok) return 0;
  const json = await res.json();
  return json?.response?.player_count ?? 0;
}

async function fetchOwnerEstimate(appid: number): Promise<number> {
  // SteamSpy : tiers, non-officiel Steam. Retourne une fourchette "owners" (ex: "1,000,000 .. 2,000,000").
  const res = await fetchWithRetry(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`, {
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const json = await res.json();
  const range: string | undefined = json?.owners;
  if (!range) return 0;
  const [lo, hi] = range.split("..").map((s) => parseInt(s.replace(/[,.\s]/g, ""), 10));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return 0;
  return Math.round((lo + hi) / 2);
}

export async function getSteamGameData(appid: number): Promise<SteamGameData> {
  const cacheKey = `steam:game:${appid}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // La clé API stockée en admin n'est pas requise par ces endpoints publics,
  // mais on la lit pour usage futur (endpoints Steamworks nécessitant une clé).
  await getSteamApiKey();

  const [details, reviewScore, peakCcu, ownerEstimate] = await Promise.all([
    fetchAppDetails(appid),
    fetchReviewScore(appid),
    fetchCurrentPlayers(appid),
    fetchOwnerEstimate(appid),
  ]);
  if (details.type !== "game") throw new Error(`Steam appdetails: appid ${appid} n'est pas un jeu`);

  const data: SteamGameData = {
    appid,
    name: details.name,
    description: details.short_description ?? "",
    headerImage: details.header_image,
    reviewScore,
    peakCcu,
    ownerEstimate,
    tags: details.genres?.map((genre: { description: string }) => genre.description) ?? [],
    developers: details.developers ?? [],
    priceCents: details.price_overview?.final ?? null,
    isFree: !!details.is_free,
  };

  await redis.set(cacheKey, JSON.stringify(data), "EX", CACHE_TTL);
  return data;
}

// Catalogue officiel d'un développeur sur Steam. Chargé à la demande par les
// cartes Studio visibles et caché 30 min dans Redis pour éviter tout balayage
// massif du catalogue. Les DLC, bandes-son et outils sont exclus.
export async function getSteamDeveloperGames(
  developerName: string,
  onProgress?: (message: string, details?: Record<string, number>) => void | Promise<void>
): Promise<SteamDeveloperGame[]> {
  const normalizedName = developerName.trim().toLocaleLowerCase("fr");
  const cacheKey = `steam:developer-games:${normalizedName}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const appids: number[] = [];
  const pageSize = 50;
  let start = 0;
  let total = 1;

  while (start < total && start < 500) {
    const searchRes = await fetchWithRetry(
      `https://store.steampowered.com/search/results/?query&start=${start}&count=${pageSize}` +
        `&dynamic_data=&sort_by=_ASC&developer=${encodeURIComponent(developerName)}` +
        `&ndl=1&infinite=1&ignore_preferences=1`,
      { cache: "no-store", headers: { "User-Agent": "SteamMasters/1.0" } }
    );
    if (!searchRes.ok) throw new Error(`Steam developer search HTTP ${searchRes.status}`);

    const payload = await searchRes.json();
    total = Number(payload.total_count) || 0;
    const pageIds = Array.from(
      String(payload.results_html ?? "").matchAll(/data-ds-appid="(\d+)"/g),
      (match) => Number(match[1])
    );
    for (const appid of pageIds) {
      if (!appids.includes(appid)) appids.push(appid);
    }
    await onProgress?.(`${developerName} : ${appids.length}/${total} AppID Steam analysés`, { discovered: appids.length, total });
    if (pageIds.length === 0) break;
    start += pageSize;
  }

  const games: SteamDeveloperGame[] = [];
  const CHUNK_SIZE = 8;
  for (let index = 0; index < appids.length; index += CHUNK_SIZE) {
    if (index > 0) await sleep(STEAM_REQUEST_DELAY_MS);
    const chunk = appids.slice(index, index + CHUNK_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (appid) => ({ appid, details: await fetchAppDetails(appid) }))
    );
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const { appid, details } = result.value;
      const belongsToDeveloper = (details.developers ?? []).some(
        (developer: string) => developer.trim().toLocaleLowerCase("fr") === normalizedName
      );
      if (details.type !== "game" || !belongsToDeveloper || !details.header_image) continue;
      games.push({ appid: String(appid), name: details.name, headerImage: details.header_image });
    }
    await onProgress?.(`${developerName} : fiches ${Math.min(index + CHUNK_SIZE, appids.length)}/${appids.length} vérifiées`, {
      checked: Math.min(index + CHUNK_SIZE, appids.length), total: appids.length, eligible: games.length,
    });
  }

  await redis.set(cacheKey, JSON.stringify(games), "EX", CACHE_TTL);
  return games;
}

// Recalcule et upsert la fiche Studio pour chaque développeur, à partir de TOUS
// les SteamGame déjà en base qui le mentionnent (agrégation à la demande, pas de
// compteurs incrémentaux — toujours exact, pas de dérive possible).
// Choix de design (non spécifiés par ailleurs, assumés) :
//   ATK studio = moyenne des reviewScore de ses jeux en base
//   DEF studio = compression logarithmique 50..250 de la somme des estimations
//     de possesseurs SteamSpy de ses jeux ; la somme brute est conservée à part.
//   Rareté studio = classement par percentile (voir catalogRarity.ts), plafonné
//   par la meilleure tranche de reviewScore atteinte par au moins un de ses jeux.
//   Jamais figée : recalculée en totalité à chaque appel de recalculateCatalogRarity().
//   La valeur posée ici est provisoire (conservée si déjà connue, sinon COMMON
//   en attendant le recalcul global qui suit systématiquement cet appel).
export async function upsertStudiosForDevelopers(developers: string[]) {
  const names = new Set(developers.filter(Boolean));
  if (names.size === 0) return;

  // Une seule lecture pour tout le lot (avant : 2 requêtes + 1 upsert par studio).
  const games = await prisma.steamGame.findMany({
    where: { developers: { hasSome: Array.from(names) } },
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
    const gameNames = studioGames.map((g) => g.name).sort();
    const stats = { gameCount, avgReviewScore, totalOwnerEstimate, games: gameNames, atk: avgReviewScore, def: cardDefense(totalOwnerEstimate) };
    return prisma.studio.upsert({
      where: { name },
      update: stats,
      // Rareté provisoire : fixée par recalculateCatalogRarity() qui suit toujours.
      create: { name, ...stats, rarity: "COMMON" },
    });
  });
  for (let i = 0; i < upserts.length; i += 200) {
    await prisma.$transaction(upserts.slice(i, i + 200));
  }
}
