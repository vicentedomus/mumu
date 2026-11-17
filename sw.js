const CACHE_NAME = 'mumu-v10';
const ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/ui.js',
  '/js/router.js',
  '/js/auth.js',
  '/js/supabase-client.js',
  '/js/locations.js',
  '/js/pages/inventory.js',
  '/js/pages/dashboard.js',
  '/js/pages/sales.js',
  '/js/pages/orders.js',
  '/js/pages/reports.js',
  '/js/pages/locations.js',
  '/assets/logo.svg',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // No interceptar llamadas a Supabase ni nada que no sea GET: el navegador las
  // manda directo. Re-enviarlas con fetch(e.request) hace que Safari iOS pierda
  // el body de los uploads multipart (llegaban a Storage con Content-Length: 0).
  if (e.request.method !== 'GET' || e.request.url.includes('supabase.co')) {
    return;
  }
  // Network first, fallback to cache
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
