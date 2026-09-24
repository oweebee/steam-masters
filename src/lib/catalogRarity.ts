import { prisma } from "@/lib/prisma";
import type { Rarity } from "@/lib/rarityRoll";

// Rareté CATALOGUE (SteamGame.rarity / Studio.rarity) : classement PAR
// PERCENTILE du reviewScore/avgReviewScore sur l'ensemble Jeux+Studios réunis,
// PAS un seuil fixe. Un seuil fixe (ex: score>=98 => LEGENDARY) explose dès que
// le catalogue est en majorité composé de jeux bien notés (biais de sélection à
// l'import) : tout devient Légendaire. Le classement relatif fixe les cibles :
// 0.5% Légendaire / 5% Épique / 10% Rare / 20% Peu commun / 64.5% Commun (mêmes
// proportions que le tirage carte instance, cf rarityRoll.ts WEIGHTS). Depuis
// 0020, un Studio peut ensuite être abaissé si aucun de ses jeux n'atteint la
// tranche requise : les pourcentages deviennent donc des plafonds, pas une
// garantie exacte de remplissage.
// Ne touche JAMAIS Card.rarity (rareté d'exemplaire, tirée au booster, figée).
const LEGENDARY_PCT = 0.005;
const EPIC_PCT = 0.055;
const RARE_PCT = 0.155;
const UNCOMMON_PCT = 0.355;

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
  if (bestReviewScore >= 98) return "LEGENDARY";
  if (bestReviewScore >= 96) return "EPIC";
  if (bestReviewScore >= 91) return "RARE";
  if (bestReviewScore >= 85) return "UNCOMMON";
  return "COMMON";
}

function capStudioRarity(percentileRarity: Rarity, bestReviewScore: number): Rarity {
  const eligibility = studioEligibilityFromBestGameScore(bestReviewScore);
  return RARITY_BY_RANK[Math.max(RARITY_RANK[percentileRarity], RARITY_RANK[eligibility])];
}

function rarityForPosition(position: number, total: number): Rarity {
  if (position <= Math.round(total * LEGENDARY_PCT)) return "LEGENDARY";
  if (position <= Math.round(total * EPIC_PCT)) return "EPIC";
  if (position <= Math.round(total * RARE_PCT)) return "RARE";
  if (position <= Math.round(total * UNCOMMON_PCT)) return "UNCOMMON";
  return "COMMON";
}

export async function recalculateCatalogRarity() {
  const [games, studios] = await Promise.all([
    prisma.steamGame.findMany({ select: { id: true, reviewScore: true, rarity: true, developers: true } }),
    prisma.studio.findMany({ select: { id: true, name: true, avgReviewScore: true, rarity: true } }),
  ]);

  const bestScoreByStudio = new Map<string, number>();
  for (const game of games) {
    for (const developer of game.developers) {
      bestScoreByStudio.set(developer, Math.max(bestScoreByStudio.get(developer) ?? 0, game.reviewScore));
    }
  }

  type Entry = {
    kind: "GAME" | "STUDIO";
    id: string;
    score: number;
    rarity: Rarity;
    bestGameScore?: number;
  };
  const entries: Entry[] = [
    ...games.map((g) => ({ kind: "GAME" as const, id: g.id, score: g.reviewScore, rarity: g.rarity as Rarity })),
    ...studios.map((s) => ({
      kind: "STUDIO" as const,
      id: s.id,
      score: s.avgReviewScore,
      rarity: s.rarity as Rarity,
      bestGameScore: bestScoreByStudio.get(s.name) ?? 0,
    })),
  ];
  const total = entries.length;
  if (total === 0) return { entriesScanned: 0, gamesFixed: 0, studiosFixed: 0 };

  // Tri décroissant par score, départage stable par id (déterministe, rejouable).
  entries.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const gameUpdates: { id: string; rarity: Rarity }[] = [];
  const studioUpdates: { id: string; rarity: Rarity }[] = [];

  entries.forEach((entry, index) => {
    const percentileRarity = rarityForPosition(index + 1, total);
    const expected = entry.kind === "STUDIO"
      ? capStudioRarity(percentileRarity, entry.bestGameScore ?? 0)
      : percentileRarity;
    if (expected === entry.rarity) return;
    if (entry.kind === "GAME") gameUpdates.push({ id: entry.id, rarity: expected });
    else studioUpdates.push({ id: entry.id, rarity: expected });
  });

  if (gameUpdates.length + studioUpdates.length > 0) {
    // Regroupement par rareté cible : au plus 5 updateMany par table au lieu
    // d'un UPDATE par ligne (un réimport peut décaler des centaines de rangs).
    const groupIds = (updates: { id: string; rarity: Rarity }[]) => {
      const byRarity = new Map<Rarity, string[]>();
      for (const u of updates) byRarity.set(u.rarity, [...(byRarity.get(u.rarity) ?? []), u.id]);
      return Array.from(byRarity);
    };
    await prisma.$transaction([
      ...groupIds(gameUpdates).map(([rarity, ids]) => prisma.steamGame.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
      ...groupIds(studioUpdates).map(([rarity, ids]) => prisma.studio.updateMany({ where: { id: { in: ids } }, data: { rarity } })),
    ]);
  }

  return { entriesScanned: total, gamesFixed: gameUpdates.length, studiosFixed: studioUpdates.length };
}
