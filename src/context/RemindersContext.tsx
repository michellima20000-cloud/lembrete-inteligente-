import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Lembrete, StatusTarefa, AiParseResponse } from '../types';
import { useUser } from './UserContext';
import { soundAlert } from '../utils/audioAlert';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { parseReminderCommand } from '../utils/reminderParser';
import { pushManager, urlBase64ToUint8Array } from '../utils/pushManager';

interface RemindersContextType {
  reminders: Lembrete[];
  isLoading: boolean;
  isProcessingAi: boolean;
  activeAlarmReminder: Lembrete | null;
  dismissAlarm: () => void;
  snoozeReminder: (id: string, minutes?: number) => Promise<void>;
  updateStatus: (id: string, status: StatusTarefa) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  processAiCommand: (params: {
    texto?: string;
    audioBase64?: string;
    audioMimeType?: string;
    antecedenciaPadrao?: number;
  }) => Promise<AiParseResponse>;
  createManualReminder: (data: {
    titulo: string;
    data_hora_execucao: string;
    antecedencia_minutos: number;
    categoria?: string;
    urgencia?: 'baixa' | 'media' | 'alta';
    recorrencia?: 'nenhuma' | 'diaria' | 'semanal';
    dias_semana?: number[];
  }) => Promise<void>;
  lastAiResponse: AiParseResponse | null;
  requestNotificationPermission: () => Promise<boolean>;
  notificationPermission: NotificationPermission;
  isPushSubscribed: boolean;
  subscribePush: () => Promise<{ success: boolean; message: string }>;
  testPushNotification: () => Promise<{ success: boolean; message: string }>;
  testPushDelayed: (seconds?: number) => Promise<{ success: boolean; message: string }>;
  unsubscribePush: () => Promise<boolean>;
  soundEnabled: boolean;
  toggleSound: () => void;
  testSound: () => void;
  isFirestoreSyncing: boolean;
  pingStatus: { online: boolean; latencyMs: number; serverTimestamp: number; lastPingTime: number; pendingReminders: number };
  triggerManualPing: () => Promise<void>;
}

const RemindersContext = createContext<RemindersContextType | null>(null);

