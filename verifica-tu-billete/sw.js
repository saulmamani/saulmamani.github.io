// ─────────────────────────────────────────────
// sw.js — Verifica tu Billete
// Estrategia: Network First
// Cambia CACHE_VERSION con cada deploy para
// forzar la limpieza del caché anterior.
// ─────────────────────────────────────────────

const CACHE_VERSION = 'v0.67'; // incrementa esto en cada deploy
const CACHE_NAME    = 'verifica-bs-' + CACHE_VERSION;

// Archivos a pre-cachear
const PRECACHE_ASSETS = [
  './',
  './index.html'
];

// ── Install: pre-cachea assets esenciales ──
self.addEventListener('install', event => {
  // skipWaiting fuerza que este SW tome control inmediatamente
  // sin esperar a que se cierren las pestañas anteriores
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Si falla el pre-cache (ej. sin red), continúa igual
      });
    })
  );
});

// ── Activate: elimina cachés viejos ──
self.addEventListener('activate', event => {
  // clients.claim() hace que el SW controle las pestañas
  // abiertas inmediatamente, sin necesidad de recargar
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith('verifica-bs-') && key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Eliminando caché viejo:', key);
              return caches.delete(key);
            })
        )
      )
    ])
  );
});

// ── Fetch: Network First ──
// Intenta siempre la red primero.
// Solo usa caché si la red falla (sin conexión).
self.addEventListener('fetch', event => {
  // Solo intercepta peticiones GET
  if (event.request.method !== 'GET') return;

  // No intercepta peticiones a otros dominios (CDN, fuentes, etc.)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Respuesta exitosa del servidor: actualiza el caché
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // Sin red: sirve desde caché si existe
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback final: página principal
          return caches.match('./index.html');
        });
      })
  );
});