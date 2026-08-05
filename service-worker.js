// ------------------------------------------------------------
// Bunmahon CGU PWA Service Worker (patched for alerts + freshness)
// ------------------------------------------------------------

const CACHE_NAME = "cgu-map-cache-v11";

// Only cache the app shell — NOT dynamic data
const APP_SHELL = [
 "/cgu-map-pwa/",
  "/cgu-map-pwa/index.html",
  "/cgu-map-pwa/manifest.json",
  "/cgu-map-pwa/favicon.png",
  "/cgu-map-pwa/js/map.js",
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
  const reqUrl = new URL(event.request.url);

  // 🚫 Do NOT intercept cross-origin requests
  if (reqUrl.origin !== self.location.origin) {
    return; // Let the browser handle it normally
  }

  // ❌ NEVER cache alerts.json — always fetch fresh
  if (reqUrl.href.includes("alerts.json")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ❌ NEVER cache uMap layers (they update frequently)
  if (reqUrl.href.includes("umap") || reqUrl.href.includes("tiles") || reqUrl.href.includes("geojson")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // App shell → cache-first
  if (APP_SHELL.some(path => reqUrl.href.includes(path))) {
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



