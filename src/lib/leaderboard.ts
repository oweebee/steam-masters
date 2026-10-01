export type LeaderboardRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

export const LEADERBOARD_RARITY_POINTS: Record<LeaderboardRarity, number> = {
  COMMON: 10, UNCOMMON: 30, RARE: 80, EPIC: 200, LEGENDARY: 500,
};

export const LEADERBOARD_RARITIES: LeaderboardRarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
export type LeaderboardGame = { id: string; name: string; contentType: "GAME" | "DLC"; source: "STEAM" | "IGDB"; parentGameId: string | null; dlcAppIds: string[]; platforms: string[]; developers: string[] };
export type LeaderboardStudio = { id: string; name: string };
export type LeaderboardCard = { rarity: LeaderboardRarity; gameId: string | null; studioId: string | null };
export type LeaderboardUser = { id: string; username: string; cards: LeaderboardCard[] };
export type LeaderboardProgress = { current: number; total: number; next: number | null };
export type LeaderboardBonus = { label: string; detail: string; multiplier: number | null; points: number; progress?: LeaderboardProgress };
export type LeaderboardReward = { key: string; label: string; detail: string; coins: number; current: number; target: number };
export type LeaderboardEntry = { id: string; username: string; rank: number; score: number; baseScore: number; comboScore: number; globalMultiplier: number; globalBonus: number; cardCount: number; rarity: { rarity: LeaderboardRarity; count: number; points: number }[]; bonuses: LeaderboardBonus[]; rewards: LeaderboardReward[] };

type ComboCandidate = LeaderboardBonus & { subjects: string[]; priority: number };
type MainGroup = { name: string; platforms: Set<string>; studioIds: Set<string>; dlcGroups: Map<string, Set<string>> };
type DlcIndex = { logicalKey: string; mainKeys: Set<string> };
type CatalogIndex = {
  gameById: Map<string, LeaderboardGame>;
  mainKeyByGameId: Map<string, string>;
  mainGroups: Map<string, MainGroup>;
  dlcByGameId: Map<string, DlcIndex>;
  studioById: Map<string, LeaderboardStudio>;
  studioGameKeys: Map<string, Set<string>>;
};

function normalize(value: string) { return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
function logicalGameKey(game: LeaderboardGame) { return `${normalize(game.name)}::${[...new Set(game.developers.map(normalize))].sort().join("|")}`; }
function subjectKey(kind: "GAME" | "STUDIO", id: string) { return `${kind}:${id}`; }
function catalogPlatforms(game: LeaderboardGame) { return (game.platforms.length ? game.platforms : game.source === "STEAM" ? ["PC"] : []).map(normalize).filter(Boolean); }
function tier(ratio: number, full: number, twoThirds: number, oneThird: number) { return ratio >= 1 ? full : ratio >= 2 / 3 ? twoThirds : ratio >= 1 / 3 ? oneThird : 1; }
function nextThreshold(current: number, total: number) {
  for (const ratio of [1 / 3, 2 / 3, 1]) { const threshold = Math.ceil(total * ratio); if (threshold > current) return threshold; }
  return null;
}
function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const values = map.get(key) ?? new Set<string>(); values.add(value); map.set(key, values);
}
function uniqueKeys(keys: Array<string | null>) { return [...new Set(keys.filter((key): key is string => Boolean(key)))]; }
function rewardCoins(value: number) { return Math.max(20, Math.min(5000, Math.round(value))); }
function rewardStages(total: number) {
  if (total <= 1) return [];
  const ratios = total <= 3 ? [1] : total <= 8 ? [2 / 3, 1] : [1 / 3, 2 / 3, 1];
  const stages = new Map<number, number>();
  ratios.forEach((ratio) => stages.set(Math.ceil(total * ratio), ratio === 1 ? 3 : ratio === 2 / 3 ? 2 : 1));
  return [...stages].map(([target, stage]) => ({ target, stage }));
}
function bestKey(keys: Iterable<string>, points: Map<string, number>) {
  let best: string | null = null;
  for (const key of keys) if (best === null || (points.get(key) ?? 0) > (points.get(best) ?? 0)) best = key;
  return best;
}

