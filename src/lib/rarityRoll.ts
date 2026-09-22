export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

// Taux de loot fixes, indépendants du jeu/studio tiré (donnés par l'utilisateur) :
// 0,5% Orange (Légendaire), 5% Violet (Épique), 10% Bleu (Rare), 20% Vert (Magique),
// le reste en Blanc (Commun). Un exemplaire de carte est tiré une fois pour toutes
// avec cette table ; la rareté est ensuite figée (modifiable seulement par un admin).
const WEIGHTS: { rarity: Rarity; weight: number }[] = [
  { rarity: "LEGENDARY", weight: 0.5 }, // 🟠 Orange
  { rarity: "EPIC", weight: 5 },        // 🟣 Violet
  { rarity: "RARE", weight: 10 },       // 🔵 Bleu
  { rarity: "UNCOMMON", weight: 20 },   // 🟢 Vert
  { rarity: "COMMON", weight: 64.5 },   // ⚪ Blanc
];

export function rollCardRarity(): Rarity {
  const r = Math.random() * 100;
  let acc = 0;
  for (const w of WEIGHTS) {
    acc += w.weight;
    if (r < acc) return w.rarity;
  }
  return "COMMON";
}

// Plafond d'exemplaires en circulation PAR jeu/studio ET par palier, tous joueurs
// confondus (pas par joueur). Orange = unique sur toute la partie (1 seul
// exemplaire, quel que soit qui le possède). Blanc = illimité. Catégorie "gris"
// supprimée (jamais implémentée).
export const RARITY_CAP: Record<Rarity, number> = {
  LEGENDARY: 1,
  EPIC: 5,
  RARE: 10,
  UNCOMMON: 20,
  COMMON: Infinity,
};

// Ordre de repli quand le palier tiré est déjà plafonné pour CE jeu/studio précis :
// on redescend d'un cran (jamais on ne change de jeu/studio ni on ne remonte).
const DOWNGRADE: Record<Rarity, Rarity | null> = {
  LEGENDARY: "EPIC",
  EPIC: "RARE",
  RARE: "UNCOMMON",
  UNCOMMON: "COMMON",
  COMMON: null,
};

export function nextLowerRarity(r: Rarity): Rarity | null {
  return DOWNGRADE[r];
}

// ATK par exemplaire de carte, roulé dans la bande % de sa rareté (échelle ATK
// 0-100 existante, ex-review score). Logique de tirage de la rareté inchangée ;
// on associe simplement une bande d'ATK au palier déjà obtenu.
const ATK_BANDS: Record<Rarity, [number, number]> = {
  LEGENDARY: [98, 100], // 🟠 Orange
  EPIC: [96, 97],       // 🟣 Violet
  RARE: [91, 95],       // 🔵 Bleu
  UNCOMMON: [85, 90],   // 🟢 Vert
  COMMON: [0, 84],      // ⚪ Blanc
};

export function rollAtkForRarity(rarity: Rarity): number {
  const [min, max] = ATK_BANDS[rarity];
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Rareté catalogue (SteamGame/Studio) déterminée par le reviewScore du jeu (ou
// avgReviewScore du studio). Utilise les mêmes bandes que ATK_BANDS : un jeu à
// 98 %+ d'avis positifs est Légendaire, etc. Remplace l'ancien tirage aléatoire
// pour la rareté catalogue (la rareté d'exemplaire Card.rarity reste aléatoire).
export function rarityFromScore(score: number): Rarity {
  if (score >= 98) return "LEGENDARY";
  if (score >= 96) return "EPIC";
  if (score >= 91) return "RARE";
  if (score >= 85) return "UNCOMMON";
  return "COMMON";
}
