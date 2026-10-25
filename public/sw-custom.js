// Service Worker Custom & Background Alarm Scheduler
// Lembrete Inteligente - Persistência em Segundo Plano & Economia de Energia
// Garante o agendamento de alarmes via Web Notifications e estado no IndexedDB

const DB_NAME = 'LembreteInteligenteDB';
const DB_VERSION = 1;
const STORE_ALARMS = 'scheduled_alarms';
const STORE_META = 'metadata';

// ==========================================
// 0. Recurrence Calculation Engine (Segundo Plano)
// ==========================================

function calculateNextRecurrence(dataHoraExecucao, recorrencia, diasSemana, fromTimestamp) {
  if (!recorrencia || recorrencia === 'nenhuma') return null;
  const baseMs = fromTimestamp !== undefined ? fromTimestamp : Date.now();

  let scheduledHour = 9;
  let scheduledMinute = 0;
  let scheduledSecond = 0;

  const rawIso = (dataHoraExecucao || '').trim().replace(' ', 'T');
  if (rawIso.includes('T')) {
    const timePart = rawIso.split('T')[1] || '';
    const tParts = timePart.split(':').map((v) => parseInt(v, 10));
    if (!isNaN(tParts[0])) scheduledHour = tParts[0];
    if (!isNaN(tParts[1])) scheduledMinute = tParts[1];
    if (!isNaN(tParts[2])) scheduledSecond = tParts[2];
  } else {
    const d = new Date(dataHoraExecucao);
    if (!isNaN(d.getTime())) {
      scheduledHour = d.getHours();
      scheduledMinute = d.getMinutes();
      scheduledSecond = d.getSeconds();
    }
  }

  const pad = (n) => String(n).padStart(2, '0');

  if (recorrencia === 'diaria') {
    const candidate = new Date(baseMs);
    candidate.setHours(scheduledHour, scheduledMinute, scheduledSecond, 0);

    if (candidate.getTime() <= baseMs) {
      candidate.setDate(candidate.getDate() + 1);
    }
    while (candidate.getTime() <= baseMs) {
      candidate.setDate(candidate.getDate() + 1);
    }

    const nextDateIso = `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}T${pad(scheduledHour)}:${pad(scheduledMinute)}:${pad(scheduledSecond)}`;
    return {
      nextDateIso,
      nextTimestamp: candidate.getTime(),
    };
  }

  if (recorrencia === 'semanal') {
    let effectiveDays = Array.isArray(diasSemana) && diasSemana.length > 0 ? diasSemana : [];
    if (effectiveDays.length === 0) {
      const origDate = new Date(dataHoraExecucao);
      effectiveDays = [!isNaN(origDate.getTime()) ? origDate.getDay() : new Date(baseMs).getDay()];
    }
    effectiveDays = Array.from(new Set(effectiveDays)).sort((a, b) => a - b);

    const candidate = new Date(baseMs);
    candidate.setHours(scheduledHour, scheduledMinute, scheduledSecond, 0);

    const todayMatches = effectiveDays.includes(candidate.getDay());
    if (todayMatches && candidate.getTime() > baseMs + 5000) {
      const nextDateIso = `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}T${pad(scheduledHour)}:${pad(scheduledMinute)}:${pad(scheduledSecond)}`;
      return {
        nextDateIso,
        nextTimestamp: candidate.getTime(),
      };
    }

    for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
      const nextCandidate = new Date(baseMs);
      nextCandidate.setDate(nextCandidate.getDate() + dayOffset);
      nextCandidate.setHours(scheduledHour, scheduledMinute, scheduledSecond, 0);

      if (effectiveDays.includes(nextCandidate.getDay()) && nextCandidate.getTime() > baseMs) {
        const nextDateIso = `${nextCandidate.getFullYear()}-${pad(nextCandidate.getMonth() + 1)}-${pad(nextCandidate.getDate())}T${pad(scheduledHour)}:${pad(scheduledMinute)}:${pad(scheduledSecond)}`;
        return {
          nextDateIso,
          nextTimestamp: nextCandidate.getTime(),
        };
      }
    }
  }

  return null;
}

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

