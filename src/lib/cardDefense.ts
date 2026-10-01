// Compression logarithmique fixe : 1 possesseur estimé => 5 DEF,
// 100 millions ou plus => 25 DEF. La donnée SteamSpy brute reste conservée
// séparément dans ownerEstimate / totalOwnerEstimate.
export function cardDefense(owners: number): number {
  if (!Number.isFinite(owners) || owners <= 0) return 5;
  return Math.max(5, Math.min(25, Math.floor((50 + 25 * Math.log10(owners)) / 10)));
}

// Variante IGDB : pas d'ownerEstimate Steam/SteamSpy disponible. Proxy de
// popularité = follows + hypes (échelle bien plus petite que les possesseurs
// Steam, typiquement 0..quelques dizaines de milliers). Même esprit de
// compression logarithmique 5..25, calibré sur cette échelle réduite.
// LIMITE CONNUE : la rareté catalogue (catalogRarity.ts) classe TOUT le
// catalogue par percentile d'ownerEstimate confondu Steam+IGDB ; les valeurs
// IGDB étant structurellement plus faibles, les jeux IGDB tendront vers les
// raretés basses (COMMON/UNCOMMON) sauf ajustement futur des seuils admin.
export function igdbDefense(popularity: number): number {
  if (!Number.isFinite(popularity) || popularity <= 0) return 5;
  const scaled = Math.log10(popularity + 1) / Math.log10(50_000); // 0..~1 pour 0..50k
  return Math.max(5, Math.min(25, Math.round(5 + 20 * Math.min(1, scaled))));
}
