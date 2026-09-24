import { prisma } from "@/lib/prisma";
import { rollAtkForRarity, type Rarity } from "@/lib/rarityRoll";

// Rareté CATALOGUE (SteamGame.rarity / Studio.rarity) : classement PAR
// PERCENTILE, PAS un seuil fixe. Un seuil fixe explose dès que le catalogue
// est biaisé à l'import : tout devient Légendaire. Le classement relatif fixe
// les cibles : 0.5% Légendaire / 5% Épique / 10% Rare / 20% Peu commun /
// 64.5% Commun (mêmes proportions que le tirage carte instance, cf
// rarityRoll.ts WEIGHTS).
//
// Jeux : classés par ownerEstimate (ventes/popularité réelle SteamSpy), PAS
// par reviewScore. Légendaire requiert top 0,5% et >=5M d'owners; Épique top
// 5,5% et >=1M. Les jeux AAA/AA et indés n'atteignent ces paliers que par leurs ventes.
// Studios : classés séparément; Épique requiert un jeu aux ventes éligibles,
// les paliers inférieurs gardent le meilleur score d'avis comme plafond :
// les pourcentages deviennent donc des plafonds, pas une garantie exacte de
// remplissage, pour les deux pools.
// Les cartes EPIC/LEGENDARY existantes non éligibles sont rétrogradées et leur ATK réalignée.
const LEGENDARY_PCT = 0.005;
const EPIC_PCT = 0.055;
const RARE_PCT = 0.155;
const UNCOMMON_PCT = 0.355;
export const LEGENDARY_MIN_OWNER_ESTIMATE = 5_000_000;
export const EPIC_MIN_OWNER_ESTIMATE = 1_000_000;

export function isLegendaryGameEligible(ownerEstimate: number, catalogRarity: Rarity, contentType: "GAME" | "DLC" = "GAME"): boolean {
  return contentType === "GAME" && catalogRarity === "LEGENDARY" && ownerEstimate >= LEGENDARY_MIN_OWNER_ESTIMATE;
}

export function isEpicGameEligible(ownerEstimate: number, catalogRarity: Rarity): boolean {
  return (catalogRarity === "EPIC" || catalogRarity === "LEGENDARY") && ownerEstimate >= EPIC_MIN_OWNER_ESTIMATE;
}

const RARITY_RANK: Record<Rarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  UNCOMMON: 3,
  COMMON: 4,
};

const RARITY_BY_RANK: Rarity[] = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"];

/** Rareté catalogue maximale autorisée par le meilleur jeu réel d'un studio. */
export function studioEligibilityFromBestGameScore(bestReviewScore: number): Rarity {
  if (bestReviewScore >= 91) return "RARE";
  if (bestReviewScore >= 85) return "UNCOMMON";
  return "COMMON";
}

function capStudioRarity(percentileRarity: Rarity, bestReviewScore: number, hasEpicSalesGame: boolean): Rarity {
  const boundedPercentile = percentileRarity === "LEGENDARY" && !hasEpicSalesGame ? "RARE" : percentileRarity;
  const eligibility = hasEpicSalesGame ? "EPIC" : studioEligibilityFromBestGameScore(bestReviewScore);
  const capped = RARITY_BY_RANK[Math.max(RARITY_RANK[boundedPercentile], RARITY_RANK[eligibility])];
  // La rareté LEGENDARY est réservée aux jeux : un studio ne peut jamais être orange.
  return capped === "LEGENDARY" ? "EPIC" : capped;
}

function rarityForPosition(position: number, total: number): Rarity {
  if (position <= Math.round(total * LEGENDARY_PCT)) return "LEGENDARY";
  if (position <= Math.round(total * EPIC_PCT)) return "EPIC";
  if (position <= Math.round(total * RARE_PCT)) return "RARE";
  if (position <= Math.round(total * UNCOMMON_PCT)) return "UNCOMMON";
  return "COMMON";
}

