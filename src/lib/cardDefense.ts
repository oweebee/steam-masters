// Compression logarithmique fixe : 1 possesseur estimé => 50 DEF,
// 100 millions ou plus => 250 DEF. La donnée SteamSpy brute reste conservée
// séparément dans ownerEstimate / totalOwnerEstimate.
export function cardDefense(owners: number): number {
  if (!Number.isFinite(owners) || owners <= 0) return 50;
  return Math.max(50, Math.min(250, Math.round(50 + 25 * Math.log10(owners))));
}
