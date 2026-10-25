// Service Worker Custom & Background Alarm Scheduler
// Lembrete Inteligente - Persistência em Segundo Plano & Economia de Energia
// Garante o agendamento de alarmes via Web Notifications e estado no IndexedDB

const DB_NAME = 'LembreteInteligenteDB';
const DB_VERSION = 1;
const STORE_ALARMS = 'scheduled_alarms';
const STORE_META = 'metadata';

// ==========================================
// 1. IndexedDB Helper (Persistente no Sistema)
// ==========================================

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ALARMS)) {
        const store = db.createObjectStore(STORE_ALARMS, { keyPath: 'id' });
        store.createIndex('targetTimestamp', 'targetTimestamp', { unique: false });
        store.createIndex('status_tarefa', 'status_tarefa', { unique: false });
        store.createIndex('user_id', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
  });
}

async function getAllPendingAlarmsFromDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ALARMS], 'readonly');
    const store = transaction.objectStore(STORE_ALARMS);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result || [];
      resolve(items.filter((item) => item.status_tarefa !== 'concluído'));
    };
    request.onerror = () => reject(request.error);
  });
}

async function saveAlarmsToDB(userId, reminders) {
  if (!Array.isArray(reminders)) return;
  const db = await openDatabase();
  const existingItems = await getAllPendingAlarmsFromDB();
  const existingMap = new Map();
  for (const item of existingItems) {
    existingMap.set(item.id, item);
  }

  const incomingIds = new Set(reminders.map((r) => r.id));

  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);

    // Prune any alarms previously stored for this user that are no longer in the incoming list
    for (const [id, existingRec] of existingMap.entries()) {
      if ((existingRec.user_id === userId || !userId) && !incomingIds.has(id)) {
        store.delete(id);
        try {
          self.registration.getNotifications({ tag: `${id}_exec` }).then((notifs) => notifs.forEach((n) => n.close())).catch(() => {});
          self.registration.getNotifications({ tag: `${id}_ant` }).then((notifs) => notifs.forEach((n) => n.close())).catch(() => {});
        } catch {}
      }
    }

    for (const item of reminders) {
      if (item.status_tarefa === 'concluído') {
        store.delete(item.id);
        try {
          self.registration.getNotifications({ tag: `${item.id}_exec` }).then((notifs) => notifs.forEach((n) => n.close())).catch(() => {});
          self.registration.getNotifications({ tag: `${item.id}_ant` }).then((notifs) => notifs.forEach((n) => n.close())).catch(() => {});
        } catch {}
        continue;
      }

      let targetTimestamp = Number(item.timestamp_execucao);
      if (!targetTimestamp || isNaN(targetTimestamp)) {
        targetTimestamp = new Date(item.data_hora_execucao).getTime();
      }
      if (!targetTimestamp || isNaN(targetTimestamp)) continue;

      const antMin = Number(item.antecedencia_minutos) || 0;
      const antTimestamp = antMin > 0 ? targetTimestamp - antMin * 60 * 1000 : null;

      const existing = existingMap.get(item.id);
      const isNewSchedule = !existing || existing.targetTimestamp !== targetTimestamp;

      const record = {
        id: item.id,
        user_id: item.user_id || userId || 'default',
        titulo: item.titulo || 'Lembrete',
        data_hora_execucao: item.data_hora_execucao,
        targetTimestamp: targetTimestamp,
        antecedencia_minutos: antMin,
        antTimestamp: antTimestamp,
        status_tarefa: item.status_tarefa || 'pendente',
        categoria: item.categoria || 'Geral',
        urgencia: item.urgencia || 'media',
        execFired: isNewSchedule ? false : !!existing.execFired,
        antFired: isNewSchedule ? false : !!existing.antFired,
        updated_at: Date.now(),
      };

      store.put(record);

      // Agendar gatilho nativo no SO (NotificationTriggers) se suportado pelo navegador
      scheduleNativeNotificationTrigger(record, 'exec', targetTimestamp).catch(() => {});
      if (antTimestamp && antTimestamp > Date.now()) {
        scheduleNativeNotificationTrigger(record, 'ant', antTimestamp).catch(() => {});
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function markAlarmTriggeredInDB(id, type) {
  const db = await openDatabase();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        if (type === 'ant') record.antFired = true;
        if (type === 'exec') record.execFired = true;
        record.last_triggered = Date.now();
        store.put(record);
      }
      resolve();
    };
    getReq.onerror = () => resolve();
  });
}

