// Native Web Push Notification & Service Worker Manager
// Enables alarms and notifications even when device is locked or browser is in background

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

type AlarmTriggerCallback = (reminderId?: string) => void;

class PushManagerService {
  private registration: ServiceWorkerRegistration | null = null;
  private alarmListeners: Set<AlarmTriggerCallback> = new Set();
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
      // Register standard service worker with broad scope
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.registration = reg;
      console.log('[PushManager] Service Worker registrado com escopo:', reg.scope);

      // Listen for background push message signals from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (!event.data) return;
        if (event.data.type === 'TRIGGER_ALARM' || event.data.type === 'PUSH_ALARM_RECEIVED') {
          console.log('[PushManager] Sinal de alarme recebido do Service Worker:', event.data);
          this.alarmListeners.forEach((cb) => cb(event.data.reminderId));
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
      // 1. Request notification permission
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

      // 3. Fetch VAPID Public Key from backend
      const vapidRes = await fetch('/api/push/vapid-public-key');
      const vapidJson = await vapidRes.json();
      if (!vapidJson.publicKey) {
        throw new Error('Chave pública VAPID não retornada pelo servidor.');
      }

      const applicationServerKey = urlBase64ToUint8Array(vapidJson.publicKey);

      // 4. Subscribe to PushManager
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as unknown as BufferSource,
        });
      }

      // 5. Send subscription to backend linked to user_id
      const subJson = subscription.toJSON();
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          subscription: subJson,
        }),
      });

      const saveJson = await saveRes.json();
      if (!saveRes.ok || saveJson.status === 'erro') {
        throw new Error(saveJson.mensagem || 'Falha ao salvar inscrição no servidor.');
      }

      return {
        success: true,
        message: 'Notificações em segundo plano ativadas com sucesso! Você receberá alarmes mesmo com a tela bloqueada.',
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
        await fetch('/api/push/unsubscribe', {
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
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok || data.status === 'erro') {
        return { success: false, message: data.mensagem || 'Falha ao enviar teste.' };
      }
      return { success: true, message: data.mensagem };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Erro de conexão ao testar notificação.' };
    }
  }

  public async syncReminders(userId: string, lembretes: any[]): Promise<void> {
    try {
      await fetch('/api/reminders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, lembretes }),
      });
    } catch (e) {
      // Non-blocking sync
    }
  }

  public onAlarmTriggered(callback: AlarmTriggerCallback): () => void {
    this.alarmListeners.add(callback);
    return () => {
      this.alarmListeners.delete(callback);
    };
  }
}

export const pushManager = new PushManagerService();