async function cancelScheduledNotificationByTag(tag) {
  try {
    let notifs = [];
    try {
      notifs = await self.registration.getNotifications({ tag, includeTriggered: true });
    } catch {
      notifs = await self.registration.getNotifications({ tag });
    }
    if (Array.isArray(notifs)) {
      notifs.forEach((n) => {
        try { n.close(); } catch {}
      });
    }
  } catch {}
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
  const triggersToSchedule = [];

  // 1. Prune removed or finished reminders
  for (const [id, existingRec] of existingMap.entries()) {
    if ((existingRec.user_id === userId || !userId) && !incomingIds.has(id)) {
      await cancelScheduledNotificationByTag(`${id}_exec`);
      await cancelScheduledNotificationByTag(`${id}_ant`);
    }
  }

  await new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);

    for (const [id, existingRec] of existingMap.entries()) {
      if ((existingRec.user_id === userId || !userId) && !incomingIds.has(id)) {
        store.delete(id);
      }
    }

    for (const item of reminders) {
      if (item.status_tarefa === 'concluído') {
        store.delete(item.id);
        cancelScheduledNotificationByTag(`${item.id}_exec`);
        cancelScheduledNotificationByTag(`${item.id}_ant`);
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
        recorrencia: item.recorrencia || 'nenhuma',
        dias_semana: Array.isArray(item.dias_semana) ? item.dias_semana : [],
        execFired: isNewSchedule ? false : !!existing.execFired,
        antFired: isNewSchedule ? false : !!existing.antFired,
        updated_at: Date.now(),
      };

      store.put(record);

      // Programar gatilhos nativos de alta prioridade diretamente no relógio do sistema operacional
      if (targetTimestamp > Date.now() && !record.execFired) {
        triggersToSchedule.push({ record, type: 'exec', timestamp: targetTimestamp });
      }
      if (antTimestamp && antTimestamp > Date.now() && !record.antFired) {
        triggersToSchedule.push({ record, type: 'ant', timestamp: antTimestamp });
      }
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });

  // 2. Registrar cada alarme no chip do SO via NotificationTriggers (independente de servidor ou Vercel)
  for (const t of triggersToSchedule) {
    try {
      await scheduleNativeNotificationTrigger(t.record, t.type, t.timestamp);
    } catch {}
  }
}

async function saveAlarmRecordInDB(record) {
  const db = await openDatabase();
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);
    store.put(record);
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
  await cancelScheduledNotificationByTag(`${id}_exec`);
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);
    const getReq = store.get(id);
    getReq.onsuccess = async () => {
      const record = getReq.result;
      if (record) {
        record.targetTimestamp = newTargetTimestamp;
        record.status_tarefa = 'adiado';
        record.execFired = false;
        record.updated_at = Date.now();
        store.put(record);

        // Reagendar gatilho nativo no SO
        await scheduleNativeNotificationTrigger(record, 'exec', newTargetTimestamp);
      }
      resolve();
    };
    getReq.onerror = () => resolve();
  });
}