async function updateAlarmSnoozeInDB(id, newTargetTimestamp) {
  const db = await openDatabase();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.targetTimestamp = newTargetTimestamp;
        record.status_tarefa = 'adiado';
        record.execFired = false;
        record.updated_at = Date.now();
        store.put(record);

        // Reagendar gatilho nativo
        scheduleNativeNotificationTrigger(record, 'exec', newTargetTimestamp).catch(() => {});
      }
      resolve();
    };
    getReq.onerror = () => resolve();
  });
}

async function markAlarmCompletedInDB(id) {
  const db = await openDatabase();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

// ==========================================
// 2. Suporte a NotificationTriggers (Native OS Alarm)
// ==========================================

function supportsNotificationTriggers() {
  try {
    return (
      typeof self.TimestampTrigger !== 'undefined' ||
      ('showTrigger' in (self.Notification && self.Notification.prototype ? self.Notification.prototype : {}))
    );
  } catch (e) {
    return false;
  }
}

async function scheduleNativeNotificationTrigger(item, type, triggerTimestamp) {
  if (!supportsNotificationTriggers()) return false;
  if (triggerTimestamp <= Date.now()) return false;

  const isAntecedencia = type === 'ant';
  const title = isAntecedencia
    ? `⏰ AVISO PRÉVIO: ${item.titulo}`
    : `⏰ ALARME: ${item.titulo}`;
  const body = isAntecedencia
    ? `Aviso prévio (${item.antecedencia_minutos} min antes) para: ${item.titulo}`
    : `Horário do compromisso alcançado: ${item.titulo}!`;

  const tag = `${item.id}_${type}`;

  try {
    const trigger = new self.TimestampTrigger(triggerTimestamp);
    await self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag,
      showTrigger: trigger,
      requireInteraction: true,
      renotify: true,
      silent: false,
      vibrate: [600, 200, 600, 200, 600, 200, 800],
      data: {
        reminderId: item.id,
        triggerType: type,
        url: `/?alarm_reminder_id=${item.id}`,
      },
      actions: [
        { action: 'open', title: 'Ver Lembrete' },
        { action: 'snooze', title: 'Adiar 10m' },
        { action: 'complete', title: 'Concluir' },
      ],
    });
    console.log(
      `[SW-Custom] NotificationTrigger nativo registrado para "${item.titulo}" (${type}) às ${new Date(
        triggerTimestamp
      ).toLocaleTimeString()}`
    );
    return true;
  } catch (err) {
    console.warn('[SW-Custom] Aviso ao agendar TimestampTrigger:', err);
    return false;
  }
}

// ==========================================
// 3. Verificação Ativa de Lembretes Vencidos
// ==========================================

