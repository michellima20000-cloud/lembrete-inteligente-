// Service Worker Push & Background Alarm Handler
// Delega e unifica lógica avançada no sw-custom.js com persistência IndexedDB e NotificationTriggers
try {
  importScripts('/sw-custom.js');
} catch (e) {
  console.warn('[SW-Push] Falha ao importar /sw-custom.js:', e);
}
