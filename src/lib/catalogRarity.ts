import { prisma } from "@/lib/prisma";
import { rollAtkForRarity, type Rarity } from "@/lib/rarityRoll";

// Rareté CATALOGUE (SteamGame.rarity / Studio.rarity)
// Jeux/DLC : classement par PERCENTILE ownerEstimate + seuils min configurables.
// Studios   : héritent du ownerEstimate du MEILLEUR jeu du studio, mêmes seuils.

// Les cartes EPIC/LEGENDARY existantes non éligibles sont rétrogradées.
const LEGENDARY_PCT = 0.005;
const EPIC_PCT = 0.055;
const RARE_PCT = 0.155;
const UNCOMMON_PCT = 0.355;
export const LEGENDARY_MIN_OWNER_ESTIMATE = 5_000_000;
// À partir de 5 M de possesseurs SteamSpy estimés, un jeu ne peut plus être
// COMMON/UNCOMMON/RARE. La limite épique s'élargit au nombre de jeux concernés.
export const EPIC_MIN_OWNER_ESTIMATE = 5_000_000;

export function isLegendaryGameEligible(ownerEstimate: number, catalogRarity: Rarity): boolean {
  return catalogRarity === "LEGENDARY" && ownerEstimate >= LEGENDARY_MIN_OWNER_ESTIMATE;
}

export function isEpicGameEligible(ownerEstimate: number, catalogRarity: Rarity): boolean {
  return (catalogRarity === "EPIC" || catalogRarity === "LEGENDARY") && ownerEstimate >= EPIC_MIN_OWNER_ESTIMATE;
}

/** Rareté d'un studio d'après le ownerEstimate de son meilleur jeu + seuils admin. */
function studioRarityFromBestGame(bestOwner: number, legendaryMin: number, epicMin: number, rareMin: number, uncommonMin: number): Rarity {
  if (bestOwner >= legendaryMin) return "LEGENDARY";
  if (bestOwner >= epicMin) return "EPIC";
  if (rareMin > 0 && bestOwner >= rareMin) return "RARE";
  if (uncommonMin > 0 && bestOwner >= uncommonMin) return "UNCOMMON";
  return "COMMON";
}

function gameRarityForPosition(position: number, total: number, epicEnd: number): Rarity {
  const legendaryEnd = Math.round(total * LEGENDARY_PCT);
  if (position <= legendaryEnd) return "LEGENDARY";
  if (position <= epicEnd) return "EPIC";

  // L'augmentation du palier violet est prise sur les trois raretés restantes
  // en conservant leurs proportions relatives historiques (10:20:64,5).
  const remaining = Math.max(0, total - epicEnd);
  const rareEnd = epicEnd + Math.round(remaining * ((RARE_PCT - EPIC_PCT) / (1 - EPIC_PCT)));
  const uncommonEnd = rareEnd + Math.round(remaining * ((UNCOMMON_PCT - RARE_PCT) / (1 - EPIC_PCT)));
  if (position <= rareEnd) return "RARE";
  if (position <= uncommonEnd) return "UNCOMMON";
  return "COMMON";
}

