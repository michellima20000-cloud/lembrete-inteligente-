import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Lembrete, StatusTarefa, AiParseResponse } from '../types';
import { useUser } from './UserContext';
import { soundAlert } from '../utils/audioAlert';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { parseReminderCommand } from '../utils/reminderParser';

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
  }) => Promise<void>;
  lastAiResponse: AiParseResponse | null;
  requestNotificationPermission: () => Promise<boolean>;
  notificationPermission: NotificationPermission;
  soundEnabled: boolean;
  toggleSound: () => void;
  testSound: () => void;
  isFirestoreSyncing: boolean;
}

const RemindersContext = createContext<RemindersContextType | null>(null);

export const RemindersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useUser();
  const [reminders, setReminders] = useState<Lembrete[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [lastAiResponse, setLastAiResponse] = useState<AiParseResponse | null>(null);
  const [activeAlarmReminder, setActiveAlarmReminder] = useState<Lembrete | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isFirestoreSyncing, setIsFirestoreSyncing] = useState(false);

  const triggeredIdsRef = useRef<Set<string>>(new Set());

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === 'granted';
    } catch (e) {
      console.warn('Could not request notification permission:', e);
      return false;
    }
  };

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

    // First load from local storage cache for instant UI rendering
    const localItems = loadLocalPartition(currentUser.id);
    setReminders(localItems);

    try {
      const res = await fetch(`/api/reminders?user_id=${encodeURIComponent(currentUser.id)}`, {
        headers: { 'x-user-id': currentUser.id },
      });
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (res.ok && isJson) {
        const data = await res.json();
        if (data.lembretes && Array.isArray(data.lembretes)) {
          const verified = data.lembretes.filter((item: Lembrete) => item.user_id === currentUser.id);
          verified.sort((a: Lembrete, b: Lembrete) =>
            new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime()
          );
          setReminders(verified);
          saveLocalPartition(currentUser.id, verified);
        }
      }
    } catch (e) {
      console.warn('Network issue or backend unreachable, using isolated local cache:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, loadLocalPartition, saveLocalPartition]);

  // Firestore Realtime Listener for active user's subcollection
  useEffect(() => {
    if (!currentUser?.id) return;

    triggeredIdsRef.current.clear();
    setReminders([]);
    setActiveAlarmReminder(null);
    fetchReminders();

    const remindersPath = `users/${currentUser.id}/reminders`;
    let unsubscribe = () => {};

    try {
      const colRef = collection(db, 'users', currentUser.id, 'reminders');
      unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          setIsFirestoreSyncing(true);
          if (!snapshot.empty) {
            const fbItems: Lembrete[] = [];
            snapshot.forEach((docSnap) => {
              fbItems.push(docSnap.data() as Lembrete);
            });

            // Enforce strict user_id isolation
            const verified = fbItems.filter((i) => i.user_id === currentUser.id);
            verified.sort(
              (a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime()
            );

            setReminders(verified);
            saveLocalPartition(currentUser.id, verified);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, remindersPath);
          setIsFirestoreSyncing(false);
        }
      );
    } catch (err) {
      console.warn('Firestore snapshot setup deferred to offline/REST mode:', err);
    }

    return () => {
      unsubscribe();
    };
  }, [currentUser?.id, fetchReminders, saveLocalPartition]);

  // Send Background Notification via Service Worker (Android Chrome / PWA) or Notification API
  const triggerPushNotification = async (item: Lembrete) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const title = `⏰ ALARME: ${item.titulo}`;
    const body =
      item.antecedencia_minutos > 0
        ? `Aviso de antecedência (${item.antecedencia_minutos} min antes) para seu compromisso!`
        : `Horário do compromisso alcançado: ${item.titulo}!`;

    // 1. Android Chrome / PWA Service Worker notification (Supports vibration & background wake)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: item.id,
            renotify: true,
            requireInteraction: true,
            vibrate: [600, 200, 600, 200, 600, 200, 800],
            data: { id: item.id },
          } as any);
          return;
        }
      } catch (swErr) {
        console.warn('Service worker showNotification notice:', swErr);
      }
    }

    // 2. Desktop & iOS Safari fallback
    try {
      const notif = new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: item.id,
        requireInteraction: true,
      } as any);
      notif.onclick = () => {
        window.focus();
      };
    } catch (e) {
      console.warn('Fallback Notification constructor failed:', e);
    }
  };

  // Real-time tick to check reminders due
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const nowMs = now.getTime();

      reminders.forEach((item) => {
        if (item.status_tarefa === 'concluído') return;

        const targetTime = new Date(item.data_hora_execucao).getTime();
        const antecedenciaMs = (item.antecedencia_minutos || 0) * 60 * 1000;
        const triggerTime = targetTime - antecedenciaMs;

        const diff = nowMs - triggerTime;
        const triggerKey = `${item.id}_${item.data_hora_execucao}`;

        // 5-minute window to tolerate background tab throttling
        if (diff >= 0 && diff < 300000 && !triggeredIdsRef.current.has(triggerKey)) {
          triggeredIdsRef.current.add(triggerKey);

          soundAlert.startRingingAlarm();
          setActiveAlarmReminder(item);
          triggerPushNotification(item);
        }
      });
    }, 2500);

    return () => clearInterval(interval);
  }, [reminders]);

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
    const base = Math.max(Date.now(), existing ? new Date(existing.data_hora_execucao).getTime() : Date.now());
    const newExecTime = new Date(base + minutes * 60 * 1000).toISOString().slice(0, 19);

    if (existing) {
      const updatedItem: Lembrete = {
        ...existing,
        data_hora_execucao: newExecTime,
        status_tarefa: 'adiado',
        adiado_vezes: (existing.adiado_vezes || 0) + 1,
      };
      syncItemToFirestore(updatedItem);

      setReminders((prev) => {
        const updated = prev.map((item) => (item.id === id ? updatedItem : item));
        updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
        saveLocalPartition(currentUser.id, updated);
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

  const deleteReminder = async (id: string) => {
    if (!currentUser?.id) return;
    deleteItemFromFirestore(id);

    setReminders((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveLocalPartition(currentUser.id, updated);
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
            fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone,
            antecedencia_padrao: params.antecedenciaPadrao || 0,
          }),
        });

        const isJson = res.headers.get('content-type')?.includes('application/json');
        if (res.ok && isJson) {
          const json = await res.json();
          if (json.status !== 'erro' && json.lembrete) {
            data = json;
          } else {
            throw new Error(json.mensagem_sistema || 'Fallback parsing');
          }
        } else {
          throw new Error('Fallback parsing');
        }
      } catch (networkErr) {
        // ROBUST MOBILE RESILIENCE:
        // Execute client-side deterministic parser if network is slow, offline, or returns error
        console.warn('Network issue or offline, executing local client parser fallback:', networkErr);
        const parsed = parseReminderCommand({
          texto: params.texto || '',
          referenceTime: localIso,
          user_id: effectiveUserId,
          antecedencia_padrao: params.antecedenciaPadrao || 0,
        });

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
          antecedencia_minutos: data.lembrete.antecedencia_minutos || 0,
          status_tarefa: data.lembrete.status_tarefa,
          categoria: data.lembrete.categoria,
          urgencia: data.lembrete.urgencia,
          criado_em: new Date().toISOString(),
          adiado_vezes: 0,
        };

        syncItemToFirestore(fullItem);

        // Update local state immediately so UI responds with 0ms delay
        setReminders((prev) => {
          const updated = [...prev.filter((i) => i.id !== fullItem.id), fullItem];
          updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
          saveLocalPartition(effectiveUserId, updated);
          return updated;
        });
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
  }) => {
    if (!currentUser?.id) return;

    const newId = 'rem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const fullItem: Lembrete = {
      id: newId,
      user_id: currentUser.id,
      titulo: data.titulo.trim(),
      data_hora_execucao: data.data_hora_execucao,
      antecedencia_minutos: Number(data.antecedencia_minutos) || 0,
      status_tarefa: 'pendente',
      categoria: data.categoria || 'Geral',
      urgencia: data.urgencia || 'media',
      criado_em: new Date().toISOString(),
      adiado_vezes: 0,
    };

    // 1. Instantly update UI and localStorage
    setReminders((prev) => {
      const updated = [...prev.filter((i) => i.id !== fullItem.id), fullItem];
      updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
      saveLocalPartition(currentUser.id, updated);
      return updated;
    });

    // 2. Realtime sync to Firestore
    syncItemToFirestore(fullItem);
    soundAlert.playSuccess();

    // 3. Notify backend API if available
    try {
      await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullItem),
      });
    } catch (e) {
      // Backend not running (e.g. static hosting on Vercel)
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
        soundEnabled,
        toggleSound,
        testSound,
        isFirestoreSyncing,
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
