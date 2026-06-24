const CACHE_API = "ls-soffass-api-v4";
const CACHE_ASSETS = "ls-soffass-assets-v4";

const PRECACHE_ASSETS = [
  "/css/style.css",
  "/js/app.js",
  "/js/auth.js",
  "/js/dashboard.js",
  "/js/ingresso.js",
  "/js/giacenze.js",
  "/js/movimenti.js",
  "/js/export.js",
  "/manifest.json",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then((c) => c.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_ASSETS && n !== CACHE_API)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(networkFirst(request));
  } else if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_ASSETS);
      cache.put(request, res.clone());
    }
    return res;
  } catch (e) {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE_API);
      cache.put(request, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: "Offline" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
