import { prisma } from "@/lib/prisma";
import { normalizeCoherenceName } from "@/lib/catalogCoherenceCore";
import { cardDefense } from "@/lib/cardDefense";
import { atkFromReviewScore } from "@/lib/cardAttack";

export type StudioDuplicateGroup = {
  key: string;
  studios: { id: string; name: string; gameCount: number; games: string[] }[];
};

// Regroupe les studios dont le nom normalisé (accents/casse/espaces ignorés)
// est identique — ce sont potentiellement le même studio réel mais Studio.name
// est une contrainte unique exacte, donc chaque variante a sa propre fiche.
export async function findDuplicateStudioGroups(): Promise<StudioDuplicateGroup[]> {
  const studios = await prisma.studio.findMany({ select: { id: true, name: true, gameCount: true, games: true }, orderBy: { name: "asc" } });
  const byNorm = new Map<string, typeof studios>();
  for (const s of studios) {
    const k = normalizeCoherenceName(s.name);
    const arr = byNorm.get(k);
    if (arr) arr.push(s); else byNorm.set(k, [s]);
  }
  return Array.from(byNorm.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([key, arr]) => ({ key, studios: arr }));
}

// Fusionne des studios doublons dans une fiche de référence : réassigne les
// jeux (developers[]), les cartes possédées (Card.studioId), les enchères
// (Auction.studioId) et les suivis (CardWatch.studioId), recalcule les stats
// de la fiche gardée, puis supprime les autres. Rien n'est perdu côté joueurs
// (aucune carte, enchère ou suivi n'est effacé).
//
// Pas de grosse transaction interactive unique ici (elle tenait la connexion
// ouverte trop longtemps sur un groupe volumineux et pouvait dépasser le
// timeout du reverse-proxy → réponse HTML au lieu de JSON côté client).
// Étapes séquentielles normales à la place, chacune rapide.
export async function mergeStudios(keepId: string, mergeIds: string[]) {
  const ids = Array.from(new Set(mergeIds.filter((id) => id !== keepId)));
  if (ids.length === 0) return { merged: 0 };

  const keep = await prisma.studio.findUnique({ where: { id: keepId }, select: { id: true, name: true } });
  if (!keep) throw new Error("Fiche de référence introuvable.");
  const merged = await prisma.studio.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  if (merged.length === 0) return { merged: 0 };
  const mergedNames = new Set(merged.map((s) => s.name));

  // 1. Jeux : remplace les noms doublons par le nom de référence dans developers[].
  const affectedGames = await prisma.steamGame.findMany({
    where: { developers: { hasSome: Array.from(mergedNames) } },
    select: { id: true, developers: true },
  });
  const gameUpdates = affectedGames.map((game) => {
    const next = [...new Set(game.developers.map((d) => (mergedNames.has(d) ? keep.name : d)))];
    return prisma.steamGame.update({ where: { id: game.id }, data: { developers: next } });
  });
  for (let i = 0; i < gameUpdates.length; i += 200) await prisma.$transaction(gameUpdates.slice(i, i + 200));

  // 2. Cartes possédées : FK sans onDelete → doit être réassignée avant suppression.
  await prisma.card.updateMany({ where: { studioId: { in: ids } }, data: { studioId: keepId } });

  // 3. Enchères en cours : onDelete SetNull sinon → perte du studio affiché.
  await prisma.auction.updateMany({ where: { studioId: { in: ids } }, data: { studioId: keepId } });

  // 4. Suivis (CardWatch) : contrainte unique (userId, studioId) — un joueur
  //    peut déjà suivre la fiche de référence ET un doublon. On réassigne
  //    quand c'est possible, sinon on supprime le doublon (déjà suivi).
  const watches = await prisma.cardWatch.findMany({ where: { studioId: { in: ids } }, select: { id: true, userId: true } });
  const existingKeepWatchers = new Set(
    (await prisma.cardWatch.findMany({ where: { studioId: keepId }, select: { userId: true } })).map((w) => w.userId)
  );
  const watchDeletes: string[] = [];
  const watchUpdates: string[] = [];
  for (const watch of watches) {
    if (existingKeepWatchers.has(watch.userId)) watchDeletes.push(watch.id);
    else { watchUpdates.push(watch.id); existingKeepWatchers.add(watch.userId); }
  }
  if (watchDeletes.length) await prisma.cardWatch.deleteMany({ where: { id: { in: watchDeletes } } });
  if (watchUpdates.length) await prisma.cardWatch.updateMany({ where: { id: { in: watchUpdates } }, data: { studioId: keepId } });

  // 5. Recalcule les stats de la fiche gardée à partir des jeux qui la référencent désormais.
  const games = await prisma.steamGame.findMany({
    where: { contentType: "GAME", developers: { has: keep.name } },
    select: { name: true, reviewScore: true, ownerEstimate: true },
  });
  const gameCount = games.length;
  const avgReviewScore = gameCount ? Math.round(games.reduce((s, g) => s + g.reviewScore, 0) / gameCount) : 0;
  const totalOwnerEstimate = games.reduce((s, g) => s + g.ownerEstimate, 0);
  await prisma.studio.update({
    where: { id: keepId },
    data: {
      games: [...new Set(games.map((g) => g.name))].sort(),
      gameCount,
      avgReviewScore,
      atk: atkFromReviewScore(avgReviewScore),
      def: cardDefense(totalOwnerEstimate),
      totalOwnerEstimate,
    },
  });

  // 6. Supprime les fiches doublons (plus aucune référence : cartes/enchères/
  //    suivis réassignés, jeux repointés vers le nom de référence).
  await prisma.studio.deleteMany({ where: { id: { in: ids } } });

  return { merged: ids.length };
}
