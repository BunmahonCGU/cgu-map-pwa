// ------------------------------------------------------------
// Bunmahon CGU PWA Service Worker (patched for alerts + freshness)
// ------------------------------------------------------------

const CACHE_NAME = "cgu-map-cache-v5";

// Only cache the app shell — NOT dynamic data
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.png",
  "/js/map.js",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js"
];

// ------------------------------------------------------------
// Install — cache app shell
// ------------------------------------------------------------
self.addEventListener("install", event => {
  self.skipWaiting(); // activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

// ------------------------------------------------------------
// Activate — clean old caches
// ------------------------------------------------------------
self.addEventListener("activate", event => {
  clients.claim(); // take control immediately
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

// ------------------------------------------------------------
// Fetch — network-first for dynamic data, cache-first for app shell
// ------------------------------------------------------------
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // ❌ NEVER cache alerts.json — always fetch fresh
  if (url.includes("alerts.json")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ❌ NEVER cache uMap layers (they update frequently)
  if (url.includes("umap") || url.includes("tiles") || url.includes("geojson")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell → cache-first
  if (APP_SHELL.some(path => url.endsWith(path))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return (
          cached ||
          fetch(event.request).then(response => {
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, response.clone());
              return response;
            });
          })
        );
      })
    );
    return;
  }

  // Everything else → network-first
  event.respondWith(
    fetch(event.request)
      .then(response => response)
      .catch(() => caches.match(event.request))
  );
});
