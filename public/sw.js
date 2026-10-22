// Service Worker entry point for Lembrete Inteligente
// Imports background push and alarm handlers

try {
  importScripts('/sw-push.js');
} catch (e) {
  console.warn('Failed to import sw-push.js:', e);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
