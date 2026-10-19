// 見開き本棚: lets the app start without a connection.
// The page itself is fetched fresh whenever online (so updates arrive right away)
// and the saved copy is used only when the network is unavailable.
const CACHE = 'mihiraki-app-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mihiraki-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Google sign-in and Drive always go straight to the network
  if (/googleapis\.com$|google\.com$|googleusercontent\.com$/.test(url.hostname) && !/^fonts\./.test(url.hostname)) return;

  // fonts: keep a copy, use it first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }).catch(() => caches.match(req)));
    return;
  }
  if (url.origin !== location.origin) return;

  // the app's own files: network first, saved copy when offline or very slow
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await timeout(fetch(req, {cache: 'no-cache'}), req.mode === 'navigate' ? 4000 : 8000);
      if (res.ok) c.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
      return res;
    } catch (err) {
      return (await c.match(req.mode === 'navigate' ? './index.html' : req, {ignoreSearch: true})) || (await c.match('./index.html')) || Response.error();
    }
  })());
});