export const RemindersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, firebaseUser } = useUser();
  const [reminders, setReminders] = useState<Lembrete[]>(() => {
    try {
      const storedAuth = localStorage.getItem('lembrete_authenticated_user');
      const storedGuest = localStorage.getItem('lembrete_guest_user');
      const activeUser = storedAuth ? JSON.parse(storedAuth) : (storedGuest ? JSON.parse(storedGuest) : null);
      if (activeUser?.id) {
        const saved = localStorage.getItem(`lembretes_isolated_${activeUser.id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            parsed.sort(
              (a: Lembrete, b: Lembrete) =>
                new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime()
            );
            return parsed;
          }
        }
      }
    } catch {}
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [lastAiResponse, setLastAiResponse] = useState<AiParseResponse | null>(null);
  const [activeAlarmReminder, setActiveAlarmReminder] = useState<Lembrete | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [isFirestoreSyncing, setIsFirestoreSyncing] = useState(false);
  const [pingStatus, setPingStatus] = useState(() => pushManager.getPingStatus());

  const triggeredIdsRef = useRef<Set<string>>((() => {
    try {
      const saved = sessionStorage.getItem('lembrete_triggered_keys');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set<string>();
  })());

  const markKeyAsTriggered = useCallback((key: string) => {
    triggeredIdsRef.current.add(key);
    try {
      sessionStorage.setItem(
        'lembrete_triggered_keys',
        JSON.stringify(Array.from(triggeredIdsRef.current))
      );
    } catch {}
  }, []);

  // Helper to load isolated partition
  const loadLocalPartition = useCallback((userId: string): Lembrete[] => {
    try {
      const saved = localStorage.getItem(`lembretes_isolated_${userId}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading partition:', e);
    }
    return [];
  }, []);

  // Helper to save isolated partition
  const saveLocalPartition = useCallback((userId: string, items: Lembrete[]) => {
    try {
      localStorage.setItem(`lembretes_isolated_${userId}`, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving partition:', e);
    }
  }, []);

  // Fetch reminders strictly filtered by active user_id
  const fetchReminders = useCallback(async () => {
    if (!currentUser?.id) return;
    setIsLoading(true);

    // Only hydrate from local storage if in-memory state is empty
    const localItems = loadLocalPartition(currentUser.id);
    setReminders((current) => (current.length === 0 && localItems.length > 0 ? localItems : current));

    try {
      const res = await fetch(`/api/reminders?user_id=${encodeURIComponent(currentUser.id)}`, {
        headers: { 'x-user-id': currentUser.id },
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (res.ok && isJson) {
        const data = await res.json();
        if (data.lembretes && Array.isArray(data.lembretes)) {
          const verified = data.lembretes.filter((item: Lembrete) => item.user_id === currentUser.id);
          setReminders((prev) => {
            const currentLocal: Lembrete[] = loadLocalPartition(currentUser.id);
            const map = new Map<string, Lembrete>();
            // 1. Preserve current React state first (so freshly added items are never dropped)
            prev.forEach((i: Lembrete) => map.set(i.id, i));
            // 2. Add local storage items
            currentLocal.forEach((i: Lembrete) => map.set(i.id, i));
            // 3. Overlay verified server items
            verified.forEach((i: Lembrete) => map.set(i.id, i));
            const merged = Array.from(map.values()).filter((i: Lembrete) => i.user_id === currentUser.id);
            merged.sort((a: Lembrete, b: Lembrete) =>
              new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime()
            );
            saveLocalPartition(currentUser.id, merged);
            pushManager.syncReminders(currentUser.id, merged);
            return merged;
          });
        }
      }
    } catch (e) {
      console.warn('Network issue or backend unreachable, using isolated local cache:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, loadLocalPartition, saveLocalPartition]);

  // Check notification permission and initialize PushManager
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    pushManager.init();

    pushManager.getExistingSubscription().then((sub) => {
      setIsPushSubscribed(!!sub);
      if (currentUser?.id) {
        if (sub || (typeof Notification !== 'undefined' && Notification.permission === 'granted')) {
          pushManager.subscribeToPush(currentUser.id).then((res) => {
            if (res.success) setIsPushSubscribed(true);
          }).catch(() => {});
        }
      }
    });

    // Listen to push alarm signals from service worker
    const unsubscribePushAlarm = pushManager.onAlarmTriggered((reminderId) => {
      soundAlert.startRingingAlarm();
      if (reminderId) {
        setReminders((currentList) => {
          const found = currentList.find((r) => r.id === reminderId);
          if (found) {
            setActiveAlarmReminder(found);
          }
          return currentList;
        });
      }
    });

    // Listen to snooze actions dispatched directly from lock screen / service worker
    const unsubscribeSnooze = pushManager.onAlarmSnoozed((reminderId) => {
      soundAlert.stopRingingAlarm();
      setActiveAlarmReminder((current) => (current?.id === reminderId ? null : current));
      fetchReminders().catch(() => {});
    });

    // Check if app was opened via notification with ?alarm_reminder_id=
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const alarmReminderId = urlParams.get('alarm_reminder_id');
      if (alarmReminderId) {
        soundAlert.startRingingAlarm();
        setReminders((currentList) => {
          const found = currentList.find((r) => r.id === alarmReminderId);
          if (found) {
            setActiveAlarmReminder(found);
          }
          return currentList;
        });
        window.history.replaceState({}, '', '/');
      }
    }

    return () => {
      unsubscribePushAlarm();
      unsubscribeSnooze();
    };
  }, [currentUser?.id, fetchReminders]);

  // Real-time Background Ping & Cloud Heartbeat Engine
  useEffect(() => {
    const unsubPing = pushManager.onPing((status) => {
      setPingStatus(status);
    });
    pushManager.startRealtimeBackgroundPing(currentUser?.id);
    return () => {
      unsubPing();
    };
  }, [currentUser?.id]);

  const triggerManualPing = async () => {
    const status = await pushManager.sendPing(currentUser?.id);
    setPingStatus(status);
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted' && currentUser?.id) {
        subscribePush().catch(() => {});
      }
      return permission === 'granted';
    } catch (e) {
      console.warn('Could not request notification permission:', e);
      return false;
    }
  };

  const subscribePush = async () => {
    if (!currentUser?.id) return { success: false, message: 'Usuário não logado.' };
    
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        if (perm !== 'granted') {
          return { success: false, message: 'Permissão de notificação negada no navegador.' };
        }
      }

      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      
      if (!sub) {
        const resPublic = await fetch('/api/push/vapid-public-key');
        const keyData = await resPublic.json();
        
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as unknown as BufferSource,
        });
      }

      // Registra a assinatura na rota estável do servidor
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          subscription: sub.toJSON()
        })
      });

      // Envia os lembretes locais para o servidor monitorar na nuvem
      await fetch('/api/reminders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, lembretes: reminders })
      });

      setIsPushSubscribed(true);
      setNotificationPermission('granted');
      return { success: true, message: 'Inscrição realizada!' };
    } catch (err: any) {
      console.error('Falha ao registrar push:', err);
      return { success: false, message: err?.message || 'Falha ao registrar push.' };
    }
  };

  const testPushNotification = async () => {
    if (!currentUser?.id) {
      return { success: false, message: 'Usuário não autenticado.' };
    }
    // Dispara teste imediato local via Notifications API (serviceWorker.showNotification)
    await pushManager.showSystemNotification('⏰ Teste de Notificação de Sistema', {
      body: 'O serviço de notificações do sistema operacional está 100% ativo fora do navegador!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'test_local_' + Date.now(),
      requireInteraction: true,
      vibrate: [600, 200, 600, 200, 600, 200, 800],
    });
    return await pushManager.testPush(currentUser.id);
  };

  const testPushDelayed = async (seconds = 5) => {
    if (!currentUser?.id) {
      return { success: false, message: 'Usuário não autenticado.' };
    }
    return await pushManager.testPushDelayed(currentUser.id, seconds);
  };

  const unsubscribePush = async () => {
    if (!currentUser?.id) return false;
    const ok = await pushManager.unsubscribeFromPush(currentUser.id);
    if (ok) {
      setIsPushSubscribed(false);
    }
    return ok;
  };

  // Firestore Realtime Listener for active user's subcollection
  useEffect(() => {
    if (!currentUser?.id) return;

    // Keep cached partition immediately available so timers and UI never reset to empty
    const local = loadLocalPartition(currentUser.id);
    if (local && local.length > 0) {
      setReminders(local);
      pushManager.syncReminders(currentUser.id, local);
    }
    fetchReminders();

    // Only attach Firestore realtime listener if user is authenticated with Firebase Auth
    if (!firebaseUser || !auth.currentUser || auth.currentUser.uid !== currentUser.id || auth.currentUser.isAnonymous) {
      setIsFirestoreSyncing(false);
      return;
    }

    const remindersPath = `users/${currentUser.id}/reminders`;
    let unsubscribe = () => {};

    try {
      const colRef = collection(db, 'users', currentUser.id, 'reminders');
      unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          setIsFirestoreSyncing(true);
          const fbItems: Lembrete[] = [];
          snapshot.forEach((docSnap) => {
            fbItems.push(docSnap.data() as Lembrete);
          });

          // Upload any local items not yet in Firestore to guarantee complete cloud synchronization
          const localItems = loadLocalPartition(currentUser.id);
          const fbIdSet = new Set(fbItems.map((i) => i.id));
          const missingInFirestore = localItems.filter((i) => !fbIdSet.has(i.id));
          if (missingInFirestore.length > 0 && auth.currentUser && auth.currentUser.uid === currentUser.id) {
            missingInFirestore.forEach((item) => {
              setDoc(doc(db, 'users', currentUser.id, 'reminders', item.id), item).catch((err) => {
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.id}/reminders/${item.id}`);
              });
            });
          }

          setReminders((prev) => {
            const map = new Map<string, Lembrete>();
            // Keep currently rendered optimistic items
            prev.forEach((i) => map.set(i.id, i));
            // Keep local items
            localItems.forEach((i) => map.set(i.id, i));
            // Overlay Firestore items
            fbItems.forEach((i) => map.set(i.id, i));
            const verified = Array.from(map.values()).filter((i) => i.user_id === currentUser.id);
            verified.sort(
              (a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime()
            );
            saveLocalPartition(currentUser.id, verified);
            pushManager.syncReminders(currentUser.id, verified);
            return verified;
          });
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, remindersPath);
          setIsFirestoreSyncing(false);
          try {
            unsubscribe();
          } catch {}
        }
      );
    } catch (err) {
      console.warn('Firestore snapshot setup deferred to offline/REST mode:', err);
      setIsFirestoreSyncing(false);
    }

    return () => {
      try {
        unsubscribe();
      } catch {}
    };
  }, [currentUser?.id, firebaseUser, fetchReminders, loadLocalPartition, saveLocalPartition]);

  // Disparar aviso de sistema via Notifications API (serviceWorker.showNotification)
  // Garantindo que o alerta apareça fora do navegador, na área de notificações do sistema operacional.
  const triggerPushNotification = async (item: Lembrete, isAntecedencia = false) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
        setNotificationPermission(permission);
      } catch {
        permission = Notification.permission;
      }
    }
    if (permission !== 'granted') return;

    let timeFormatted = '';
    try {
      if (item.data_hora_execucao) {
        timeFormatted = new Date(item.data_hora_execucao).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch {}

    const title = isAntecedencia
      ? `⏰ AVISO PRÉVIO: ${item.titulo}`
      : `⏰ ALARME: ${item.titulo}`;
    const body = isAntecedencia
      ? `Aviso de antecedência (${item.antecedencia_minutos} min antes) para seu compromisso${timeFormatted ? ` das ${timeFormatted}` : ''}!`
      : `Horário do compromisso alcançado${timeFormatted ? ` (${timeFormatted})` : ''}: ${item.titulo}! Toque para ver ou adiar.`;

    const tag = `${item.id}_${isAntecedencia ? 'ant' : 'exec'}`;

    // Disparar via serviceWorker.showNotification através do pushManager
    try {
      await pushManager.showSystemNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        renotify: true,
        requireInteraction: true, // Mantém o alerta na tela fora do navegador até interação
        silent: false,
        vibrate: [800, 250, 800, 250, 800, 250, 1200],
        data: {
          id: item.id,
          reminderId: item.id,
          url: `/?alarm_reminder_id=${item.id}`,
          triggerType: isAntecedencia ? 'ant' : 'exec',
        },
        actions: [
          { action: 'open', title: '🔔 Abrir Alarme' },
          { action: 'snooze', title: '⏰ Adiar 10m' },
          { action: 'complete', title: '✅ Concluir' },
        ],
      } as any);
    } catch (e) {
      console.warn('[RemindersContext] Falha ao disparar notificação de sistema:', e);
    }
  };

  // Check due reminders and fire full audio + notification + modal alarm
  const checkDueReminders = useCallback(() => {
    if (!reminders || reminders.length === 0) return;
    const nowMs = Date.now();

    reminders.forEach((item) => {
      if (item.status_tarefa === 'concluído') return;

      let targetTime = Number(item.timestamp_execucao);
      if (!targetTime || isNaN(targetTime)) {
        targetTime = new Date(item.data_hora_execucao).getTime();
      }
      if (!targetTime || isNaN(targetTime)) return;

      const antMin = item.antecedencia_minutos || 0;

      // 1. Antecedência notification (if configured and due within last 30 minutes)
      if (antMin > 0) {
        const antTriggerTime = targetTime - antMin * 60 * 1000;
        const diffAnt = nowMs - antTriggerTime;
        const antKey = `ant_${item.id}_${antMin}_${item.data_hora_execucao}`;
        if (diffAnt >= 0 && diffAnt < 30 * 60 * 1000 && !triggeredIdsRef.current.has(antKey)) {
          markKeyAsTriggered(antKey);
          soundAlert.startRingingAlarm(item.titulo);
          setActiveAlarmReminder(item);
          triggerPushNotification(item, true);
        }
      }

      // 2. Exact Execution Time alarm (when time arrives or up to 24h ago)
      const diffExec = nowMs - targetTime;
      const execKey = `exec_${item.id}_${item.data_hora_execucao}`;
      if (diffExec >= 0 && diffExec < 24 * 60 * 60 * 1000 && !triggeredIdsRef.current.has(execKey)) {
        markKeyAsTriggered(execKey);
        soundAlert.startRingingAlarm(item.titulo);
        setActiveAlarmReminder(item);
        triggerPushNotification(item, false);
      }
    });
  }, [reminders, markKeyAsTriggered]);

  // Real-time tick to check reminders due using interval, background Web Worker, and multi-event wake
  useEffect(() => {
    checkDueReminders();
    soundAlert.startBackgroundKeepAlive();

    const interval = setInterval(checkDueReminders, 1500);

    // Dedicated background Web Worker (immune to inactive tab timer throttling)
    let worker: Worker | null = null;
    try {
      worker = new Worker('/alarmWorker.js');
      worker.postMessage('START');
      worker.onmessage = () => {
        checkDueReminders();
      };
    } catch (e) {
      console.warn('Web Worker fallback to interval:', e);
    }

    // Instant alarm evaluation and AudioContext unfreezing when user returns, unlocks screen, or taps
    const handleImmediateWake = () => {
      checkDueReminders();
      if (soundAlert.getIsRinging() || activeAlarmReminder) {
        soundAlert.startRingingAlarm();
      }
    };

    document.addEventListener('visibilitychange', handleImmediateWake);
    window.addEventListener('focus', handleImmediateWake);
    window.addEventListener('pageshow', handleImmediateWake);
    window.addEventListener('pointerdown', handleImmediateWake, { passive: true });
    window.addEventListener('touchstart', handleImmediateWake, { passive: true });

    return () => {
      clearInterval(interval);
      if (worker) {
        try {
          worker.postMessage('STOP');
          worker.terminate();
        } catch {}
      }
      document.removeEventListener('visibilitychange', handleImmediateWake);
      window.removeEventListener('focus', handleImmediateWake);
      window.removeEventListener('pageshow', handleImmediateWake);
      window.removeEventListener('pointerdown', handleImmediateWake);
      window.removeEventListener('touchstart', handleImmediateWake);
    };
  }, [checkDueReminders, activeAlarmReminder]);

  // Mobile Screen Wake Lock: keeps device screen on and active while alarm is ringing
  useEffect(() => {
    let wakeLockSentinel: any = null;
    if (activeAlarmReminder && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (navigator as any).wakeLock
        .request('screen')
        .then((sentinel: any) => {
          wakeLockSentinel = sentinel;
        })
        .catch(() => {});
    }
    return () => {
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch {}
      }
    };
  }, [activeAlarmReminder]);

  // Tab Title Flashing alert when alarm is ringing in background tab
  useEffect(() => {
    if (!activeAlarmReminder) {
      document.title = 'Lembrete Inteligente';
      return;
    }

    let toggle = false;
    const titleInterval = setInterval(() => {
      toggle = !toggle;
      document.title = toggle
        ? `🚨 [ALARME] ${activeAlarmReminder.titulo}`
        : `⏰ Horário de: ${activeAlarmReminder.titulo}`;
    }, 900);

    return () => {
      clearInterval(titleInterval);
      document.title = 'Lembrete Inteligente';
    };
  }, [activeAlarmReminder]);

  const dismissAlarm = () => {
    soundAlert.stopRingingAlarm();
    setActiveAlarmReminder(null);
  };

  // Helper to sync single item to Firestore
  const syncItemToFirestore = async (item: Lembrete) => {
    if (!currentUser?.id) return;
    if (!auth.currentUser || auth.currentUser.uid !== currentUser.id || auth.currentUser.isAnonymous) return;
    const path = `users/${currentUser.id}/reminders/${item.id}`;
    try {
      await setDoc(doc(db, 'users', currentUser.id, 'reminders', item.id), item);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  // Helper to delete item from Firestore
  const deleteItemFromFirestore = async (id: string) => {
    if (!currentUser?.id) return;
    if (!auth.currentUser || auth.currentUser.uid !== currentUser.id || auth.currentUser.isAnonymous) return;
    const path = `users/${currentUser.id}/reminders/${id}`;
    try {
      await deleteDoc(doc(db, 'users', currentUser.id, 'reminders', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  // Snooze by N minutes (default: 10 minutes)
  const snoozeReminder = async (id: string, minutes = 10) => {
    soundAlert.stopRingingAlarm();
    if (!currentUser?.id) return;

    // Calculate new execution time
    const existing = reminders.find((r) => r.id === id);
    const currentMs = existing ? (Number(existing.timestamp_execucao) || new Date(existing.data_hora_execucao).getTime()) : Date.now();
    const base = Math.max(Date.now(), currentMs);
    const newTargetMs = base + minutes * 60 * 1000;
    const newExec = new Date(newTargetMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    const newExecTime = `${newExec.getFullYear()}-${pad(newExec.getMonth() + 1)}-${pad(newExec.getDate())}T${pad(newExec.getHours())}:${pad(newExec.getMinutes())}:${pad(newExec.getSeconds())}`;

    if (existing) {
      const updatedItem: Lembrete = {
        ...existing,
        data_hora_execucao: newExecTime,
        timestamp_execucao: newTargetMs,
        status_tarefa: 'adiado',
        adiado_vezes: (existing.adiado_vezes || 0) + 1,
      };
      syncItemToFirestore(updatedItem);

      setReminders((prev) => {
        const updated = prev.map((item) => (item.id === id ? updatedItem : item));
        updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
        saveLocalPartition(currentUser.id, updated);
        pushManager.syncReminders(currentUser.id, updated);
        return updated;
      });
      soundAlert.playSuccess();
    }

    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          adiar_minutos: minutes,
        }),
      });
    } catch (e) {
      // Backend not running (e.g. static hosting on Vercel)
    } finally {
      if (activeAlarmReminder?.id === id) {
        setActiveAlarmReminder(null);
      }
    }
  };

  const updateStatus = async (id: string, status: StatusTarefa) => {
    soundAlert.stopRingingAlarm();
    if (!currentUser?.id) return;

    const existing = reminders.find((r) => r.id === id);
    if (existing) {
      const updatedItem: Lembrete = {
        ...existing,
        status_tarefa: status,
      };
      syncItemToFirestore(updatedItem);
    }

    if (status === 'concluído') {
      soundAlert.playSuccess();
    }

    setReminders((prev) => {
      const updated = prev.map((item) => (item.id === id ? { ...item, status_tarefa: status } : item));
      updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
      saveLocalPartition(currentUser.id, updated);
      pushManager.syncReminders(currentUser.id, updated);
      return updated;
    });

    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          status_tarefa: status,
        }),
      });
    } catch (e) {
      // Backend not running (e.g. static hosting on Vercel)
    } finally {
      if (activeAlarmReminder?.id === id) {
        setActiveAlarmReminder(null);
      }
    }
  };

  // Listen to lock screen / media notification interactions (Pause, Stop, Next = Snooze, Prev = Concluir)
  useEffect(() => {
    const unsub = soundAlert.onMediaSessionAction((action) => {
      if (action === 'pause' || action === 'stop') {
        soundAlert.stopRingingAlarm();
        setActiveAlarmReminder(null);
      } else if (action === 'nexttrack') {
        if (activeAlarmReminder?.id) {
          snoozeReminder(activeAlarmReminder.id, 10).catch(() => {});
        } else {
          soundAlert.stopRingingAlarm();
          setActiveAlarmReminder(null);
        }
      } else if (action === 'previoustrack') {
        if (activeAlarmReminder?.id) {
          updateStatus(activeAlarmReminder.id, 'concluído').catch(() => {});
        } else {
          soundAlert.stopRingingAlarm();
          setActiveAlarmReminder(null);
        }
      }
    });
    return () => {
      unsub();
    };
  }, [activeAlarmReminder]);

  const deleteReminder = async (id: string) => {
    if (!currentUser?.id) return;
    deleteItemFromFirestore(id);

    setReminders((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveLocalPartition(currentUser.id, updated);
      pushManager.syncReminders(currentUser.id, updated);
      return updated;
    });

    try {
      await fetch(`/api/reminders/${id}?user_id=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id },
      });
    } catch (e) {
      console.warn('Backend delete notification deferred:', e);
    }
  };

  const processAiCommand = async (params: {
    texto?: string;
    audioBase64?: string;
    audioMimeType?: string;
    antecedenciaPadrao?: number;
  }): Promise<AiParseResponse> => {
    const effectiveUserId = currentUser?.id || auth.currentUser?.uid || 'user_local';
    setIsProcessingAi(true);

    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const localIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      let data: AiParseResponse;

      try {
        const res = await fetch('/api/lembrete/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: effectiveUserId,
            texto: params.texto,
            currentLocalTime: localIso,
            referenceTimestamp: now.getTime(),
            timezoneOffsetMinutes: now.getTimezoneOffset(),
            fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone,
            antecedencia_padrao: params.antecedenciaPadrao || 0,
          }),
        });

        const isJson = res.headers.get('content-type')?.includes('application/json');
        if (isJson) {
          const json = await res.json();
          if (json.status === 'erro') {
            throw new Error(json.mensagem || json.mensagem_sistema || 'Não foi possível interpretar o lembrete.');
          }
          if (json.lembrete) {
            data = json;
          } else {
            throw new Error('Resposta inválida do servidor');
          }
        } else {
          throw new Error('Falha de conexão com o servidor');
        }
      } catch (err: any) {
        // If it was already a specific user-facing validation error from the server, rethrow it
        if (
          err?.message &&
          (err.message.includes('informe') ||
            err.message.includes('tarefa') ||
            err.message.includes('obrigatório') ||
            err.message.includes('Nenhum texto'))
        ) {
          throw err;
        }

        // Local client parser fallback for offline or network issues
        const parsed = parseReminderCommand({
          texto: params.texto || '',
          referenceTime: localIso,
          referenceTimestamp: now.getTime(),
          timezoneOffsetMinutes: now.getTimezoneOffset(),
          user_id: effectiveUserId,
          antecedencia_padrao: params.antecedenciaPadrao || 0,
        });

        if (parsed.status === 'erro') {
          throw new Error(parsed.mensagem_sistema);
        }

        const newId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        data = {
          status: 'sucesso',
          user_id: effectiveUserId,
          lembrete: {
            id: newId,
            ...parsed.lembrete,
          },
          mensagem_sistema: parsed.mensagem_sistema,
        };
      }

      setLastAiResponse(data);
      soundAlert.playChime();

      // If reminder was generated, sync to Firestore and local partition
      if (data.lembrete && data.lembrete.id) {
        const fullItem: Lembrete = {
          id: data.lembrete.id,
          user_id: effectiveUserId,
          titulo: data.lembrete.titulo,
          data_hora_execucao: data.lembrete.data_hora_execucao,
          timestamp_execucao: data.lembrete.timestamp_execucao || new Date(data.lembrete.data_hora_execucao).getTime(),
          timezone_offset_minutes: data.lembrete.timezone_offset_minutes ?? now.getTimezoneOffset(),
          antecedencia_minutos: data.lembrete.antecedencia_minutos || 0,
          status_tarefa: data.lembrete.status_tarefa,
          categoria: data.lembrete.categoria,
          urgencia: data.lembrete.urgencia,
          criado_em: new Date().toISOString(),
          adiado_vezes: 0,
        };

        // 1. Calculate new updated list immediately
        const currentList = loadLocalPartition(effectiveUserId);
        const updated = [...currentList.filter((i) => i.id !== fullItem.id), fullItem];
        updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());

        // 2. Immediately persist to localStorage and sync to Service Worker's IndexedDB / OS TimestampTrigger
        saveLocalPartition(effectiveUserId, updated);
        if (currentUser?.id && currentUser.id !== effectiveUserId) {
          saveLocalPartition(currentUser.id, updated);
        }
        pushManager.syncReminders(effectiveUserId, updated);
        setReminders(updated);

        // 3. Realtime cloud backup to Firestore
        syncItemToFirestore(fullItem);

        // Trigger notification permission dialog on user gesture if not yet granted
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          requestNotificationPermission().catch(() => {});
        }
      }

      await fetchReminders().catch(() => {});
      return data;
    } finally {
      setIsProcessingAi(false);
    }
  };

  const createManualReminder = async (data: {
    titulo: string;
    data_hora_execucao: string;
    antecedencia_minutos: number;
    categoria?: string;
    urgencia?: 'baixa' | 'media' | 'alta';
    recorrencia?: 'nenhuma' | 'diaria' | 'semanal';
    dias_semana?: number[];
  }) => {
    if (!currentUser?.id) return;

    const newId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const calculatedTs = new Date(data.data_hora_execucao).getTime();
    const fullItem: Lembrete = {
      id: newId,
      user_id: currentUser.id,
      titulo: data.titulo.trim(),
      data_hora_execucao: data.data_hora_execucao,
      timestamp_execucao: !isNaN(calculatedTs) ? calculatedTs : Date.now(),
      timezone_offset_minutes: new Date().getTimezoneOffset(),
      antecedencia_minutos: Number(data.antecedencia_minutos) || 0,
      status_tarefa: 'pendente',
      categoria: data.categoria || 'Geral',
      urgencia: data.urgencia || 'media',
      recorrencia: data.recorrencia || 'nenhuma',
      dias_semana: data.dias_semana || [],
      criado_em: new Date().toISOString(),
      adiado_vezes: 0,
    };

    // 1. Calculate new updated list immediately
    const currentList = loadLocalPartition(currentUser.id);
    const updated = [...currentList.filter((i) => i.id !== fullItem.id), fullItem];
    updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());

    // 2. Immediately persist to localStorage and sync to Service Worker's IndexedDB / OS TimestampTrigger
    saveLocalPartition(currentUser.id, updated);
    pushManager.syncReminders(currentUser.id, updated);
    setReminders(updated);

    // 3. Realtime cloud backup to Firestore
    syncItemToFirestore(fullItem);
    soundAlert.playSuccess();

    // 4. Trigger notification permission dialog on user gesture if not yet granted
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      requestNotificationPermission().catch(() => {});
    }

    // 5. Notify backend API asynchronously without blocking client
    try {
      fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullItem),
      }).then(() => fetchReminders()).catch(() => {});
    } catch (e) {
      // Backend not running (e.g. serverless on Vercel)
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundAlert.setSoundEnabled(next);
    if (next) {
      soundAlert.playChime();
    }
  };

  const testSound = () => {
    soundAlert.playAlarm();
  };

  return (
    <RemindersContext.Provider
      value={{
        reminders,
        isLoading,
        isProcessingAi,
        activeAlarmReminder,
        dismissAlarm,
        snoozeReminder,
        updateStatus,
        deleteReminder,
        processAiCommand,
        createManualReminder,
        lastAiResponse,
        requestNotificationPermission,
        notificationPermission,
        isPushSubscribed,
        subscribePush,
        testPushNotification,
        testPushDelayed,
        unsubscribePush,
        soundEnabled,
        toggleSound,
        testSound,
        isFirestoreSyncing,
        pingStatus,
        triggerManualPing,
      }}
    >
      {children}
    </RemindersContext.Provider>
  );
};

export const useReminders = () => {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used within RemindersProvider');
  return ctx;
};
