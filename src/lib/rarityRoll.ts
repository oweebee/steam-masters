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
