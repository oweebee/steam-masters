import { prisma } from "@/lib/prisma";
import type { Rarity } from "@/lib/rarityRoll";

// Rareté CATALOGUE (SteamGame.rarity / Studio.rarity) : classement PAR
// PERCENTILE du reviewScore/avgReviewScore sur l'ensemble Jeux+Studios réunis,
// PAS un seuil fixe. Un seuil fixe (ex: score>=98 => LEGENDARY) explose dès que
// le catalogue est en majorité composé de jeux bien notés (biais de sélection à
// l'import) : tout devient Légendaire. Le classement relatif garantit la
// barrière de distribution quelle que soit la distribution réelle des scores :
// 0.5% Légendaire / 5% Épique / 10% Rare / 20% Peu commun / 64.5% Commun (mêmes
// proportions que le tirage carte instance, cf rarityRoll.ts WEIGHTS).
// Ne touche JAMAIS Card.rarity (rareté d'exemplaire, tirée au booster, figée).
const LEGENDARY_PCT = 0.005;
const EPIC_PCT = 0.055;
const RARE_PCT = 0.155;
const UNCOMMON_PCT = 0.355;

function rarityForPosition(position: number, total: number): Rarity {
  if (position <= Math.round(total * LEGENDARY_PCT)) return "LEGENDARY";
  if (position <= Math.round(total * EPIC_PCT)) return "EPIC";
  if (position <= Math.round(total * RARE_PCT)) return "RARE";
  if (position <= Math.round(total * UNCOMMON_PCT)) return "UNCOMMON";
  return "COMMON";
}

export async function recalculateCatalogRarity() {
  const [games, studios] = await Promise.all([
    prisma.steamGame.findMany({ select: { id: true, reviewScore: true, rarity: true } }),
    prisma.studio.findMany({ select: { id: true, avgReviewScore: true, rarity: true } }),
  ]);

  type Entry = { kind: "GAME" | "STUDIO"; id: string; score: number; rarity: Rarity };
  const entries: Entry[] = [
    ...games.map((g) => ({ kind: "GAME" as const, id: g.id, score: g.reviewScore, rarity: g.rarity as Rarity })),
    ...studios.map((s) => ({ kind: "STUDIO" as const, id: s.id, score: s.avgReviewScore, rarity: s.rarity as Rarity })),
  ];
  const total = entries.length;
  if (total === 0) return { entriesScanned: 0, gamesFixed: 0, studiosFixed: 0 };

  // Tri décroissant par score, départage stable par id (déterministe, rejouable).
  entries.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const gameUpdates: { id: string; rarity: Rarity }[] = [];
  const studioUpdates: { id: string; rarity: Rarity }[] = [];

  entries.forEach((entry, index) => {
    const expected = rarityForPosition(index + 1, total);
    if (expected === entry.rarity) return;
    if (entry.kind === "GAME") gameUpdates.push({ id: entry.id, rarity: expected });
    else studioUpdates.push({ id: entry.id, rarity: expected });
  });

  if (gameUpdates.length + studioUpdates.length > 0) {
    await prisma.$transaction([
      ...gameUpdates.map((u) => prisma.steamGame.update({ where: { id: u.id }, data: { rarity: u.rarity } })),
      ...studioUpdates.map((u) => prisma.studio.update({ where: { id: u.id }, data: { rarity: u.rarity } })),
    ]);
  }

  return { entriesScanned: total, gamesFixed: gameUpdates.length, studiosFixed: studioUpdates.length };
}
