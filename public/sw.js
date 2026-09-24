const CACHE = "steammasters-v2";
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
