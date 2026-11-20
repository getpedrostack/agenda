/* Service worker — app shell offline, amigável a updates. Só ativa em http(s).
   A origem é compartilhada com os outros apps (Brew, Triângulo, Diário, PWR): este SW
   só mexe nos caches com o prefixo 'agenda-shell-'. */
const PREFIXO = 'agenda-shell-';
const CACHE = PREFIXO + 'v3';
const ESPERA_REDE = 3000; // documento: depois disso, serve o cache se houver
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
  // cache:'reload' para não instalar uma cópia velha vinda do cache HTTP
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIXO) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Busca na rede e, se `guardavel(resp)`, grava uma cópia no cache.
// `fim` resolve quando a gravação termina (para e.waitUntil) e nunca rejeita.
function buscar(req, chave, guardavel) {
  let gravando = Promise.resolve();
  const resp = fetch(req).then(r => {
    if (guardavel(r)) {
      const copia = r.clone();
      gravando = caches.open(CACHE).then(c => c.put(chave, copia)).catch(() => {});
    }
    return r;
  });
  const fim = resp.then(() => gravando, () => {});
  return { resp, fim };
}

function doCache(req) {
  return caches.open(CACHE).then(c => c.match(req));
}

// Documento: rede primeiro, com prazo. Rede lenta, falha ou resposta de erro (ex.: 404 durante
// um deploy do Pages) → cópia em cache. Sem cópia em cache → a resposta da rede, seja qual for.
async function documento(req, rede) {
  const prazo = new Promise(r => setTimeout(r, ESPERA_REDE, null));
  const r = await Promise.race([rede.catch(() => null), prazo]);
  if (r && r.ok) return r.redirected ? Response.redirect(r.url, 302) : r;
  const hit = (await doCache(req)) || (await doCache('./index.html'));
  if (hit) return hit;
  if (r) return r;
  return rede.catch(() => Response.error());
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesmaOrigem = url.origin === location.origin;
  if (!mesmaOrigem && !FONTES.includes(url.hostname)) return;
  const isDoc = mesmaOrigem && (req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('.html'));

  if (isDoc) {
    // cache:'no-cache' revalida com o servidor: um publish novo não fica preso no cache HTTP.
    // (Um Request de navegação não aceita init; por isso a URL.)
    const { resp, fim } = buscar(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }), req,
      r => r.status === 200 && !r.redirected);
    e.waitUntil(fim);
    e.respondWith(documento(req, resp));
    return;
  }

  // demais GET (mesma origem + Google Fonts): stale-while-revalidate.
  // Mesma origem só com 200; fontes cross-origin podem vir opacas (status 0).
  const { resp, fim } = buscar(req, req, r => r.status === 200 || (!mesmaOrigem && r.type === 'opaque'));
  e.waitUntil(fim);
  e.respondWith(doCache(req).then(hit => hit || resp.catch(() => Response.error())));
});
