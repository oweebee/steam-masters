import type { Rarity, RarityWeights } from "./rarityRoll";
export const SHOP_RARITIES: Rarity[] = ["LEGENDARY", "EPIC", "RARE", "UNCOMMON", "COMMON"];

/** Largest-remainder rounding, with one legendary reserved in every rotation. */
export function shopRarityQuotas(weights: RarityWeights, size: number): Record<Rarity, number> {
  if (!Number.isInteger(size) || size < 1) throw new Error("Taille de rotation invalide.");
  const total = SHOP_RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
  if (!Number.isFinite(total) || total <= 0 || SHOP_RARITIES.some(r => !Number.isFinite(weights[r]) || weights[r] < 0)) throw new Error("Répartition de rareté invalide.");
  const ideals = Object.fromEntries(SHOP_RARITIES.map(r => [r, size * weights[r] / total])) as Record<Rarity, number>;
  const counts = Object.fromEntries(SHOP_RARITIES.map(r => [r, Math.floor(ideals[r])])) as Record<Rarity, number>;
  const remainders = [...SHOP_RARITIES].sort((a,b) => (ideals[b] - counts[b]) - (ideals[a] - counts[a]));
  let remaining = size - SHOP_RARITIES.reduce((sum,r) => sum + counts[r], 0);
  for (const rarity of remainders) { if (remaining-- <= 0) break; counts[rarity]++; }
  if (counts.LEGENDARY === 0) {
    const donor = SHOP_RARITIES.filter(r => counts[r] > 0).sort((a,b) => (counts[b] - ideals[b]) - (counts[a] - ideals[a]))[0];
    counts[donor]--; counts.LEGENDARY = 1;
  }
  return counts;
}

export function selectShopStock<T>(candidates: T[], quotas: Record<Rarity, number>, eligible: (candidate: T, rarity: Rarity) => boolean) {
  const used = new Set<number>();
  const stock: { candidate: T; rarity: Rarity }[] = [];
  const missingSlots: Rarity[] = [];
  for (const rarity of SHOP_RARITIES) {
    let needed = quotas[rarity];
    for (let i = 0; i < candidates.length && needed > 0; i++) {
      if (used.has(i) || !eligible(candidates[i], rarity)) continue;
      used.add(i); stock.push({ candidate: candidates[i], rarity }); needed--;
    }
    while (needed-- > 0) missingSlots.push(rarity);
  }
  // Un quota peut être impossible à cause de l'éligibilité du catalogue.
  // Remplir avec la rareté disponible la plus proche sans compter les cartes déjà tirées.
  for (const desired of missingSlots) {
    const pivot = SHOP_RARITIES.indexOf(desired);
    const fallbackOrder = [...SHOP_RARITIES.slice(pivot + 1), ...SHOP_RARITIES.slice(0, pivot).reverse()];
    let filled = false;
    for (const rarity of fallbackOrder) {
      const index = candidates.findIndex((candidate, candidateIndex) => !used.has(candidateIndex) && eligible(candidate, rarity));
      if (index < 0) continue;
      used.add(index); stock.push({ candidate: candidates[index], rarity }); filled = true; break;
    }
    if (!filled) throw new Error(`Catalogue insuffisant : ${stock.length} sujets distincts vendables sur ${SHOP_RARITIES.reduce((sum, rarity) => sum + quotas[rarity], 0)} requis.`);
  }
  return stock;
}