function buildCatalogIndex(games: LeaderboardGame[], studios: LeaderboardStudio[]): CatalogIndex {
  const gameById = new Map(games.map((game) => [game.id, game]));
  const studioById = new Map(studios.map((studio) => [studio.id, studio]));
  const studioByName = new Map(studios.map((studio) => [normalize(studio.name), studio.id]));
  const mainRows = new Map<string, LeaderboardGame[]>();
  const mainKeyByGameId = new Map<string, string>();
  const declaredParentsByDlcId = new Map<string, Set<string>>();

  for (const game of games) {
    if (game.contentType !== "GAME") continue;
    const key = logicalGameKey(game);
    mainKeyByGameId.set(game.id, key);
    mainRows.set(key, [...(mainRows.get(key) ?? []), game]);
    for (const dlcId of game.dlcAppIds) addToSetMap(declaredParentsByDlcId, dlcId, game.id);
  }

  const mainGroups = new Map<string, MainGroup>();
  const studioGameKeys = new Map<string, Set<string>>();
  for (const [key, rows] of mainRows) {
    const studioIds = new Set<string>();
    for (const developer of rows.flatMap((row) => row.developers)) {
      const studioId = studioByName.get(normalize(developer));
      if (!studioId) continue;
      studioIds.add(studioId);
      addToSetMap(studioGameKeys, studioId, key);
    }
    mainGroups.set(key, { name: rows[0].name, platforms: new Set(rows.flatMap(catalogPlatforms)), studioIds, dlcGroups: new Map() });
  }

  const dlcByGameId = new Map<string, DlcIndex>();
  for (const dlc of games) {
    if (dlc.contentType !== "DLC") continue;
    const parentIds = new Set(declaredParentsByDlcId.get(dlc.id) ?? []);
    if (dlc.parentGameId) parentIds.add(dlc.parentGameId);
    const mainKeys = new Set<string>();
    const dlcLogicalKey = logicalGameKey(dlc);
    for (const parentId of parentIds) {
      const mainKey = mainKeyByGameId.get(parentId);
      const main = mainKey ? mainGroups.get(mainKey) : null;
      if (!mainKey || !main) continue;
      mainKeys.add(mainKey);
      addToSetMap(main.dlcGroups, dlcLogicalKey, dlc.id);
    }
    dlcByGameId.set(dlc.id, { logicalKey: dlcLogicalKey, mainKeys });
  }
  return { gameById, mainKeyByGameId, mainGroups, dlcByGameId, studioById, studioGameKeys };
}

