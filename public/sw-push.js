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
    silent: false, // Trigger native sound channel
    vibrate: [600, 200, 600, 200, 600, 200, 800], // Aggressive vibration pattern
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

  // Handle direct Snooze action from lock screen / notification drawer
  if (event.action === 'snooze' && reminderId) {
    event.waitUntil(
      (async () => {
        try {
          await fetch(`/api/reminders/${reminderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adiar_minutos: 10 }),
          });
        } catch (e) {}

        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          client.postMessage({
            type: 'ALARM_SNOOZED',
            reminderId: reminderId,
          });
        }

        await self.registration.showNotification('⏰ Lembrete Adiado', {
          body: 'O alarme tocará novamente em 10 minutos.',
          icon: '/icon-192.png',
          tag: 'snooze_' + reminderId,
          silent: true,
        });
      })()
    );
    return;
  }

  // Open or focus application window
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Focus existing window if open and navigate to alarm if needed
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl).catch(() => {});
          }
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
