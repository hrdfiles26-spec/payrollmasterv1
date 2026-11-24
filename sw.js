/* HRD Files service worker: lets the app OPEN without internet.
   - The page itself: network first (so updates arrive), and the saved copy is used when offline.
   - Fonts and the app's own small files: saved copy first, refreshed in the background.
   - Supabase / other websites are never touched here (the app handles its own data and offline saves). */
const CACHE = 'hrd-shell-11-24-offline';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // the page (index.html): try the network, fall back to the saved copy
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put('index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match('index.html').then(r => r || caches.match('./')).then(r =>
            r || new Response('<h2 style="font-family:sans-serif">Offline</h2><p style="font-family:sans-serif">Open the app once with internet first so it can be used offline.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
        )
    );
    return;
  }

  // fonts + this site's own files: saved copy first, refreshed in the background
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin || FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req, { ignoreSearch: sameOrigin }).then(hit => {
        const net = fetch(req)
          .then(res => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    );
  }
  // everything else (Supabase API, auth, storage): normal network, not handled here
});
