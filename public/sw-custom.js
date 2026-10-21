// Service Worker Companion for Background Notifications & Actions
// Handles notification click, action buttons (Concluir, Adiar), vibration, and background wake.

self.addEventListener('install', (event) => {
  // Activate immediately without waiting for old clients to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all active clients so push notifications work right away
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const reminderId = event.notification.data ? event.notification.data.id : null;
  const action = event.action;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. If an existing window is open, focus it and post action message
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
        }
        client.postMessage({
          type: 'NOTIFICATION_ACTION',
          action: action || 'focus',
          reminderId: reminderId,
        });
        return;
      }

      // 2. If no window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('notificationclose', () => {
  // Notification dismissed by user
});

