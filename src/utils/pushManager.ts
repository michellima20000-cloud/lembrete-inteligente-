// Native Web Push Notification & Service Worker Manager
// Enables alarms and notifications even when device is locked or browser is in background

// Fallback VAPID public key matching the server's persistent .vapid-keys.json
export const FALLBACK_VAPID_PUBLIC_KEY =
  'BB9hiMXS2NLqKR7r8LR44b1lB1BEnB_l3iphQ0XQQf-7lPUzBAC-4vaOfrvIvybpbsAORqd4S7EeZ0Tw8KVlPZg';


function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function keysEqual(key1: ArrayBuffer | ArrayBufferView | null | undefined, key2: Uint8Array): boolean {
  if (!key1) return false;
  const arr1 = key1 instanceof Uint8Array ? key1 : new Uint8Array(key1 instanceof ArrayBuffer ? key1 : (key1 as ArrayBufferView).buffer);
  if (arr1.length !== key2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== key2[i]) return false;
  }
  return true;
}

/**
 * Safe fetch helper that guarantees we never attempt to parse HTML responses as JSON,
 * completely preventing "Unexpected token '<', '<!doctype' is not valid JSON" errors.
 */
async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; status: number; error?: string }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(options?.headers || {}),
      },
    });

    // 1. Any HTTP status 200..299 is GUARANTEED to be successful
    if (res.ok) {
      let data: any = { status: 'sucesso', mensagem: 'Operação realizada com sucesso.' };
      try {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { status: 'sucesso', text };
          }
        }
      } catch {
        // Fallback already assigned
      }

      return {
        ok: true,
        data: data as T,
        status: res.status,
      };
    }

    // 2. Non-2xx HTTP status (4xx, 5xx)
    let errorMsg = `Erro no servidor (${res.status}).`;
    try {
      const text = await res.text();
      const parsed = JSON.parse(text);
      if (parsed?.mensagem) {
        errorMsg = parsed.mensagem;
      }
    } catch {}

    return {
      ok: false,
      status: res.status,
      error: errorMsg,
    };
  } catch (err: any) {
    console.warn(`[PushManager] Erro de rede ao requisitar ${url}:`, err);
    return {
      ok: false,
      status: 0,
      error: err?.message || 'Falha de comunicação com o servidor.',
    };
  }
}

type AlarmTriggerCallback = (reminderId?: string) => void;
type SnoozeCallback = (reminderId?: string) => void;
export type RecurringAdvancedCallback = (data: { reminderId: string; nextDateIso: string; nextTimestamp: number }) => void;

export interface SystemNotificationOptions extends NotificationOptions {
  vibrate?: number | number[];
  renotify?: boolean;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  data?: any;
  silent?: boolean;
}

