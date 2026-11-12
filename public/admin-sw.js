/* PrepPath Admin service worker. Makes the admin installable and keeps the app shell available offline.
   It never caches /api (admin data is private and must always be live). */
const CACHE = 'admin-shell-v1';
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07080d;color:#efebe2;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><h1 style="font-size:22px">You are offline</h1><p style="color:#9b978d">Reconnect to the internet to manage your store.</p><button onclick="location.reload()" style="margin-top:12px;padding:12px 22px;border:0;border-radius:999px;background:#d4af6a;color:#1a1408;font-weight:700">Try again</button></div>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;
  if (req.mode === 'navigate') { // network first, last good page when offline
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/admin/', copy)); return res; })
      .catch(() => caches.match('/admin/').then((r) => r || new Response(OFFLINE, { headers: { 'content-type': 'text/html' } }))));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/admin-icons/')) { // hashed build files: cache first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })));
  }
});
