import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Lembrete, StatusTarefa, AiParseResponse } from '../types';
import { useUser } from './UserContext';
import { soundAlert } from '../utils/audioAlert';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

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
      if (res.ok) {
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

        if (diff >= 0 && diff < 90000 && !triggeredIdsRef.current.has(triggerKey)) {
          triggeredIdsRef.current.add(triggerKey);

          soundAlert.playAlarm();
          setActiveAlarmReminder(item);

          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`⏰ Lembrete: ${item.titulo}`, {
                body:
                  item.antecedencia_minutos > 0
                    ? `Compromisso agendado com antecedência de ${item.antecedencia_minutos} min!`
                    : `Horário do compromisso alcançado!`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: item.id,
              });
            } catch (err) {
              console.warn('Push notification failed:', err);
            }
          }
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [reminders]);

  const dismissAlarm = () => {
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
    }

    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          adiar_minutos: minutes,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        soundAlert.playSuccess();
        setReminders((prev) => {
          const updated = prev.map((item) => (item.id === id ? data.lembrete : item));
          updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
          saveLocalPartition(currentUser.id, updated);
          return updated;
        });
      } else {
        setReminders((prev) => {
          const updated = prev.map((item) => {
            if (item.id === id) {
              return {
                ...item,
                data_hora_execucao: newExecTime,
                status_tarefa: 'adiado' as StatusTarefa,
                adiado_vezes: (item.adiado_vezes || 0) + 1,
              };
            }
            return item;
          });
          updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
          saveLocalPartition(currentUser.id, updated);
          return updated;
        });
      }
    } catch (e) {
      console.error('Error snoozing reminder:', e);
    } finally {
      if (activeAlarmReminder?.id === id) {
        setActiveAlarmReminder(null);
      }
    }
  };

  const updateStatus = async (id: string, status: StatusTarefa) => {
    if (!currentUser?.id) return;

    const existing = reminders.find((r) => r.id === id);
    if (existing) {
      const updatedItem: Lembrete = {
        ...existing,
        status_tarefa: status,
      };
      syncItemToFirestore(updatedItem);
    }

    try {
      if (status === 'concluído') {
        soundAlert.playSuccess();
      }

      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          status_tarefa: status,
        }),
      });

      setReminders((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, status_tarefa: status } : item));
        updated.sort((a, b) => new Date(a.data_hora_execucao).getTime() - new Date(b.data_hora_execucao).getTime());
        saveLocalPartition(currentUser.id, updated);
        return updated;
      });
    } catch (e) {
      console.error('Error updating status:', e);
    } finally {
      if (activeAlarmReminder?.id === id) {
        setActiveAlarmReminder(null);
      }
    }
  };

  const deleteReminder = async (id: string) => {
    if (!currentUser?.id) return;
    deleteItemFromFirestore(id);

    try {
      await fetch(`/api/reminders/${id}?user_id=${encodeURIComponent(currentUser.id)}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id },
      });

      setReminders((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        saveLocalPartition(currentUser.id, updated);
        return updated;
      });
    } catch (e) {
      console.error('Error deleting reminder:', e);
    }
  };

  const processAiCommand = async (params: {
    texto?: string;
    audioBase64?: string;
    audioMimeType?: string;
    antecedenciaPadrao?: number;
  }): Promise<AiParseResponse> => {
    if (!currentUser?.id) {
      throw new Error('Usuário não autenticado.');
    }

    setIsProcessingAi(true);

    try {
      const now = new Date();
      const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);

      const res = await fetch('/api/lembrete/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          texto: params.texto,
          currentLocalTime: localIso,
          fusoHorario: Intl.DateTimeFormat().resolvedOptions().timeZone,
          antecedencia_padrao: params.antecedenciaPadrao || 0,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.mensagem || 'Falha ao processar comando de lembrete.');
      }

      const data: AiParseResponse = await res.json();
      setLastAiResponse(data);
      soundAlert.playChime();

      // If reminder was generated, sync to Firestore
      if (data.lembrete && data.lembrete.id) {
        syncItemToFirestore({
          id: data.lembrete.id,
          user_id: currentUser.id,
          titulo: data.lembrete.titulo,
          data_hora_execucao: data.lembrete.data_hora_execucao,
          antecedencia_minutos: data.lembrete.antecedencia_minutos || 0,
          status_tarefa: data.lembrete.status_tarefa,
          categoria: data.lembrete.categoria,
          urgencia: data.lembrete.urgencia,
          criado_em: new Date().toISOString(),
          adiado_vezes: 0,
        });
      }

      await fetchReminders();
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
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          ...data,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.lembrete) {
          syncItemToFirestore({
            id: json.lembrete.id,
            user_id: currentUser.id,
            ...data,
            status_tarefa: 'pendente',
            criado_em: new Date().toISOString(),
            adiado_vezes: 0,
          });
        }
        soundAlert.playSuccess();
        await fetchReminders();
      }
    } catch (e) {
      console.error('Error creating manual reminder:', e);
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
