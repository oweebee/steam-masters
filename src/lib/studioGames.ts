import { prisma } from "@/lib/prisma";

export type StudioGameLink = {
  name: string;
  appid: string | null;
  hasCard: boolean;
  headerImage: string | null;
};

// Résout un lot de noms de jeux (Studio.games: String[], noms réels SteamGame.name)
// vers leur appid + si la carte Jeu existe dans le catalogue, en UNE requête pour
// tous les studios appelants (pas de N+1). Une SteamGame est la fiche catalogue ;
// les Card sont uniquement les exemplaires possédés par les joueurs.
export async function buildGameLinkMap(
  allNames: string[]
): Promise<Map<string, { appid: string; hasCard: boolean; headerImage: string }>> {
  const unique = Array.from(new Set(allNames));
  if (unique.length === 0) return new Map();
  const games = await prisma.steamGame.findMany({
    where: { name: { in: unique }, contentType: "GAME" },
  });
  return new Map(games.map((g) => [g.name, {
    appid: g.id,
    hasCard: true,
    headerImage: g.headerImage,
  }]));
}

export function toStudioGameLinks(
  gameNames: string[],
  map: Map<string, { appid: string; hasCard: boolean; headerImage: string }>
): StudioGameLink[] {
  return gameNames.map((name) => {
    const hit = map.get(name);
    return {
      name,
      appid: hit?.appid ?? null,
      hasCard: hit?.hasCard ?? false,
      headerImage: hit?.headerImage ?? null,
    };
  });
}

// Source de vérité robuste pour les studios historiques dont Studio.games peut
// être vide : reconstruit directement la relation depuis SteamGame.developers,
// champ officiel Steam déjà stocké en base. Une seule requête pour tout le lot.
export async function buildStudioGamesByDeveloper(
  studioNames: string[]
): Promise<Map<string, StudioGameLink[]>> {
  const uniqueNames = Array.from(new Set(studioNames.filter(Boolean)));
  const out = new Map(uniqueNames.map((name) => [name, [] as StudioGameLink[]]));
  if (uniqueNames.length === 0) return out;

  const games = await prisma.steamGame.findMany({
    where: { developers: { hasSome: uniqueNames }, contentType: "GAME" },
    orderBy: { name: "asc" },
  });

  for (const game of games) {
    for (const developer of game.developers) {
      const studioGames = out.get(developer);
      if (!studioGames) continue;
      studioGames.push({
        name: game.name,
        appid: game.id,
        hasCard: true,
        headerImage: game.headerImage,
      });
    }
  }

  return out;
}