export async function recalculateCatalogRarity({ skipCards = false }: { skipCards?: boolean } = {}) {
  try {
  // Seuils configurables via admin/settings (clés LEGENDARY_MIN_OWNERS / EPIC_MIN_OWNERS)
  const settings = await prisma.appSetting.findMany({ where: { key: { in: ["LEGENDARY_MIN_OWNERS", "EPIC_MIN_OWNERS", "RARE_MIN_OWNERS", "UNCOMMON_MIN_OWNERS"] } } });
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, parseInt(s.value, 10)]));
  const legendaryMin = settingsMap["LEGENDARY_MIN_OWNERS"] ?? LEGENDARY_MIN_OWNER_ESTIMATE;
  const epicMin = settingsMap["EPIC_MIN_OWNERS"] ?? EPIC_MIN_OWNER_ESTIMATE;
  const rareMin = settingsMap["RARE_MIN_OWNERS"] ?? 0;
  const uncommonMin = settingsMap["UNCOMMON_MIN_OWNERS"] ?? 0;

  const [games, dlcs, studios] = await Promise.all([
    prisma.steamGame.findMany({ where: { contentType: "GAME" }, select: { id: true, reviewScore: true, ownerEstimate: true, rarity: true, developers: true, source: true } }),
    prisma.steamGame.findMany({ where: { contentType: "DLC" }, select: { id: true, ownerEstimate: true, rarity: true, source: true } }),
    prisma.studio.findMany({ select: { id: true, name: true, rarity: true } }),
  ]);

  const bestOwnerByStudio = new Map<string, number>();
  for (const game of games) {
    for (const developer of game.developers) {
      bestOwnerByStudio.set(developer, Math.max(bestOwnerByStudio.get(developer) ?? 0, game.ownerEstimate));
    }
  }

  const gamesTotal = games.length;
  if (gamesTotal + dlcs.length + studios.length === 0) return { entriesScanned: 0, gamesFixed: 0, studiosFixed: 0 };

  // Jeux : tri décroissant par ownerEstimate (ventes réelles), départage
  // stable par id. Légendaire = top 0.5% des jeux les plus possédés.
  // Percentile calculé PAR SOURCE (STEAM / IGDB) séparément : les ownerEstimate
  // IGDB (formule follows+hypes+ratingCount, sans commune mesure avec les
  // ventes Steam) écrasaient tout le catalogue rétro en COMMON sur un
  // classement global unique.
  const allEntries = [
    ...games.map((game) => ({ ...game, contentType: "GAME" as const })),
    ...dlcs.map((dlc) => ({ ...dlc, reviewScore: 0, developers: [] as string[], contentType: "DLC" as const })),
  ];

  const gameUpdates: { id: string; rarity: Rarity }[] = [];
  const dlcUpdates: { id: string; rarity: Rarity }[] = [];
  const studioUpdates: { id: string; rarity: Rarity }[] = [];

  for (const source of ["STEAM", "IGDB"] as const) {
    const catalogSorted = allEntries
      .filter((item) => item.source === source)
      .sort((a, b) => b.ownerEstimate - a.ownerEstimate || a.id.localeCompare(b.id));
    if (catalogSorted.length === 0) continue;
    const gamesWithEpicSales = catalogSorted.filter((item) => item.ownerEstimate >= epicMin).length;
    const gamesEpicEnd = Math.min(catalogSorted.length, Math.max(Math.round(catalogSorted.length * EPIC_PCT), gamesWithEpicSales));

    // Seuils absolus (admin) calibrés sur les possesseurs SteamSpy : appliqués
    // à Steam seulement. L'ownerEstimate IGDB (follows+hypes+ratingCount×5,
    // max ~5k) ne les atteindrait jamais et resterait tout COMMON.
    const applyFloors = source === "STEAM";
    const epicEnd = applyFloors ? gamesEpicEnd : Math.round(catalogSorted.length * EPIC_PCT);
    catalogSorted.forEach((item, index) => {
      let expected = gameRarityForPosition(index + 1, catalogSorted.length, epicEnd);
      if (!applyFloors) {
        if (expected !== (item.rarity as Rarity)) {
          (item.contentType === "DLC" ? dlcUpdates : gameUpdates).push({ id: item.id, rarity: expected });
        }
        return;
      }
      if (expected === "LEGENDARY" && item.ownerEstimate < legendaryMin) {
        expected = item.ownerEstimate >= epicMin ? "EPIC" : "RARE";
      } else if (expected === "EPIC" && item.ownerEstimate < epicMin) {
        expected = "RARE";
      }
      if (expected === "RARE" && rareMin > 0 && item.ownerEstimate < rareMin) {
        expected = item.ownerEstimate >= uncommonMin ? "UNCOMMON" : "COMMON";
      } else if (expected === "UNCOMMON" && uncommonMin > 0 && item.ownerEstimate < uncommonMin) {
        expected = "COMMON";
      }
      if (expected !== (item.rarity as Rarity)) {
        (item.contentType === "DLC" ? dlcUpdates : gameUpdates).push({ id: item.id, rarity: expected });
      }
    });
  }

  for (const studio of studios) {
    const bestOwner = bestOwnerByStudio.get(studio.name) ?? 0;
    const expected = studioRarityFromBestGame(bestOwner, legendaryMin, epicMin, rareMin, uncommonMin);
    if (expected !== (studio.rarity as Rarity)) studioUpdates.push({ id: studio.id, rarity: expected });
  }

  const groupIds = (updates: { id: string; rarity: Rarity }[]) => {
    const byRarity = new Map<Rarity, string[]>();
    for (const u of updates) byRarity.set(u.rarity, [...(byRarity.get(u.rarity) ?? []), u.id]);
    return Array.from(byRarity);
  };

  if (gameUpdates.length + dlcUpdates.length + studioUpdates.length > 0) {
    // Regroupement par rareté cible : au plus 5 updateMany par table au lieu
    // d'un UPDATE par ligne (un réimport peut décaler des centaines de rangs).
    // Fallback ligne par ligne si la transaction échoue (ex: timeout, lock).
    try {
      await prisma.$transaction([
        ...groupIds(gameUpdates).map(([rarity, ids]) => prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
        ...groupIds(dlcUpdates).map(([rarity, ids]) => prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
        ...groupIds(studioUpdates).map(([rarity, ids]) => prisma.studio.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
      ]);
    } catch (err) {
      // Fallback : groupes séparés sans transaction globale
      console.error("[catalogRarity] transaction échouée, fallback individuel :", err);
      for (const [rarity, ids] of groupIds(gameUpdates))
        await prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } }).catch(console.error);
      for (const [rarity, ids] of groupIds(dlcUpdates))
        await prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } }).catch(console.error);
      for (const [rarity, ids] of groupIds(studioUpdates))
        await prisma.studio.updateMany({ where: { id: { in: ids } }, data: { rarity } }).catch(console.error);
    }
  }

  const eligibleStudios = await prisma.studio.findMany({
    where: { rarity: { in: ["EPIC", "LEGENDARY"] } },
    select: { name: true, rarity: true, avgReviewScore: true },
  });
  const eligibleStudioNames = new Set(eligibleStudios.map((s) => s.name));
  const legendaryStudioNames = new Set(eligibleStudios.filter((s) => s.rarity === "LEGENDARY").map((s) => s.name));
  const cards = await prisma.card.findMany({
    where: { rarity: { in: ["RARE", "EPIC", "LEGENDARY"] } },
    select: { id: true, rarity: true, atk: true, game: { select: { rarity: true, ownerEstimate: true, contentType: true, reviewScore: true } }, studio: { select: { name: true, avgReviewScore: true } } },
  });
  const cardUpdates: { id: string; rarity: Rarity; atk: number }[] = [];
  for (const card of cards) {

    const legendaryEligible = card.game
      ? isLegendaryGameEligible(card.game.ownerEstimate, card.game.rarity)
      : !!card.studio && legendaryStudioNames.has(card.studio.name);
    if (card.rarity === "LEGENDARY" && legendaryEligible) continue;
    const epicEligible = card.game
      ? isEpicGameEligible(card.game.ownerEstimate, card.game.rarity)
      : !!card.studio && eligibleStudioNames.has(card.studio.name);
    const rarity: Rarity = epicEligible ? "EPIC" : "RARE";
    const reviewScore = card.game?.reviewScore ?? card.studio?.avgReviewScore;
    const atk = rollAtkForRarity(rarity, reviewScore);
    if (rarity !== card.rarity || (reviewScore !== undefined && reviewScore >= 98 && card.atk !== 10)) {
      cardUpdates.push({ id: card.id, rarity, atk });
    }
  }
  if (!skipCards && cardUpdates.length) {
    const groups = new Map<string, typeof cardUpdates>();
    for (const update of cardUpdates) {
      const key = `${update.rarity}:${update.atk}`;
      groups.set(key, [...(groups.get(key) ?? []), update]);
    }
    const cardOps = Array.from(groups.values()).map((items) => prisma.card.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { rarity: items[0].rarity, atk: items[0].atk },
    }));
    try {
      await prisma.$transaction(cardOps);
    } catch (err) {
      console.error("[catalogRarity] transaction cartes échouée, fallback individuel :", err);
      for (const op of cardOps) await op.catch(console.error);
    }
  }

  return { entriesScanned: gamesTotal + dlcs.length + studios.length, gamesFixed: gameUpdates.length + dlcUpdates.length, studiosFixed: studioUpdates.length, cardsFixed: cardUpdates.length };
  } catch (err) {
    console.error("[catalogRarity] recalculateCatalogRarity a planté :", err);
    return { entriesScanned: 0, gamesFixed: 0, studiosFixed: 0, cardsFixed: 0, error: String(err) };
  }
}
