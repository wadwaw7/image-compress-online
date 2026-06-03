/* ===== Service Worker — Offline Support ===== */
const CACHE_NAME = 'imgcompress-cyberpunk-v1';
const ASSETS = [
  './',
  './index.html',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/animations.css',
  './css/responsive.css',
  './js/store.js',
  './js/auth.js',
  './js/app.js',
  './js/engines/compress.js',
  './js/engines/watermark.js',
  './js/engines/bgchange.js',
  './js/ui/router.js',
  './js/ui/navbar.js',
  './js/ui/toast.js',
  './js/ui/fx.js',
  './js/pages/compress-page.js',
  './js/pages/watermark-page.js',
  './js/pages/bg-page.js',
  './manifest.json'
];

// Install: cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('SW: Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for app assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API calls: network first (don't cache)
  if (url.pathname.includes('/api/')) return;

  // Static assets: cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Don't cache non-success responses
        if (!response || response.status !== 200) return response;
        // Cache new assets for future offline use
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
