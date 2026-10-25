// Service Worker entry point for Lembrete Inteligente PWA
// Imports background push and alarm handlers and caches essential PWA assets

const CACHE_NAME = 'lembrete-inteligente-pwa-v9';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
];

// Import background push and custom alarm scheduler
try {
  importScripts('/sw-custom.js');
} catch (e) {
  console.warn('[SW] Falha ao importar /sw-custom.js:', e);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Aviso ao pré-carregar cache:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[SW] Purgando cache antigo:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Network-first with cache fallback for offline resilience
self.addEventListener('fetch', (event) => {
  // Never intercept non-GET requests (e.g. POST /api/push/subscribe)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // STRICT PASSTHROUGH: Never intercept or cache any API routes, Vite HMR, or external requests
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/api/') ||
    event.request.url.includes('/api/') ||
    url.pathname.includes('@vite') ||
    url.pathname.includes('token=') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache ONLY if offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Only fallback to index.html for page navigation
          if (event.request.mode === 'navigate' && event.request.destination === 'document') {
            return caches.match('/index.html') || caches.match('/');
          }
          return new Response(null, { status: 404, statusText: 'Offline Not Found' });
        });
      })
  );
});