async function verifyAndTriggerDueAlarms() {
  const now = Date.now();
  let pendingList = [];
  try {
    pendingList = await getAllPendingAlarmsFromDB();
  } catch (err) {
    console.warn('[SW-Custom] Falha ao consultar alarmes no IndexedDB:', err);
    return;
  }

  for (const alarm of pendingList) {
    if (alarm.status_tarefa === 'concluído') continue;

    const execTime = alarm.targetTimestamp;
    const antMin = Number(alarm.antecedencia_minutos) || 0;
    const antTime = antMin > 0 ? alarm.antTimestamp || execTime - antMin * 60 * 1000 : null;

    // 1. Antecedência
    if (antTime && !alarm.antFired) {
      const diffAnt = now - antTime;
      if (diffAnt >= 0 && diffAnt < 30 * 60 * 1000) {
        await fireAlarmNotification(alarm, 'ant');
        await markAlarmTriggeredInDB(alarm.id, 'ant');
      }
    }

    // 2. Horário de Execução
    if (execTime && !alarm.execFired) {
      const diffExec = now - execTime;
      if (diffExec >= 0 && diffExec < 24 * 60 * 60 * 1000) {
        await fireAlarmNotification(alarm, 'exec');
        await markAlarmTriggeredInDB(alarm.id, 'exec');
      }
    }
  }
}

async function fireAlarmNotification(alarm, type) {
  const isAntecedencia = type === 'ant';
  const title = isAntecedencia
    ? `⏰ AVISO PRÉVIO: ${alarm.titulo}`
    : `⏰ ALARME: ${alarm.titulo}`;
  const body = isAntecedencia
    ? `Aviso de antecedência (${alarm.antecedencia_minutos} min) para: ${alarm.titulo}`
    : `Horário do compromisso alcançado: ${alarm.titulo}!`;

  const tag = `${alarm.id}_${type}`;

  try {
    const existingNotifs = await self.registration.getNotifications({ tag });
    if (existingNotifs && existingNotifs.length > 0) {
      return;
    }

    await self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag,
      requireInteraction: true,
      renotify: true,
      silent: false,
      vibrate: [600, 200, 600, 200, 600, 200, 800],
      data: {
        reminderId: alarm.id,
        triggerType: type,
        url: `/?alarm_reminder_id=${alarm.id}`,
      },
      actions: [
        { action: 'open', title: 'Ver Lembrete' },
        { action: 'snooze', title: 'Adiar 10m' },
        { action: 'complete', title: 'Concluir' },
      ],
    });
  } catch (err) {
    console.warn('[SW-Custom] Erro ao disparar notificação:', err);
  }

  // Notificar abas abertas da aplicação
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'TRIGGER_ALARM',
        reminderId: alarm.id,
        triggerType: type,
      });
    }
  } catch (err) {}
}

// ==========================================
// 4. Ciclo de Vida do Service Worker
// ==========================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await verifyAndTriggerDueAlarms();

      // Registro do Periodic Background Sync para acordar em segundo plano
      try {
        if ('periodicSync' in self.registration) {
          const status = await self.navigator.permissions?.query?.({ name: 'periodic-background-sync' });
          if (!status || status.state === 'granted') {
            await self.registration.periodicSync.register('check-alarms', {
              minInterval: 60 * 1000, // 1 minuto
            });
          }
        }
      } catch (e) {}

      // Registro do Background Sync imediato
      try {
        if ('sync' in self.registration) {
          await self.registration.sync.register('check-alarms');
        }
      } catch (e) {}
    })()
  );
});

// Ticker em memória enquanto a thread do Service Worker estiver ativa
let tickInterval = null;
let pingCounter = 0;
function startKeepAliveTick() {
  if (!tickInterval) {
    tickInterval = setInterval(() => {
      verifyAndTriggerDueAlarms().catch(() => {});
      pingCounter++;
      // Ping o servidor a cada ~16 segundos para manter o container e o agendador aquecidos
      if (pingCounter % 4 === 0) {
        fetch('/api/ping', { method: 'GET', cache: 'no-store' }).catch(() => {});
      }
    }, 4000);
  }
}
startKeepAliveTick();

// ==========================================
// 5. Background Sync & Periodic Sync Events
// ==========================================

self.addEventListener('sync', (event) => {
  event.waitUntil(verifyAndTriggerDueAlarms());
});

self.addEventListener('periodicsync', (event) => {
  event.waitUntil(verifyAndTriggerDueAlarms());
});

// ==========================================
// 6. Mensagens recebidas do Cliente (React / Context)
// ==========================================

