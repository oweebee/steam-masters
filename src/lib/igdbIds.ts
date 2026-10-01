// Ids catalogue IGDB : une carte par (jeu, plateforme).
// - historique : `igdb-<jeu>` (carte mono-plateforme existante, conservée)
// - nouveau    : `igdb-<jeu>-p<plateforme>`
export function igdbNumericId(id: string): number {
  return Number(id.replace(/^igdb-/, "").replace(/-p\d+$/, ""));
}

export function igdbPlatformCardId(gameId: number, platformId: number): string {
  return `igdb-${gameId}-p${platformId}`;
}

// PC (Microsoft Windows) : Steam gère tout ce qui sort à partir de 2005 (arrivée
// des éditeurs tiers sur Steam fin 2005). IGDB n'importe que les jeux PC dont une
// sortie PC est datée avant le 1er janvier 2005 ; sans date PC connue -> refusé.
export const IGDB_PC_PLATFORM_ID = 6;
export const PC_MAX_RELEASE_TS = Date.UTC(2005, 0, 1) / 1000; // 2004 inclus
export function pcReleaseAllowed(releaseDates: { platform: number; date: number }[]): boolean {
  return releaseDates.some((r) => r.platform === IGDB_PC_PLATFORM_ID && r.date > 0 && r.date < PC_MAX_RELEASE_TS);
}
export function isPcPlatformLabel(label: string): boolean {
  return /^pc$|windows/i.test(label);
}
