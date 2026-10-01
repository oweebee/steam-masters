export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
export type RarityWeights = Record<Rarity, number>;
import { hasMaxAtkReviewScore } from "@/lib/cardAttack";

// Taux de loot fixes, indépendants du jeu/studio tiré (donnés par l'utilisateur) :
// 0,5% Orange (Légendaire), 5% Violet (Épique), 10% Bleu (Rare), 20% Vert (Magique),
// le reste en Blanc (Commun). Un exemplaire de carte est tiré une fois pour toutes
// avec cette table ; la rareté est ensuite figée (modifiable seulement par un admin).
export const DEFAULT_RARITY_WEIGHTS: RarityWeights = {
  LEGENDARY: 0.5,
  EPIC: 5,
  RARE: 10,
  UNCOMMON: 20,
  COMMON: 64.5,
};

export function rollCardRarity(weights: RarityWeights = DEFAULT_RARITY_WEIGHTS): Rarity {
  const r = Math.random() * 100;
  let acc = 0;
  for (const rarity of ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"] as const) {
    acc += weights[rarity];
    if (r < acc) return rarity;
  }
  return "COMMON";
}

// ATK par exemplaire de carte, roulé dans la bande % de sa rareté (échelle ATK
// 0-10, obtenue en divisant les anciennes bandes par 10 et en conservant
// l'entier. Logique de tirage de la rareté inchangée ;
// on associe simplement une bande d'ATK au palier déjà obtenu.
const ATK_BANDS: Record<Rarity, [number, number]> = {
  LEGENDARY: [9, 10], // 🟠 Orange
  EPIC: [9, 9],       // 🟣 Violet
  RARE: [9, 9],       // 🔵 Bleu
  UNCOMMON: [8, 9],   // 🟢 Vert
  COMMON: [0, 8],     // ⚪ Blanc
};

export function rollAtkForRarity(rarity: Rarity, reviewScore?: number | null): number {
  if (hasMaxAtkReviewScore(reviewScore)) return 10;
  const [min, max] = ATK_BANDS[rarity];
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Rareté catalogue (SteamGame/Studio) : voir catalogRarity.ts. Un seuil fixe
// sur le reviewScore (essayé puis abandonné) explose dès que le catalogue est
// majoritairement composé de jeux bien notés (biais de sélection à l'import) —
// remplacé par un classement PAR PERCENTILE sur l'ensemble du catalogue.
