export const SIDEBAR_HREFS = [
  "/dashboard", "/informations", "/collection", "/toutes-les-cartes", "/echanges", "/marche",
  "/magasin", "/profil", "/joueurs", "/classement", "/recompenses", "/messages", "/ajouter-jeu", "/bataille",
  "/parametres", "/alertes", "/bug-report", "/aide", "/admin/games",
] as const;

export function sanitizeSidebarOrder(value: unknown) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(SIDEBAR_HREFS);
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowed.has(item)))];
}
