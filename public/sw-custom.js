// Service Worker Companion for Background Notifications & Actions
// Handles notification click, action buttons (Concluir, Adiar), and window focus.

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

self.addEventListener('notificationclose', (event) => {
  // Notification dismissed by user
});