async function markAlarmCompletedInDB(id) {
  const db = await openDatabase();
  await cancelScheduledNotificationByTag(`${id}_exec`);
  await cancelScheduledNotificationByTag(`${id}_ant`);
  return new Promise((resolve) => {
    const transaction = db.transaction([STORE_ALARMS], 'readwrite');
    const store = transaction.objectStore(STORE_ALARMS);
    store.delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

// ==========================================
// 2. Suporte a NotificationTriggers (Native OS Alarm Chip)
// ==========================================

function getTimestampTriggerConstructor() {
  if (typeof self !== 'undefined' && typeof self.TimestampTrigger !== 'undefined') {
    return self.TimestampTrigger;
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.TimestampTrigger !== 'undefined') {
    return globalThis.TimestampTrigger;
  }
  return null;
}

function supportsNotificationTriggers() {
  try {
    return (
      getTimestampTriggerConstructor() !== null ||
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
    : `Horário do compromisso alcançado: ${item.titulo}! Toque para ver ou adiar.`;

  const tag = `${item.id}_${type}`;

  try {
    const TriggerCtor = getTimestampTriggerConstructor();
    if (!TriggerCtor) return false;

    const trigger = new TriggerCtor(triggerTimestamp);
    await self.registration.showNotification(title, {
      body: body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag,
      showTrigger: trigger,
      requireInteraction: true,
      renotify: true,
      silent: false,
      vibrate: [1000, 300, 1000, 300, 1000, 300, 1500],
      data: {
        reminderId: item.id,
        triggerType: type,
        url: `/?alarm_reminder_id=${item.id}`,
      },
      actions: [
        { action: 'open', title: '🔔 Abrir Alarme' },
        { action: 'snooze', title: '⏰ Adiar 10m' },
        { action: 'complete', title: '✅ Concluir' },
      ],
    });
    console.log(
      `[SW-Custom] 🚀 NotificationTrigger nativo registrado no relógio do SO para "${item.titulo}" (${type}) às ${new Date(
        triggerTimestamp
      ).toLocaleTimeString()}`
    );
    return true;
  } catch (err) {
    console.warn('[SW-Custom] Aviso ao agendar TimestampTrigger nativo:', err);
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

        if (alarm.recorrencia === 'diaria' || alarm.recorrencia === 'semanal') {
          const nextOccur = calculateNextRecurrence(
            alarm.data_hora_execucao,
            alarm.recorrencia,
            alarm.dias_semana,
            now
          );

          if (nextOccur) {
            alarm.data_hora_execucao = nextOccur.nextDateIso;
            alarm.targetTimestamp = nextOccur.nextTimestamp;
            const antMin = Number(alarm.antecedencia_minutos) || 0;
            alarm.antTimestamp = antMin > 0 ? nextOccur.nextTimestamp - antMin * 60 * 1000 : null;
            alarm.execFired = false;
            alarm.antFired = false;
            alarm.last_triggered = now;
            alarm.updated_at = now;
            await saveAlarmRecordInDB(alarm);

            // Reagendar gatilho nativo no SO
            scheduleNativeNotificationTrigger(alarm, 'exec', nextOccur.nextTimestamp).catch(() => {});
            if (alarm.antTimestamp && alarm.antTimestamp > now) {
              scheduleNativeNotificationTrigger(alarm, 'ant', alarm.antTimestamp).catch(() => {});
            }

            // Notificar abas abertas da aplicação
            try {
              const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
              for (const client of clients) {
                client.postMessage({
                  type: 'RECURRING_ALARM_ADVANCED',
                  reminderId: alarm.id,
                  nextDateIso: nextOccur.nextDateIso,
                  nextTimestamp: nextOccur.nextTimestamp,
                });
              }
            } catch (e) {}

            // Sincronizar com o backend
            try {
              await fetch(`/api/reminders/${alarm.id}/advance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nextDateIso: nextOccur.nextDateIso,
                  nextTimestamp: nextOccur.nextTimestamp,
                }),
              });
            } catch (e) {}
          } else {
            await markAlarmTriggeredInDB(alarm.id, 'exec');
          }
        } else {
          await markAlarmTriggeredInDB(alarm.id, 'exec');
        }
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
      vibrate: [800, 250, 800, 250, 800, 250, 1200],
      data: {
        reminderId: alarm.id,
        triggerType: type,
        url: `/?alarm_reminder_id=${alarm.id}`,
      },
      actions: [
        { action: 'open', title: '🔔 Abrir Alarme' },
        { action: 'snooze', title: '⏰ Adiar 10m' },
        { action: 'complete', title: '✅ Concluir' },
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
    requireInteraction: true, // NÃO deixa o alarme sumir sozinho da tela bloqueada
    silent: false,
    vibrate: [1000, 300, 1000, 300, 1000, 300, 1500],
    data: {
      url: data.url || (reminderId ? `/?alarm_reminder_id=${reminderId}` : '/'),
      reminderId: reminderId,
      triggerType: triggerType,
    },
    actions: [
      { action: 'open', title: '📂 Abrir Agenda' },
      { action: 'snooze', title: '⏰ Adiar 10m' },
      { action: 'complete', title: '✅ Concluir Tarefa' },
    ],
  };

  event.waitUntil(
    (async () => {
      // 1. Forçar a exibição da Notificação na Tela de Bloqueio do Aparelho
      await self.registration.showNotification(data.title, notificationOptions);

      // 2. Marcar no IndexedDB local para evitar duplicação pelo agendador local
      if (reminderId) {
        await markAlarmTriggeredInDB(reminderId, triggerType);
      }

      // 3. Enviar um sinal em tempo real para acordar a interface se ela estiver aberta em segundo plano
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
        // Consultar se o alarme concluído é recorrente
        let existingAlarm = null;
        try {
          const db = await openDatabase();
          existingAlarm = await new Promise((resolve) => {
            const tx = db.transaction([STORE_ALARMS], 'readonly');
            const req = tx.objectStore(STORE_ALARMS).get(reminderId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          });
        } catch (e) {}

        if (existingAlarm && (existingAlarm.recorrencia === 'diaria' || existingAlarm.recorrencia === 'semanal')) {
          const nextOccur = calculateNextRecurrence(
            existingAlarm.data_hora_execucao,
            existingAlarm.recorrencia,
            existingAlarm.dias_semana,
            Date.now()
          );

          if (nextOccur) {
            existingAlarm.data_hora_execucao = nextOccur.nextDateIso;
            existingAlarm.targetTimestamp = nextOccur.nextTimestamp;
            const antMin = Number(existingAlarm.antecedencia_minutos) || 0;
            existingAlarm.antTimestamp = antMin > 0 ? nextOccur.nextTimestamp - antMin * 60 * 1000 : null;
            existingAlarm.execFired = false;
            existingAlarm.antFired = false;
            existingAlarm.updated_at = Date.now();
            await saveAlarmRecordInDB(existingAlarm);

            scheduleNativeNotificationTrigger(existingAlarm, 'exec', nextOccur.nextTimestamp).catch(() => {});
            if (existingAlarm.antTimestamp && existingAlarm.antTimestamp > Date.now()) {
              scheduleNativeNotificationTrigger(existingAlarm, 'ant', existingAlarm.antTimestamp).catch(() => {});
            }

            try {
              await fetch(`/api/reminders/${reminderId}/advance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nextDateIso: nextOccur.nextDateIso,
                  nextTimestamp: nextOccur.nextTimestamp,
                }),
              });
            } catch (e) {}

            const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            for (const client of clientList) {
              client.postMessage({
                type: 'RECURRING_ALARM_ADVANCED',
                reminderId: reminderId,
                nextDateIso: nextOccur.nextDateIso,
                nextTimestamp: nextOccur.nextTimestamp,
              });
            }

            await self.registration.showNotification('✅ Tarefa Recorrente Concluída', {
              body: `Próximo alarme agendado automaticamente.`,
              icon: '/icon-192.png',
              tag: 'recurring_done_' + reminderId,
              silent: true,
            });
            return;
          }
        }

        // Se for lembrete único, remove do IndexedDB e marca concluído
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
