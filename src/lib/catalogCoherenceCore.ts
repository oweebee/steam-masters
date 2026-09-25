// Pure local analysis: deliberately no database, Steam, Redis or network imports.
export type Relation = "GAME_STUDIO" | "STUDIO_GAME" | "DLC_PARENT" | "DLC_STUDIO" | "GAME_DLC";
export type LocalGame = { id: string; name: string; contentType: "GAME" | "DLC"; developers: string[]; parentGameId: string | null; dlcAppIds: string[]; reviewScore: number; ownerEstimate: number };
export type LocalStudio = { id: string; name: string; games: string[] };
export type Snapshot = { games: LocalGame[]; studios: LocalStudio[] };
export type CoherenceIssue = {
  key: string; linkKey: string; relation: Relation;
  method: "STEAM" | "LOCAL_STUDIO" | "LOCAL_LINK" | "BLOCKED";
  sourceType: "GAME" | "DLC" | "STUDIO"; sourceId: string; sourceName: string;
  targetType: "GAME" | "DLC" | "STUDIO"; targetId?: string; targetName: string;
  appId?: string; reason: string;
  repair?: { gameId?: string; studioId?: string; developer?: string; gameName?: string; parentId?: string; dlcId?: string };
};
export type Registry = {
  ignored: Record<string, { issue: CoherenceIssue; ignoredAt: string }>;
  failures: Record<string, { issue: CoherenceIssue; reason: string; failedAt: string }>;
};
// Preserve accents and punctuation: similar titles are not proof of identity.
export const normalizeCoherenceName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
export const studioLinkKey = (gameId: string, studioName: string) => `studio:${gameId}:${encodeURIComponent(normalizeCoherenceName(studioName))}`;
export const dlcLinkKey = (parentId: string, dlcId: string) => `dlc:${parentId}:${dlcId}`;
export const studioTitleKey = (studioId: string, title: string) => `studio-title:${studioId}:${encodeURIComponent(normalizeCoherenceName(title))}`;
export function isIgnored(issue: CoherenceIssue, registry: Registry) {
  return !!registry.ignored[issue.linkKey] || !!registry.ignored[issue.key] || (issue.sourceType === "STUDIO" && !!registry.ignored[studioTitleKey(issue.sourceId, issue.targetName)]);
}
export function studioGameIsIgnored(studio: LocalStudio, game: { id: string; name: string }, registry: Registry) {
  return !!registry.ignored[studioLinkKey(game.id, studio.name)] || !!registry.ignored[studioTitleKey(studio.id, game.name)];
}
export function analyzeCoherence({ games, studios }: Snapshot): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];
  const byId = new Map(games.map((game) => [game.id, game]));
  const mains = games.filter((game) => game.contentType === "GAME");
  const matches = <T extends { name: string }>(rows: T[], name: string) => rows.filter((row) => normalizeCoherenceName(row.name) === normalizeCoherenceName(name));
  const contains = (names: string[], name: string) => names.some((entry) => normalizeCoherenceName(entry) === normalizeCoherenceName(name));
  const add = (issue: Omit<CoherenceIssue, "key">) => issues.push({ ...issue, key: `${issue.relation}:${issue.linkKey}` });
  for (const game of games) {
    const relation: Relation = game.contentType === "GAME" ? "GAME_STUDIO" : "DLC_STUDIO";
    const parent = game.parentGameId ? byId.get(game.parentGameId) : undefined;
    const inherited = game.contentType === "DLC" && parent?.contentType === "GAME" ? parent.developers : [];
    const developers = [...new Set([...game.developers, ...inherited].map((name) => name.trim()).filter(Boolean))];
    if (!developers.length) add({ relation, method: "STEAM", sourceType: game.contentType, sourceId: game.id, sourceName: game.name, targetType: "STUDIO", targetName: "Studio non renseigné", linkKey: `unknown-studio:${game.id}`, appId: game.id, reason: "Aucun développeur renseigné dans les données locales." });
    for (const name of developers) {
      const found = matches(studios, name);
      const base = { relation, sourceType: game.contentType, sourceId: game.id, sourceName: game.name, targetType: "STUDIO" as const, targetName: name, linkKey: studioLinkKey(game.id, name) };
      if (found.length > 1) { add({ ...base, method: "BLOCKED", reason: "Plusieurs studios portent ce nom : rapprochement automatique impossible." }); continue; }
      if (!contains(game.developers, name)) {
        add({ ...base, method: "LOCAL_LINK", targetId: found[0]?.id, repair: { gameId: game.id, developer: name }, reason: "Le développeur du jeu parent manque sur la fiche DLC." });
      } else if (!found.length) {
        const canBuild = mains.some((entry) => contains(entry.developers, name));
        add({ ...base, method: canBuild ? "LOCAL_STUDIO" : "BLOCKED", repair: { developer: name }, reason: canBuild ? "Studio absent, créable depuis les jeux déjà en base." : "Studio absent et aucun jeu principal local ne permet de calculer sa fiche." });
      } else if (game.contentType === "GAME" && !contains(found[0].games, game.name)) {
        add({ ...base, method: "LOCAL_LINK", targetId: found[0].id, repair: { studioId: found[0].id, gameName: game.name }, reason: "Les deux fiches existent, mais le jeu manque dans la liste du studio." });
      }
    }
    if (game.contentType === "DLC" && parent?.contentType !== "GAME") {
      const candidates = mains.filter((entry) => entry.dlcAppIds.includes(game.id));
      const candidate = candidates.length === 1 ? candidates[0] : undefined;
      add({ relation: "DLC_PARENT", method: candidate ? "LOCAL_LINK" : candidates.length > 1 ? "BLOCKED" : "STEAM", sourceType: "DLC", sourceId: game.id, sourceName: game.name, targetType: "GAME", targetId: candidate?.id, targetName: candidate?.name ?? "Jeu parent à identifier", appId: game.id, linkKey: candidate ? dlcLinkKey(candidate.id, game.id) : `unknown-parent:${game.id}`, repair: candidate ? { gameId: game.id, parentId: candidate.id } : undefined, reason: candidate ? "Le jeu existant déclare ce DLC mais son lien parent manque." : candidates.length > 1 ? "Plusieurs jeux déclarent ce DLC : aucun parent choisi arbitrairement." : "Jeu parent absent ou non renseigné ; Steam devra confirmer son identité." });
    }
    if (game.contentType === "DLC" && parent?.contentType === "GAME" && !parent.dlcAppIds.includes(game.id)) add({ relation: "GAME_DLC", method: "LOCAL_LINK", sourceType: "GAME", sourceId: parent.id, sourceName: parent.name, targetType: "DLC", targetId: game.id, targetName: game.name, linkKey: dlcLinkKey(parent.id, game.id), repair: { gameId: parent.id, dlcId: game.id }, reason: "Le DLC existe et connaît son parent, mais manque dans la liste du jeu." });
  }
  for (const studio of studios) for (const name of new Set(studio.games.filter((name) => name.trim()))) {
    const found = matches(mains, name);
    if (found.length === 1 && contains(found[0].developers, studio.name)) continue;
    add({ relation: "STUDIO_GAME", method: found.length === 1 ? "LOCAL_LINK" : found.length > 1 ? "BLOCKED" : "STEAM", sourceType: "STUDIO", sourceId: studio.id, sourceName: studio.name, targetType: "GAME", targetId: found.length === 1 ? found[0].id : undefined, targetName: name, linkKey: found.length === 1 ? studioLinkKey(found[0].id, studio.name) : studioTitleKey(studio.id, name), repair: found.length === 1 ? { gameId: found[0].id, developer: studio.name } : undefined, reason: found.length === 1 ? "Le jeu existe, mais ne référence pas ce studio." : found.length > 1 ? "Plusieurs jeux portent ce nom : AppID à vérifier manuellement." : "Le studio référence un jeu absent du catalogue." });
  }
  for (const game of mains) for (const id of new Set(game.dlcAppIds)) {
    const dlc = byId.get(id);
    if (dlc?.contentType === "DLC" && dlc.parentGameId === game.id) continue;
    // A parentless DLC with one known parent is already listed above.
    if (dlc?.contentType === "DLC" && (!dlc.parentGameId || byId.get(dlc.parentGameId)?.contentType !== "GAME")) continue;
    add({ relation: "GAME_DLC", method: "STEAM", sourceType: "GAME", sourceId: game.id, sourceName: game.name, targetType: "DLC", targetId: id, targetName: dlc?.name ?? `DLC Steam #${id}`, appId: id, linkKey: dlcLinkKey(game.id, id), reason: !dlc ? "DLC déclaré absent du catalogue." : dlc.contentType !== "DLC" ? "Cette fiche existe mais n’est pas typée DLC." : "Le DLC est déjà associé à un autre jeu : vérification Steam nécessaire." });
  }
  return issues;
}
