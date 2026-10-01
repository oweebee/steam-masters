export type NamedGame = { name: string };

export function studioLicenseKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");
}

export function groupStudioLicenses<T extends NamedGame>(games: T[]): { key: string; name: string; versions: T[] }[] {
  const grouped = new Map<string, { name: string; versions: T[] }>();
  for (const game of games) {
    const key = studioLicenseKey(game.name);
    const existing = grouped.get(key);
    if (existing) existing.versions.push(game);
    else grouped.set(key, { name: game.name, versions: [game] });
  }
  return Array.from(grouped, ([key, value]) => ({ key, ...value }));
}
