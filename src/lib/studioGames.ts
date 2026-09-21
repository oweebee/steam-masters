import { prisma } from "@/lib/prisma";

export type StudioGameLink = {
  name: string;
  appid: string | null;
  hasCard: boolean;
  headerImage: string | null;
};

// Résout un lot de noms de jeux (Studio.games: String[], noms réels SteamGame.name)
// vers leur appid + si une Card existe déjà dessus, en UNE requête pour tous les
// studios appelants (pas de N+1). appid=null / hasCard=false => jeu pas encore en
// base ou sans carte créée : affiché en texte simple, pas en lien, côté UI.
export async function buildGameLinkMap(
  allNames: string[]
): Promise<Map<string, { appid: string; hasCard: boolean; headerImage: string }>> {
  const unique = Array.from(new Set(allNames));
  if (unique.length === 0) return new Map();
  const games = await prisma.steamGame.findMany({
    where: { name: { in: unique } },
    include: { cards: { select: { id: true } } },
  });
  return new Map(games.map((g) => [g.name, {
    appid: g.id,
    hasCard: g.cards.length > 0,
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
    where: { developers: { hasSome: uniqueNames } },
    include: { cards: { select: { id: true } } },
    orderBy: { name: "asc" },
  });

  for (const game of games) {
    for (const developer of game.developers) {
      const studioGames = out.get(developer);
      if (!studioGames) continue;
      studioGames.push({
        name: game.name,
        appid: game.id,
        hasCard: game.cards.length > 0,
        headerImage: game.headerImage,
      });
    }
  }

  return out;
}