function scoreOneUser(user: LeaderboardUser, catalog: CatalogIndex): Omit<LeaderboardEntry, "rank"> {
  const rarityCounts = new Map<LeaderboardRarity, number>(LEADERBOARD_RARITIES.map((level) => [level, 0]));
  const bestSubjectPoints = new Map<string, number>();
  const subjectsByRarity = new Map<LeaderboardRarity, Set<string>>(LEADERBOARD_RARITIES.map((level) => [level, new Set()]));
  const ownedMainSubjects = new Map<string, Set<string>>();
  const ownedPlatforms = new Map<string, Set<string>>();
  const ownedDlcSubjects = new Map<string, Map<string, Set<string>>>();

  for (const card of user.cards) {
    rarityCounts.set(card.rarity, (rarityCounts.get(card.rarity) ?? 0) + 1);
    const key = card.gameId ? subjectKey("GAME", card.gameId) : card.studioId ? subjectKey("STUDIO", card.studioId) : null;
    if (!key) continue;
    bestSubjectPoints.set(key, Math.max(bestSubjectPoints.get(key) ?? 0, LEADERBOARD_RARITY_POINTS[card.rarity]));
    subjectsByRarity.get(card.rarity)?.add(key);
    if (!card.gameId) continue;
    const game = catalog.gameById.get(card.gameId);
    if (!game) continue;
    if (game.contentType === "GAME") {
      const mainKey = catalog.mainKeyByGameId.get(game.id);
      if (!mainKey) continue;
      addToSetMap(ownedMainSubjects, mainKey, key);
      for (const platform of catalogPlatforms(game)) addToSetMap(ownedPlatforms, mainKey, platform);
    } else {
      const dlc = catalog.dlcByGameId.get(game.id);
      if (!dlc) continue;
      for (const mainKey of dlc.mainKeys) {
        const groups = ownedDlcSubjects.get(mainKey) ?? new Map<string, Set<string>>();
        addToSetMap(groups, dlc.logicalKey, key);
        ownedDlcSubjects.set(mainKey, groups);
      }
    }
  }

  const rarity = LEADERBOARD_RARITIES.map((level) => { const count = rarityCounts.get(level) ?? 0; return { rarity: level, count, points: count * LEADERBOARD_RARITY_POINTS[level] }; });
  const baseScore = rarity.reduce((sum, row) => sum + row.points, 0);
  const candidates: ComboCandidate[] = [];
  const rewardMap = new Map<string, LeaderboardReward>();
  let duoCount = 0;
  const addReward = (reward: LeaderboardReward) => rewardMap.set(reward.key, reward);
  const ownedSubject = (key: string) => bestSubjectPoints.has(key);

  for (const [mainKey, mainSubjects] of ownedMainSubjects) {
    const main = catalog.mainGroups.get(mainKey);
    if (!main) continue;
    const mainKeys = [...mainSubjects];
    const bestMainKey = bestKey(mainKeys, bestSubjectPoints);
    const platforms = ownedPlatforms.get(mainKey) ?? new Set<string>();
    const platformRatio = main.platforms.size >= 2 ? platforms.size / main.platforms.size : 0;
    const platformMultiplier = tier(platformRatio, 1.5, 1.3, 1.15);
    const ownedDlcGroups = ownedDlcSubjects.get(mainKey) ?? new Map<string, Set<string>>();
    const ownedDlcKeys = uniqueKeys([...ownedDlcGroups.values()].map((keys) => bestKey(keys, bestSubjectPoints)));
    const dlcRatio = main.dlcGroups.size ? ownedDlcGroups.size / main.dlcGroups.size : 0;
    const dlcMultiplier = tier(dlcRatio, 1.5, 1.3, 1.15);
    const bestStudioKey = bestKey([...main.studioIds].map((id) => subjectKey("STUDIO", id)).filter(ownedSubject), bestSubjectPoints);

    for (const { target, stage } of rewardStages(main.platforms.size)) if (platforms.size >= target) {
      const coins = main.platforms.size === 1 ? 20 : rewardCoins(25 + main.platforms.size * 30 * [0, .5, 1, 2][stage]);
      addReward({ key: `platform:${mainKey}:${target}`, label: `Plateformes · ${main.name}`, detail: `${target}/${main.platforms.size} plateformes`, coins, current: platforms.size, target });
    }
    for (const { target, stage } of rewardStages(main.dlcGroups.size)) if (ownedDlcGroups.size >= target) {
      const coins = main.dlcGroups.size === 1 ? 20 : rewardCoins(25 + main.dlcGroups.size * 35 * [0, .5, 1, 2][stage]);
      addReward({ key: `dlc:${mainKey}:${target}`, label: `DLC · ${main.name}`, detail: `${target}/${main.dlcGroups.size} DLC`, coins, current: ownedDlcGroups.size, target });
    }
    if (bestMainKey && bestStudioKey) duoCount += 1;
    if (platformRatio >= 1 && dlcRatio >= 1 && bestStudioKey) {
      const requirements = main.platforms.size + main.dlcGroups.size + 1;
      addReward({ key: `ultimate:${mainKey}`, label: `Collection ultime · ${main.name}`, detail: "Plateformes, DLC et studio", coins: rewardCoins(250 + requirements * 140), current: requirements, target: requirements });
    }

    if (platformMultiplier > 1) candidates.push({ label: platformRatio >= 1 ? "Multiplateforme complète" : "Progression multiplateforme", detail: `${main.name} · ${platforms.size}/${main.platforms.size} plateformes`, multiplier: platformMultiplier, points: 0, progress: { current: platforms.size, total: main.platforms.size, next: nextThreshold(platforms.size, main.platforms.size) }, subjects: mainKeys, priority: 30 });
    if (dlcMultiplier > 1 && bestMainKey) candidates.push({ label: dlcRatio >= 1 ? "Édition complète" : "Progression DLC", detail: `${main.name} · ${ownedDlcGroups.size}/${main.dlcGroups.size} DLC`, multiplier: dlcMultiplier, points: 0, progress: { current: ownedDlcGroups.size, total: main.dlcGroups.size, next: nextThreshold(ownedDlcGroups.size, main.dlcGroups.size) }, subjects: uniqueKeys([bestMainKey, ...ownedDlcKeys]), priority: 31 });
    if (bestMainKey && bestStudioKey) candidates.push({ label: "Duo créateur", detail: `${main.name} + ${catalog.studioById.get(bestStudioKey.slice(7))?.name ?? "studio associé"}`, multiplier: 1.25, points: 0, subjects: [bestMainKey, bestStudioKey], priority: 20 });
    if (platformRatio >= 1 && dlcRatio >= 1 && bestStudioKey) candidates.push({ label: "Collection ultime", detail: `${main.name} · plateformes + DLC + studio`, multiplier: 3, points: 0, subjects: uniqueKeys([...mainKeys, ...ownedDlcKeys, bestStudioKey]), priority: 60 });
  }

  for (const [target, coins] of [[10, 100], [25, 400], [50, 1500], [100, 4000]] as const) if (duoCount >= target) {
    addReward({ key: `duos:${target}`, label: "Duos créateurs", detail: `${target} jeux avec leur carte Studio`, coins, current: duoCount, target });
  }

  const candidateStudioIds = new Set<string>();
  for (const mainKey of ownedMainSubjects.keys()) for (const studioId of catalog.mainGroups.get(mainKey)?.studioIds ?? []) candidateStudioIds.add(studioId);
  for (const studioId of candidateStudioIds) {
    const studioGames = catalog.studioGameKeys.get(studioId);
    const studio = catalog.studioById.get(studioId);
    if (!studioGames?.size || !studio) continue;
    const ownedGameKeys = uniqueKeys([...ownedMainSubjects].filter(([mainKey]) => studioGames.has(mainKey)).map(([, keys]) => bestKey(keys, bestSubjectPoints)));
    const ratio = ownedGameKeys.length / studioGames.size;
    const studioKey = subjectKey("STUDIO", studioId);
    const hasStudioCard = ownedSubject(studioKey);
    const multiplier = ratio >= 1 && hasStudioCard ? 2.5 : tier(ratio, 2, 1.5, 1.25);
    if (multiplier <= 1) continue;
    for (const { target, stage } of rewardStages(studioGames.size)) if (ownedGameKeys.length >= target) {
      const base = studioGames.size === 1 ? 20 : stage === 1 ? 20 + Math.max(0, studioGames.size - 3) * 18 : stage === 2 ? 60 + Math.max(0, studioGames.size - 3) * 35 : 120 + Math.max(0, studioGames.size - 3) * 70;
      addReward({ key: `studio:${studioId}:${target}`, label: `Studio · ${studio.name}`, detail: `${target}/${studioGames.size} jeux`, coins: rewardCoins(base), current: ownedGameKeys.length, target });
    }
    if (ratio >= 1 && hasStudioCard) addReward({ key: `studio-card:${studioId}`, label: `Studio absolu · ${studio.name}`, detail: "Tous les jeux et la carte Studio", coins: studioGames.size === 1 ? 50 : rewardCoins(100 + studioGames.size * 85), current: studioGames.size + 1, target: studioGames.size + 1 });
    candidates.push({ label: ratio >= 1 ? (hasStudioCard ? "Studio absolu" : "Maître du studio") : "Progression studio", detail: `${studio.name} · ${ownedGameKeys.length}/${studioGames.size} jeux${ratio >= 1 && hasStudioCard ? " + carte Studio" : ""}`, multiplier, points: 0, progress: { current: ownedGameKeys.length, total: studioGames.size, next: nextThreshold(ownedGameKeys.length, studioGames.size) }, subjects: uniqueKeys([...ownedGameKeys, ratio >= 1 && hasStudioCard ? studioKey : null]), priority: ratio >= 1 && hasStudioCard ? 50 : 40 });
  }

  const awardedSubject = new Map<string, ComboCandidate>();
  for (const candidate of [...candidates].sort((a, b) => (b.multiplier ?? 1) - (a.multiplier ?? 1) || b.priority - a.priority)) for (const key of candidate.subjects) if (!awardedSubject.has(key)) awardedSubject.set(key, candidate);
  const awarded = new Map<ComboCandidate, number>();
  for (const [key, candidate] of awardedSubject) awarded.set(candidate, (awarded.get(candidate) ?? 0) + Math.round((bestSubjectPoints.get(key) ?? 0) * ((candidate.multiplier ?? 1) - 1)));
  const bonuses: LeaderboardBonus[] = [...awarded.entries()].filter(([, points]) => points > 0).map(([candidate, points]) => ({ label: candidate.label, detail: candidate.detail, multiplier: candidate.multiplier, points, ...(candidate.progress ? { progress: candidate.progress } : {}) }));
  const rarityCount = rarity.filter((row) => row.count > 0).length;
  const rarityReward = rarityCount >= 5 ? 1000 : rarityCount >= 4 ? 600 : rarityCount >= 3 ? 300 : 0;
  if (rarityReward) bonuses.push({ label: "Éventail des raretés", detail: `${rarityCount}/5 raretés représentées`, multiplier: null, points: rarityReward, progress: { current: rarityCount, total: 5, next: rarityCount < 5 ? rarityCount + 1 : null } });
  for (const target of [4, 5]) if (rarityCount >= target) addReward({ key: `rarities:${target}`, label: "Éventail des raretés", detail: `${target}/5 raretés`, coins: target === 4 ? 200 : 600, current: rarityCount, target });
  for (const level of LEADERBOARD_RARITIES) {
    const count = subjectsByRarity.get(level)?.size ?? 0;
    const multiplier = count >= 20 ? 1.2 : count >= 10 ? 1.1 : count >= 5 ? 1.05 : 1;
    if (multiplier > 1) bonuses.push({ label: "Forge monochrome", detail: `${count} cartes ${level.toLocaleLowerCase("fr")} différentes`, multiplier, points: Math.round(count * LEADERBOARD_RARITY_POINTS[level] * (multiplier - 1)), progress: { current: count, total: 20, next: count < 10 ? 10 : count < 20 ? 20 : null } });
    for (const target of [20, 50, 100]) if (count >= target) addReward({ key: `monochrome:${level}:${target}`, label: `Forge ${level.toLocaleLowerCase("fr")}`, detail: `${target} cartes différentes`, coins: rewardCoins(target * LEADERBOARD_RARITY_POINTS[level] / 3), current: count, target });
  }
  const comboScore = bonuses.reduce((sum, bonus) => sum + bonus.points, 0);
  const advancedCollections = [...awarded.values()].filter((points) => points > 0).length;
  const globalMultiplier = advancedCollections >= 10 ? 1.2 : advancedCollections >= 5 ? 1.1 : advancedCollections >= 3 ? 1.05 : 1;
  const globalBonus = Math.round((baseScore + comboScore) * (globalMultiplier - 1));
  for (const target of [10, 25, 50]) if (advancedCollections >= target) addReward({ key: `global:${target}`, label: "Collections avancées", detail: `${target} collections avec bonus`, coins: target === 10 ? 500 : target === 25 ? 1800 : 5000, current: advancedCollections, target });
  return { id: user.id, username: user.username, score: baseScore + comboScore + globalBonus, baseScore, comboScore, globalMultiplier, globalBonus, cardCount: user.cards.length, rarity, bonuses, rewards: [...rewardMap.values()].sort((a, b) => a.coins - b.coins || a.label.localeCompare(b.label, "fr")) };
}

export function buildLeaderboard(users: LeaderboardUser[], games: LeaderboardGame[], studios: LeaderboardStudio[]): LeaderboardEntry[] {
  const catalog = buildCatalogIndex(games, studios);
  const sorted = users.map((user) => scoreOneUser(user, catalog)).sort((a, b) => b.score - a.score || a.username.localeCompare(b.username, "fr"));
  let previousScore: number | null = null; let previousRank = 0;
  return sorted.map((entry, index) => { const rank = previousScore === entry.score ? previousRank : index + 1; previousScore = entry.score; previousRank = rank; return { ...entry, rank }; });
}
