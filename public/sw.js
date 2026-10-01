const CACHE = "steammasters-v4";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Ne jamais toucher aux API (session/auth, données live) ni aux méthodes non-GET.
// Uniquement network-first + fallback cache pour les pages, cache-first pour les
// assets statiques (icônes, manifest). Objectif : installabilité + résilience
// réseau basique, pas un mode hors-ligne complet du jeu.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;
  // Ne jamais afficher une ancienne page d'accueil/connexion aux utilisateurs
  // dont la session est encore valide.
  if (req.mode === "navigate" && ["/", "/login", "/signup"].includes(url.pathname)) return;

  if (PRECACHE_URLS.some((p) => url.pathname === p)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch {}
  const title = payload.title || "Steam Masters";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "Tu as une nouvelle alerte.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `${payload.type || "notification"}:${title}`,
    data: { link: payload.link || "/alertes" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.link || "/alertes", self.location.origin);
  const legacyOfferId = targetUrl.pathname === "/magasin" ? targetUrl.searchParams.get("offre") : null;
  if (legacyOfferId) {
    targetUrl.pathname = `/offre-magasin/${encodeURIComponent(legacyOfferId)}`;
    targetUrl.search = "";
  }
  const target = targetUrl.href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    const existing = clients[0];
    if (existing) {
      if ("navigate" in existing) await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});
