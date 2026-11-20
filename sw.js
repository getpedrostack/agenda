/* Service worker — app shell offline, amigável a updates. Só ativa em http(s). */
const CACHE = 'agenda-shell-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-any-192.png',
  './icon-any-512.png',
  './apple-touch-icon.png',
  './icon-32.png'
];
const FONTES = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmaOrigem = url.origin === location.origin;
  if (!mesmaOrigem && !FONTES.includes(url.hostname)) return;
  const isDoc = mesmaOrigem && (req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('.html'));

  if (isDoc) {
    // network-first: versão mais nova quando online; cache como fallback offline
    e.respondWith(
      fetch(req).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return resp;
      }).catch(() => caches.match(req).then(h => h || caches.match('./index.html')))
    );
    return;
  }

  // demais GET (mesma origem + Google Fonts): stale-while-revalidate
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(resp => {
        // mesma origem só com 200; fontes cross-origin podem vir opacas (status 0)
        if (resp.ok || (!mesmaOrigem && resp.type === 'opaque')) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return resp;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