self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type, userId, reminders } = event.data;

  if (type === 'SCHEDULE_REMINDERS' || type === 'SYNC_REMINDERS') {
    event.waitUntil(
      (async () => {
        if (Array.isArray(reminders)) {
          await saveAlarmsToDB(userId, reminders);
          await verifyAndTriggerDueAlarms();
        }
      })()
    );
  } else if (type === 'CHECK_ALARMS' || type === 'TICK' || type === 'PING') {
    event.waitUntil(verifyAndTriggerDueAlarms());
  } else if (type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    if (title && self.registration && typeof self.registration.showNotification === 'function') {
      event.waitUntil(
        self.registration.showNotification(title, {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          requireInteraction: true,
          renotify: true,
          silent: false,
          vibrate: [600, 200, 600, 200, 600, 200, 800],
          ...options,
        })
      );
    }
  } else if (type === 'TEST_ALARM') {
    event.waitUntil(
      self.registration.showNotification('⏰ Teste de Alarme', {
        body: 'O sistema de alarmes em segundo plano está 100% ativo e operacional.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'test_alarm_' + Date.now(),
        requireInteraction: true,
        vibrate: [600, 200, 600, 200, 600, 200, 800],
      })
    );
  } else if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ==========================================
// 7. Web Push em Segundo Plano (Servidor)
// ==========================================

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
      data = Object.assign({}, data, parsed);
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const reminderId = data.reminderId;
  const isAntecedencia = !!data.isAntecedencia;
  const triggerType = isAntecedencia ? 'ant' : 'exec';
  const tag = data.tag || (reminderId ? `${reminderId}_${triggerType}` : `alarm_${Date.now()}`);

  const notificationOptions = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [600, 200, 600, 200, 600, 200, 800],
    data: {
      url: data.url || (reminderId ? `/?alarm_reminder_id=${reminderId}` : '/'),
      reminderId: reminderId,
      triggerType: triggerType,
    },
    actions: [
      { action: 'open', title: 'Ver Lembrete' },
      { action: 'snooze', title: 'Adiar 10m' },
      { action: 'complete', title: 'Concluir' },
    ],
  };

  event.waitUntil(
    (async () => {
      // 1. Exibir notificação push nativa com vibração e persistência
      await self.registration.showNotification(data.title, notificationOptions);

      // 2. Marcar no IndexedDB local para evitar duplicação pelo agendador local
      if (reminderId) {
        await markAlarmTriggeredInDB(reminderId, triggerType);
      }

      // 3. Avisar clientes abertos
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientList) {
        client.postMessage({
          type: 'TRIGGER_ALARM',
          reminderId: reminderId,
          triggerType: triggerType,
        });
      }
    })()
  );
});

// ==========================================
// 8. Cliques e Ações na Notificação (Tela de Bloqueio)
// ==========================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const reminderId = event.notification.data?.reminderId;
  const action = event.action;
  const targetUrl =
    event.notification.data?.url || (reminderId ? `/?alarm_reminder_id=${reminderId}` : '/');

  // Ação Adiar 10 Minutos diretamente da notificação
  if (action === 'snooze' && reminderId) {
    event.waitUntil(
      (async () => {
        const newTarget = Date.now() + 10 * 60 * 1000;
        await updateAlarmSnoozeInDB(reminderId, newTarget);

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

  // Ação Concluir diretamente da notificação
  if (action === 'complete' && reminderId) {
    event.waitUntil(
      (async () => {
        await markAlarmCompletedInDB(reminderId);

        try {
          await fetch(`/api/reminders/${reminderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status_tarefa: 'concluído' }),
          });
        } catch (e) {}

        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clientList) {
          client.postMessage({
            type: 'ALARM_COMPLETED',
            reminderId: reminderId,
          });
        }
      })()
    );
    return;
  }

  // Focar ou abrir a janela do aplicativo
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
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

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
