// ------------------------------------------------------------
// Bunmahon CGU PWA Service Worker (patched for alerts + freshness)
// ------------------------------------------------------------

const CACHE_NAME = "cgu-map-cache-v44";

// Big files that rarely change (check cards PDF and PDF.js, ~3.4 MB) live in
// their own cache, which version bumps above leave alone, so phones don't
// download them again on every update. Bump this ONLY when one of them
// changes (e.g. a new check cards PDF): "cgu-map-static-v2", and so on.
const STATIC_CACHE = "cgu-map-static-v1";

// Where the app is served from: "/cgu-map-pwa/" on GitHub Pages, "/" on a
// separate host such as the V2 test site.
const BASE = new URL("./", self.location).pathname;

// Only cache the app shell — NOT dynamic data
const APP_SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "manifest.json",
  BASE + "favicon.png",
  BASE + "js/map.js",
  BASE + "js/replay.js",
  BASE + "js/devices.js",
  BASE + "js/handover.js",
  BASE + "js/checkcards.js",
  BASE + "js/vendor/qrcode.js",
  BASE + "js/vendor/jsqr.min.js",
  "https://unpkg.com/leaflet/dist/leaflet.css",
  "https://unpkg.com/leaflet/dist/leaflet.js"
];

// Kept in STATIC_CACHE. Optional: if one fails to download, the update
// still installs, and the file is fetched when the cards are opened.
const STATIC_FILES = [
  BASE + "js/vendor/pdf.min.js",
  BASE + "js/vendor/pdf.worker.min.js",
  BASE + "cards/ircg-treatment-check-cards.pdf"
];

// ------------------------------------------------------------
// Install — cache app shell
// ------------------------------------------------------------
self.addEventListener("install", event => {
  self.skipWaiting(); // activate immediately
  event.waitUntil(
    // "reload" skips the browser's HTTP cache, so a new version never
    // caches the previous version's files.
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: "reload" })))),
      cacheStaticFiles()
    ])
  );
});

// Downloads only the static files this phone doesn't have yet. Never fails
// the install: a missing file must not hold back an app update.
function cacheStaticFiles() {
  return caches.open(STATIC_CACHE).then(cache =>
    Promise.all(STATIC_FILES.map(url =>
      cache.match(url).then(have => have || fetch(new Request(url, { cache: "reload" })).then(res => {
        if (res.ok) return cache.put(url, res);
      })).catch(() => {})
    ))
  );
}

// Static files are matched on their path alone (no ?v= query).
function isStaticFile(url) {
  return STATIC_FILES.includes(url.pathname);
}

// ------------------------------------------------------------
// Activate — clean old caches (but keep STATIC_CACHE)
// ------------------------------------------------------------
self.addEventListener("activate", event => {
  clients.claim(); // take control immediately
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
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

  // Only plain page/file loads are cached; posts always go to the network.
  if (event.request.method !== "GET") return;

  // The V2 test site is served by its own Worker, so its live API is
  // same-origin: never cache it.
  const API_PATHS = ["/alerts", "/location/", "/archive/", "/reverse-geocode", "/auth/", "/devices/", "/photos"];
  if (API_PATHS.some(p => reqUrl.pathname.startsWith(p))) return;

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

  // Check cards PDF / PDF.js → their own long-lived cache, cache-first
  if (isStaticFile(reqUrl)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(reqUrl.pathname).then(cached =>
          cached ||
          fetch(event.request).then(response => {
            if (response.ok && response.status === 200) cache.put(reqUrl.pathname, response.clone());
            return response;
          })
        )
      )
    );
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



