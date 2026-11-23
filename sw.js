// Service worker: network-first so new code arrives as soon as the app is opened online,
// with a cached copy so the app still works offline.
const CACHE = 'checkmate-arena-v5';
const FILES = ['./', 'index.html', 'css/style.css', 'js/chess.js', 'js/ai.js', 'js/coach.js', 'js/sound.js', 'js/league.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(req, { cache: 'no-cache', signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }
  })());
});
