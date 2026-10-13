// Offline support: network-first (bypassing the HTTP cache), fall back to cache when offline.
// Bump CACHE and the ?v= strings in index.html + js/*.js imports together for every release.
const CACHE = 'fcgm-v5-fleet1';
const V = '?v=fleet1';
const ASSETS = ['./', 'index.html', 'css/style.css' + V, 'js/main.js' + V, 'js/parts.js' + V, 'js/physics.js' + V, 'js/flight.js' + V, 'js/world.js' + V, 'js/examples.js' + V, 'js/builder.js' + V, 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