export async function recalculateCatalogRarity() {
  const [games, dlcs, studios] = await Promise.all([
    prisma.steamGame.findMany({ where: { contentType: "GAME" }, select: { id: true, reviewScore: true, ownerEstimate: true, rarity: true, developers: true } }),
    prisma.steamGame.findMany({ where: { contentType: "DLC" }, select: { id: true, ownerEstimate: true, rarity: true } }),
    prisma.studio.findMany({ select: { id: true, name: true, avgReviewScore: true, rarity: true } }),
  ]);

  const bestScoreByStudio = new Map<string, number>();
  for (const game of games) {
    for (const developer of game.developers) {
      bestScoreByStudio.set(developer, Math.max(bestScoreByStudio.get(developer) ?? 0, game.reviewScore));
    }
  }

  const gamesTotal = games.length;
  const studiosTotal = studios.length;
  if (gamesTotal + studiosTotal === 0) return { entriesScanned: 0, gamesFixed: 0, studiosFixed: 0 };

  // Jeux : tri décroissant par ownerEstimate (ventes réelles), départage
  // stable par id. Légendaire = top 0.5% des jeux les plus possédés.
  const gamesSorted = [...games].sort((a, b) => b.ownerEstimate - a.ownerEstimate || a.id.localeCompare(b.id));
  const dlcsSorted = [...dlcs].sort((a, b) => b.ownerEstimate - a.ownerEstimate || a.id.localeCompare(b.id));

  // Studios : tri décroissant par avgReviewScore, pool séparé des jeux.
  const studiosSorted = [...studios].sort((a, b) => b.avgReviewScore - a.avgReviewScore || a.id.localeCompare(b.id));

  const gameUpdates: { id: string; rarity: Rarity }[] = [];
  const dlcUpdates: { id: string; rarity: Rarity }[] = [];
  const studioUpdates: { id: string; rarity: Rarity }[] = [];

  gamesSorted.forEach((game, index) => {
    let expected = rarityForPosition(index + 1, gamesTotal);
    if (expected === "LEGENDARY" && game.ownerEstimate < LEGENDARY_MIN_OWNER_ESTIMATE) {
      expected = game.ownerEstimate >= EPIC_MIN_OWNER_ESTIMATE ? "EPIC" : "RARE";
    } else if (expected === "EPIC" && game.ownerEstimate < EPIC_MIN_OWNER_ESTIMATE) {
      expected = "RARE";
    }
    if (expected !== (game.rarity as Rarity)) gameUpdates.push({ id: game.id, rarity: expected });
  });

  dlcsSorted.forEach((dlc, index) => {
    const ranked = rarityForPosition(index + 1, dlcs.length);
    const expected = ranked === "LEGENDARY"
      ? (dlc.ownerEstimate >= EPIC_MIN_OWNER_ESTIMATE ? "EPIC" : "RARE")
      : ranked === "EPIC" && dlc.ownerEstimate < EPIC_MIN_OWNER_ESTIMATE ? "RARE" : ranked;
    if (expected !== (dlc.rarity as Rarity)) dlcUpdates.push({ id: dlc.id, rarity: expected });
  });

  const epicEligibleStudios = new Set<string>();
  gamesSorted.forEach((game, gameIndex) => {
    const rank = rarityForPosition(gameIndex + 1, gamesTotal);
    if ((rank === "EPIC" || rank === "LEGENDARY") && game.ownerEstimate >= EPIC_MIN_OWNER_ESTIMATE) {
      game.developers.forEach((developer) => epicEligibleStudios.add(developer));
    }
  });

  studiosSorted.forEach((studio, index) => {
    const percentileRarity = rarityForPosition(index + 1, studiosTotal);
    const expected = capStudioRarity(percentileRarity, bestScoreByStudio.get(studio.name) ?? 0, epicEligibleStudios.has(studio.name));
    if (expected !== (studio.rarity as Rarity)) studioUpdates.push({ id: studio.id, rarity: expected });
  });

  if (gameUpdates.length + dlcUpdates.length + studioUpdates.length > 0) {
    // Regroupement par rareté cible : au plus 5 updateMany par table au lieu
    // d'un UPDATE par ligne (un réimport peut décaler des centaines de rangs).
    const groupIds = (updates: { id: string; rarity: Rarity }[]) => {
      const byRarity = new Map<Rarity, string[]>();
      for (const u of updates) byRarity.set(u.rarity, [...(byRarity.get(u.rarity) ?? []), u.id]);
      return Array.from(byRarity);
    };
    await prisma.$transaction([
      ...groupIds(gameUpdates).map(([rarity, ids]) => prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
      ...groupIds(dlcUpdates).map(([rarity, ids]) => prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
      ...groupIds(studioUpdates).map(([rarity, ids]) => prisma.studio.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
    ]);
  }

  const eligibleStudios = await prisma.studio.findMany({
    where: { rarity: "EPIC" },
    select: { name: true },
  });
  const eligibleStudioNames = new Set(eligibleStudios.map((studio) => studio.name));
  const cards = await prisma.card.findMany({
    where: { rarity: { in: ["EPIC", "LEGENDARY"] } },
    select: { id: true, rarity: true, game: { select: { rarity: true, ownerEstimate: true, contentType: true } }, studio: { select: { name: true } } },
  });
  const cardUpdates: { id: string; rarity: Rarity; atk: number }[] = [];
  for (const card of cards) {
    const legendaryEligible = card.game && isLegendaryGameEligible(card.game.ownerEstimate, card.game.rarity, card.game.contentType);
    if (card.rarity === "LEGENDARY" && legendaryEligible) continue;
    const epicEligible = card.game
      ? isEpicGameEligible(card.game.ownerEstimate, card.game.rarity)
      : !!card.studio && eligibleStudioNames.has(card.studio.name);
    const rarity: Rarity = epicEligible ? "EPIC" : "RARE";
    if (rarity !== card.rarity) cardUpdates.push({ id: card.id, rarity, atk: rollAtkForRarity(rarity) });
  }
  if (cardUpdates.length) {
    const groups = new Map<string, typeof cardUpdates>();
    for (const update of cardUpdates) {
      const key = `${update.rarity}:${update.atk}`;
      groups.set(key, [...(groups.get(key) ?? []), update]);
    }
    await prisma.$transaction(Array.from(groups.values()).map((items) => prisma.card.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { rarity: items[0].rarity, atk: items[0].atk },
    })));
  }

  return { entriesScanned: gamesTotal + dlcs.length + studiosTotal, gamesFixed: gameUpdates.length + dlcUpdates.length, studiosFixed: studioUpdates.length, cardsFixed: cardUpdates.length };
}
