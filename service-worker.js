self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.endsWith("bunmahon-latest.umap")) {
    e.respondWith(
      caches.open("umap-cache").then(cache =>
        fetch(e.request).then(res => {
          cache.put(e.request, res.clone());
          self.clients.matchAll().then(clients =>
            clients.forEach(c =>
              c.postMessage({ type: "umap-updated" })
            )
          );
          return res;
        }).catch(() => cache.match(e.request))
      )
    );
  }
});

const CACHE_NAME = "bunmahon-cgu-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (ASSETS.some(a => url.pathname.endsWith(a.replace("./", "")))) {
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