class PushManagerService {
  private registration: ServiceWorkerRegistration | null = null;
  private alarmListeners: Set<AlarmTriggerCallback> = new Set();
  private snoozeListeners: Set<SnoozeCallback> = new Set();
  private recurringAdvancedListeners: Set<RecurringAdvancedCallback> = new Set();
  private isInitializing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public async init(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    if (this.registration) return this.registration;
    if (this.isInitializing) return null;
    this.isInitializing = true;

    try {
      // Register standard service worker with root scope
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.registration = reg;
      console.log('[PushManager] Service Worker registrado com escopo:', reg.scope);

      // Check for updates and register periodicSync if available
      try {
        reg.update();
      } catch {}

      try {
        if ('periodicSync' in reg) {
          const status = await (navigator as any).permissions?.query?.({ name: 'periodic-background-sync' });
          if (!status || status.state === 'granted') {
            await (reg as any).periodicSync.register('check-alarms', {
              minInterval: 60 * 1000,
            });
          }
        }
      } catch {}

      // Listen for background push message signals from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.type === 'TRIGGER_ALARM' || event.data.type === 'PUSH_ALARM_RECEIVED') {
          console.log('[PushManager] Sinal de alarme recebido do Service Worker:', event.data);
          this.alarmListeners.forEach((cb) => cb(event.data.reminderId));
        } else if (event.data.type === 'ALARM_SNOOZED') {
          console.log('[PushManager] Sinal de alarme adiado recebido do Service Worker:', event.data);
          this.snoozeListeners.forEach((cb) => cb(event.data.reminderId));
        } else if (event.data.type === 'RECURRING_ALARM_ADVANCED') {
          console.log('[PushManager] Sinal de alarme recorrente avançado recebido:', event.data);
          this.recurringAdvancedListeners.forEach((cb) => cb(event.data));
        }
      });

      return reg;
    } catch (err) {
      console.warn('[PushManager] Falha ao registrar Service Worker:', err);
      return null;
    } finally {
      this.isInitializing = false;
    }
  }

  public isPushSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  public getNotificationPermission(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  public async getExistingSubscription(): Promise<PushSubscription | null> {
    if (!this.isPushSupported()) return null;
    try {
      const reg = await (this.registration || navigator.serviceWorker.ready);
      if (!reg || !reg.pushManager) return null;
      return await reg.pushManager.getSubscription();
    } catch (e) {
      console.warn('[PushManager] Erro ao consultar inscrição existente:', e);
      return null;
    }
  }

  /**
   * Dispara um aviso de sistema via Notifications API utilizando serviceWorker.showNotification
   * Garantindo que o alerta apareça fora do navegador (na área de notificações nativa do SO).
   */
  public async showSystemNotification(
    title: string,
    options: SystemNotificationOptions = {}
  ): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = Notification.permission;
      }
    }
    if (permission !== 'granted') {
      return false;
    }

    const mergedOptions: SystemNotificationOptions = {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      requireInteraction: true, // Mantém o alerta na tela fora do navegador até interação
      renotify: true,
      silent: false,
      vibrate: [600, 200, 600, 200, 600, 200, 800],
      ...options,
    };

    // 1. Tentar prioritariamente via Service Worker Registration (serviceWorker.showNotification)
    if ('serviceWorker' in navigator) {
      try {
        let reg: ServiceWorkerRegistration | null = this.registration;
        if (!reg) {
          try {
            reg = (await navigator.serviceWorker.getRegistration()) || null;
          } catch {}
        }
        if (!reg) {
          try {
            const readyPromise = navigator.serviceWorker.ready;
            const timeoutPromise = new Promise<ServiceWorkerRegistration | null>((r) =>
              setTimeout(() => r(null), 1500)
            );
            reg = (await Promise.race([readyPromise, timeoutPromise])) || null;
          } catch {}
        }

        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, mergedOptions as any);
          return true;
        }
      } catch (swErr) {
        console.warn('[PushManager] Aviso ao chamar serviceWorker.showNotification:', swErr);
      }

      // Tentar delegar mensagem direta ao Service Worker Controller
      try {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title,
            options: mergedOptions,
          });
          return true;
        }
      } catch {}
    }

    // 2. Fallback via construtor padrão da Notifications API fora do Service Worker
    try {
      const fallbackNotif = new Notification(title, mergedOptions as any);
      fallbackNotif.onclick = () => {
        try {
          window.focus();
        } catch {}
        fallbackNotif.close();
      };
      return true;
    } catch (fallbackError) {
      console.warn('[PushManager] Fallback da Notifications API falhou:', fallbackError);
      return false;
    }
  }

  public async subscribeToPush(userId: string): Promise<{ success: boolean; message: string }> {
    if (!this.isPushSupported()) {
      return {
        success: false,
        message: 'Seu navegador não suporta a API de Notificações Push nativas.',
      };
    }

    try {
      // 1. Request notification permission via user gesture
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          message: 'Permissão de notificação negada no navegador. Permita o acesso nas configurações do site.',
        };
      }

      // 2. Ensure Service Worker is ready
      let reg = this.registration;
      if (!reg) {
        reg = await this.init();
      }
      if (!reg) {
        reg = await navigator.serviceWorker.ready;
      }

      if (!reg || !reg.pushManager) {
        return {
          success: false,
          message: 'Service Worker ou PushManager indisponível.',
        };
      }

      // 3. Fetch VAPID Public Key from backend (with automatic fallback to embedded key)
      let vapidPublicKey = FALLBACK_VAPID_PUBLIC_KEY;
      try {
        const vapidResult = await safeFetchJson<{ status?: string; publicKey: string }>(
          '/api/push/vapid-public-key',
          { cache: 'no-store' }
        );
        if (vapidResult.ok && vapidResult.data?.publicKey) {
          vapidPublicKey = vapidResult.data.publicKey;
        } else {
          console.log('[PushManager] Usando chave VAPID local resiliente.');
        }
      } catch {
        console.log('[PushManager] Usando chave VAPID padrão.');
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      // 4. Subscribe to PushManager (with auto-renewal if existing key is outdated)
      let subscription: PushSubscription | null = null;
      try {
        subscription = await reg.pushManager.getSubscription();
        if (subscription) {
          // If already subscribed, verify if applicationServerKey matches current key
          try {
            const rawKey = subscription.options?.applicationServerKey;
            const matches = keysEqual(rawKey, applicationServerKey);
            if (!matches) {
              console.log('[PushManager] Inscrição antiga com chave VAPID divergente detectada. Renovando inscrição...');
              await subscription.unsubscribe();
              subscription = null;
            }
          } catch {
            if (subscription) {
              await subscription.unsubscribe().catch(() => {});
            }
            subscription = null;
          }
        }

        if (!subscription) {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as unknown as BufferSource,
          });
          console.log('[PushManager] Nova inscrição Push criada com sucesso.');
        }
      } catch (subErr) {
        console.warn('[PushManager] Tentativa direta falhou, renovando inscrição:', subErr);
        if (subscription) {
          try {
            await subscription.unsubscribe();
          } catch {}
        }
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as unknown as BufferSource,
        });
      }

      if (!subscription) {
        throw new Error('Não foi possível obter uma inscrição push válida do navegador.');
      }

      // 5. Send subscription to backend linked to user_id
      const subJson = subscription.toJSON();
      const clientOffset = new Date().getTimezoneOffset();
      let saveResult = await safeFetchJson<{ status: string; mensagem?: string }>(
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-timezone-offset': String(clientOffset),
          },
          body: JSON.stringify({
            user_id: userId,
            subscription: subJson,
            timezone_offset_minutes: clientOffset,
          }),
        }
      );

      // If POST was rejected by proxy (e.g. 405 Method Not Allowed or network glitch), retry via fallback
      if (!saveResult.ok) {
        console.log('[PushManager] Tentando rota de contingência para registro push...');
        await new Promise((r) => setTimeout(r, 400));
        const queryUrl = `/api/push/subscribe?user_id=${encodeURIComponent(userId)}&timezone_offset_minutes=${clientOffset}&subscription=${encodeURIComponent(JSON.stringify(subJson))}`;
        saveResult = await safeFetchJson<{ status: string; mensagem?: string }>(queryUrl);
      }

      if (!saveResult.ok) {
        throw new Error(
          saveResult.error || 'Falha ao salvar inscrição no servidor.'
        );
      }

      // 6. Auto-sync user's active reminders so background runner starts monitoring immediately
      try {
        let items: any[] = [];
        const saved = localStorage.getItem(`lembretes_isolated_${userId}`);
        if (saved) {
          try { items = JSON.parse(saved); } catch {}
        }
        if (!Array.isArray(items) || items.length === 0) {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('lembretes_isolated_')) {
              try {
                const found = JSON.parse(localStorage.getItem(k) || '[]');
                if (Array.isArray(found) && found.length > 0) {
                  items = found;
                  break;
                }
              } catch {}
            }
          }
        }
        if (Array.isArray(items) && items.length > 0) {
          await this.syncReminders(userId, items);
        }
      } catch {}

      return {
        success: true,
        message:
          'Notificações em segundo plano ativadas com sucesso! Você receberá alarmes mesmo com a tela bloqueada.',
      };
    } catch (err: any) {
      console.error('[PushManager] Erro ao ativar Push:', err);
      return {
        success: false,
        message: err?.message || 'Não foi possível ativar as notificações push.',
      };
    }
  }

  public async unsubscribeFromPush(userId: string): Promise<boolean> {
    try {
      const reg = await (this.registration || navigator.serviceWorker.ready);
      if (!reg || !reg.pushManager) return false;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await safeFetchJson('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, endpoint }),
        });
      }
      return true;
    } catch (e) {
      console.warn('[PushManager] Erro ao cancelar inscrição:', e);
      return false;
    }
  }

  public async testPush(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      let res = await safeFetchJson<{ status: string; mensagem?: string }>('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      // Fallback if carrier / proxy rejects POST with 405
      if (!res.ok) {
        res = await safeFetchJson<{ status: string; mensagem?: string }>(
          `/api/push/test?user_id=${encodeURIComponent(userId)}`
        );
      }
      if (!res.ok) {
        return { success: false, message: res.error || 'Falha ao enviar teste.' };
      }
      return { success: true, message: res.data?.mensagem || 'Alarme de teste enviado com sucesso!' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Erro de conexão ao testar notificação.' };
    }
  }

  public async testPushDelayed(userId: string, delaySeconds = 5): Promise<{ success: boolean; message: string }> {
    try {
      let res = await safeFetchJson<{ status: string; mensagem?: string }>('/api/push/test-delayed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, delaySeconds }),
      });
      if (!res.ok) {
        res = await safeFetchJson<{ status: string; mensagem?: string }>(
          `/api/push/test-delayed?user_id=${encodeURIComponent(userId)}&delaySeconds=${delaySeconds}`
        );
      }
      if (!res.ok) {
        return { success: false, message: res.error || 'Falha ao agendar teste.' };
      }
      return { success: true, message: res.data?.mensagem || `Alarme agendado para ${delaySeconds}s! Bloqueie a tela agora.` };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Erro de conexão ao agendar teste com tela bloqueada.' };
    }
  }

  public async syncReminders(userId: string, lembretes: any[]): Promise<void> {
    // 1. Post to active Service Worker for IndexedDB persistence and native OS NotificationTriggers
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await (this.registration || navigator.serviceWorker.ready);
        const target = reg?.active || navigator.serviceWorker.controller;
        if (target) {
          target.postMessage({
            type: 'SCHEDULE_REMINDERS',
            userId,
            reminders: lembretes,
          });
        }
      }
    } catch (e) {
      console.warn('[PushManager] Falha ao despachar SCHEDULE_REMINDERS para Service Worker:', e);
    }

    // 2. Sync with backend server
    try {
      const clientOffset = new Date().getTimezoneOffset();
      const res = await safeFetchJson('/api/reminders/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-timezone-offset': String(clientOffset),
        },
        body: JSON.stringify({ user_id: userId, lembretes, timezone_offset_minutes: clientOffset }),
      });
      if (!res.ok) {
        await safeFetchJson(
          `/api/reminders/sync?user_id=${encodeURIComponent(userId)}&timezone_offset_minutes=${clientOffset}&lembretes=${encodeURIComponent(JSON.stringify(lembretes))}`
        );
      }
    } catch {
      // Non-blocking sync
    }
  }

  public onAlarmTriggered(callback: AlarmTriggerCallback): () => void {
    this.alarmListeners.add(callback);
    return () => {
      this.alarmListeners.delete(callback);
    };
  }

  public onAlarmSnoozed(callback: SnoozeCallback): () => void {
    this.snoozeListeners.add(callback);
    return () => {
      this.snoozeListeners.delete(callback);
    };
  }

  public onRecurringAlarmAdvanced(callback: RecurringAdvancedCallback): () => void {
    this.recurringAdvancedListeners.add(callback);
    return () => {
      this.recurringAdvancedListeners.delete(callback);
    };
  }

  // ==========================================
  // REAL-TIME BACKGROUND PING & HEARTBEAT ENGINE
  // ==========================================
  private pingListeners: Set<(status: { online: boolean; latencyMs: number; serverTimestamp: number; lastPingTime: number; pendingReminders: number }) => void> = new Set();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private currentPingUserId: string | null = null;
  private lastPingStatus = {
    online: true,
    latencyMs: 15,
    serverTimestamp: Date.now(),
    lastPingTime: Date.now(),
    pendingReminders: 0,
  };

  public getPingStatus() {
    return this.lastPingStatus;
  }

  public onPing(callback: (status: { online: boolean; latencyMs: number; serverTimestamp: number; lastPingTime: number; pendingReminders: number }) => void): () => void {
    this.pingListeners.add(callback);
    callback(this.lastPingStatus);
    return () => {
      this.pingListeners.delete(callback);
    };
  }

  public async sendPing(userId?: string) {
    const effectiveUser = userId || this.currentPingUserId || '';
    const start = performance.now();
    const clientOffset = new Date().getTimezoneOffset();

    try {
      const url = `/api/ping?user_id=${encodeURIComponent(effectiveUser)}&timezone_offset_minutes=${clientOffset}&_t=${Date.now()}`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          'x-timezone-offset': String(clientOffset),
        },
      });

      const latencyMs = Math.max(1, Math.round(performance.now() - start));

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        this.lastPingStatus = {
          online: true,
          latencyMs,
          serverTimestamp: data.serverTimestamp || Date.now(),
          lastPingTime: Date.now(),
          pendingReminders: data.pending_reminders || 0,
        };
      } else {
        this.lastPingStatus = {
          ...this.lastPingStatus,
          online: false,
          latencyMs,
          lastPingTime: Date.now(),
        };
      }
    } catch (e) {
      this.lastPingStatus = {
        ...this.lastPingStatus,
        online: false,
        lastPingTime: Date.now(),
      };
    }

    // Notify Service Worker to check scheduled alarms on every ping cycle
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await (this.registration || navigator.serviceWorker.ready);
        const target = reg?.active || navigator.serviceWorker.controller;
        if (target) {
          target.postMessage({ type: 'PING', userId: effectiveUser });
        }
      }
    } catch {}

    // Broadcast status to UI subscribers
    this.pingListeners.forEach((cb) => {
      try { cb(this.lastPingStatus); } catch {}
    });

    return this.lastPingStatus;
  }

  public startRealtimeBackgroundPing(userId?: string) {
    if (userId) {
      this.currentPingUserId = userId;
    }

    // Trigger immediate ping
    this.sendPing(userId).catch(() => {});

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Ticks every 8 seconds to keep server & cloud container alive and alarms hot
    this.pingInterval = setInterval(() => {
      this.sendPing(this.currentPingUserId || undefined).catch(() => {});
    }, 8000);

    // Keep connection active and instant re-ping when user switches tabs or locks/unlocks
    if (typeof document !== 'undefined') {
      const onWake = () => {
        this.sendPing(this.currentPingUserId || undefined).catch(() => {});
      };
      document.addEventListener('visibilitychange', onWake);
      window.addEventListener('focus', onWake);
      window.addEventListener('online', onWake);
    }
  }
}

export const pushManager = new PushManagerService();
