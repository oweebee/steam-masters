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
