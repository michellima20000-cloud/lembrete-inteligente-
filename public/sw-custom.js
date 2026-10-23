// Fallback helper for service worker imports
try {
  importScripts('/sw-push.js');
} catch (e) {
  console.warn('[SW-Custom] Falha ao importar /sw-push.js:', e);
}
