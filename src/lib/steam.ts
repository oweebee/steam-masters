import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const CACHE_TTL = 60 * 30; // 30 min

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

async function fetchAppDetails(appid: number) {
  const res = await fetch(
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
  const res = await fetch(
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
  const res = await fetch(
    `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`,
    { cache: "no-store" }
  );
  if (!res.ok) return 0;
  const json = await res.json();
  return json?.response?.player_count ?? 0;
}

async function fetchOwnerEstimate(appid: number): Promise<number> {
  // SteamSpy : tiers, non-officiel Steam. Retourne une fourchette "owners" (ex: "1,000,000 .. 2,000,000").
  const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`, {
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const json = await res.json();
  const range: string | undefined = json?.owners;
  if (!range) return 0;
  const [lo, hi] = range.split("..").map((s) => parseInt(s.replace(/[,.\s]/g, ""), 10));
  if (!lo || !hi) return 0;
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
export async function getSteamDeveloperGames(developerName: string): Promise<SteamDeveloperGame[]> {
  const normalizedName = developerName.trim().toLocaleLowerCase("fr");
  const cacheKey = `steam:developer-games:${normalizedName}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const appids: number[] = [];
  const pageSize = 50;
  let start = 0;
  let total = 1;

  while (start < total && start < 500) {
    const searchRes = await fetch(
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
    if (pageIds.length === 0) break;
    start += pageSize;
  }

  const games: SteamDeveloperGame[] = [];
  for (let index = 0; index < appids.length; index += 20) {
    const chunk = appids.slice(index, index + 20);
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
  }

  await redis.set(cacheKey, JSON.stringify(games), "EX", CACHE_TTL);
  return games;
}

export function computeRarity(ownerEstimate: number): "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" {
  // Moins de possesseurs = plus rare. Seuils provisoires, à ajuster.
  if (ownerEstimate > 10_000_000) return "COMMON";
  if (ownerEstimate > 2_000_000) return "UNCOMMON";
  if (ownerEstimate > 500_000) return "RARE";
  if (ownerEstimate > 100_000) return "EPIC";
  return "LEGENDARY";
}

// Recalcule et upsert la fiche Studio pour chaque développeur, à partir de TOUS
// les SteamGame déjà en base qui le mentionnent (agrégation à la demande, pas de
// compteurs incrémentaux — toujours exact, pas de dérive possible).
// Choix de design (non spécifiés par ailleurs, assumés) :
//   ATK studio = moyenne des reviewScore de ses jeux en base
//   DEF studio = somme des ownerEstimate de ses jeux en base (proxy "ventes" —
//     Steam ne publie aucun chiffre de ventes officiel ; ownerEstimate vient de
//     SteamSpy, tiers non-officiel. Remplace l'ancien proxy peakCcu, qui tombait
//     à 0 pour les jeux solo/sans multijoueur actif au moment du fetch.)
//   Rareté studio = computeRarity() sur la somme des ownerEstimate de ses jeux
export async function upsertStudiosForDevelopers(developers: string[]) {
  for (const name of developers) {
    if (!name) continue;
    const games = await prisma.steamGame.findMany({ where: { developers: { has: name } } });
    if (games.length === 0) continue;

    const gameCount = games.length;
    const avgReviewScore = Math.round(games.reduce((s, g) => s + g.reviewScore, 0) / gameCount);
    const totalOwnerEstimate = games.reduce((s, g) => s + g.ownerEstimate, 0);
    const gameNames = games.map((g) => g.name).sort();
    const rarity = computeRarity(totalOwnerEstimate);

    await prisma.studio.upsert({
      where: { name },
      update: { gameCount, avgReviewScore, totalOwnerEstimate, games: gameNames, rarity, atk: avgReviewScore, def: totalOwnerEstimate },
      create: { name, gameCount, avgReviewScore, totalOwnerEstimate, games: gameNames, rarity, atk: avgReviewScore, def: totalOwnerEstimate },
    });
  }
}
