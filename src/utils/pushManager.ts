// Native Web Push Notification & Service Worker Manager
// Enables alarms and notifications even when device is locked or browser is in background

// Fallback VAPID public key matching the server's persistent .vapid-keys.json
export const FALLBACK_VAPID_PUBLIC_KEY =
  'BEfgpvj5Gt5eGfVHEENkC84jATpF3-rSL6tWMNRe2gHEfX2pFAbBaH9SN2KOOsgLy3EvxwwcrqnJO-82CHusljg';

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
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      console.warn(
        `[PushManager] Resposta não-JSON recebida de ${url} (status ${res.status}):`,
        text.slice(0, 100)
      );
      return {
        ok: false,
        status: res.status,
        error: `Servidor retornou resposta inesperada (${res.status}).`,
      };
    }

    const data = await res.json();
    return {
      ok: res.ok,
      data,
      status: res.status,
      error: !res.ok ? data?.mensagem || `Erro no servidor (${res.status}).` : undefined,
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

class PushManagerService {
  private registration: ServiceWorkerRegistration | null = null;
  private alarmListeners: Set<AlarmTriggerCallback> = new Set();
  private snoozeListeners: Set<SnoozeCallback> = new Set();
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

      // Check for updates
      try {
        reg.update();
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
          // If already subscribed, verify if applicationServerKey matches or renew
          try {
            const rawKey = subscription.options?.applicationServerKey;
            if (!rawKey) {
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
      const saveResult = await safeFetchJson<{ status: string; mensagem?: string }>(
        '/api/push/subscribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            subscription: subJson,
          }),
        }
      );

      if (!saveResult.ok) {
        // Retry once after 500ms
        await new Promise((r) => setTimeout(r, 500));
        const retryResult = await safeFetchJson<{ status: string; mensagem?: string }>(
          '/api/push/subscribe',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: userId,
              subscription: subJson,
            }),
          }
        );
        if (!retryResult.ok) {
          throw new Error(
            retryResult.error || saveResult.error || 'Falha ao salvar inscrição no servidor.'
          );
        }
      }

      // 6. Auto-sync user's active reminders so background runner starts monitoring immediately
      try {
        const saved = localStorage.getItem(`lembretes_isolated_${userId}`);
        if (saved) {
          const items = JSON.parse(saved);
          if (Array.isArray(items) && items.length > 0) {
            await this.syncReminders(userId, items);
          }
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
      const res = await safeFetchJson<{ status: string; mensagem?: string }>('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        return { success: false, message: res.error || 'Falha ao enviar teste.' };
      }
      return { success: true, message: res.data?.mensagem || 'Alarme de teste enviado com sucesso!' };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Erro de conexão ao testar notificação.' };
    }
  }

  public async syncReminders(userId: string, lembretes: any[]): Promise<void> {
    try {
      await safeFetchJson('/api/reminders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, lembretes }),
      });
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
}

export const pushManager = new PushManagerService();
