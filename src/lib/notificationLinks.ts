export function notificationLink(link: string) {
  try {
    const url = new URL(link, "https://steammasters.local");
    const legacyOfferId = url.pathname === "/magasin" ? url.searchParams.get("offre") : null;
    return legacyOfferId ? `/offre-magasin/${encodeURIComponent(legacyOfferId)}` : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/alertes";
  }
}
