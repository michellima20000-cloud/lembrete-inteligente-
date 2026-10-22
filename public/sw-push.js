// Service Worker Push & Background Alarm Handler
// Ensures alarms trigger even when screen is locked or browser is in background

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle Background Web Push Notifications sent by Server Scheduler
self.addEventListener('push', (event) => {
  let data = {
    title: '⏰ Alarme do Lembrete',
    body: 'Horário do seu compromisso!',
    tag: 'alarm_' + Date.now(),
    reminderId: '',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || data.reminderId || 'alarm',
    renotify: true,
    requireInteraction: true, // Keep notification visible on screen/lockscreen until dismissed
    vibrate: [600, 200, 600, 200, 600, 200, 800],
    data: {
      url: data.url || (data.reminderId ? `/?alarm_reminder_id=${data.reminderId}` : '/'),
      reminderId: data.reminderId,
    },
    actions: [
      { action: 'open', title: 'Ver Lembrete' },
      { action: 'snooze', title: 'Adiar 10m' },
    ],
  };

  event.waitUntil(
    (async () => {
      // 1. Show persistent system push notification on device
      await self.registration.showNotification(data.title, notificationOptions);

      // 2. Broadcast alarm trigger to all connected browser windows/tabs
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({
          type: 'TRIGGER_ALARM',
          reminderId: data.reminderId,
        });
      }
    })()
  );
});

// Handle Notification Clicks (when user taps notification on device or lock screen)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const reminderId = event.notification.data?.reminderId;
  const targetUrl = event.notification.data?.url || (reminderId ? `/?alarm_reminder_id=${reminderId}` : '/');

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Focus existing window if open
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'TRIGGER_ALARM',
            reminderId: reminderId,
          });
          return;
        }
      }

      // Open new window pointing to the alarm
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
