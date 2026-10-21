import React, { useState } from 'react';
import { X, Bell, BellRing, Volume2, CheckCircle2, AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { soundAlert } from '../utils/audioAlert';

interface NotificationSettingsModalProps {
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ onClose }) => {
  const { notificationPermission, requestNotificationPermission, refreshPermissionState, testSound } = useReminders();
  const [isRequesting, setIsRequesting] = useState(false);
  const [testSentMessage, setTestSentMessage] = useState<string | null>(null);

  const handleRequest = async () => {
    setIsRequesting(true);
    setTestSentMessage(null);
    try {
      await soundAlert.unlockAudio();
      const granted = await requestNotificationPermission();
      if (granted) {
        setTestSentMessage('Permissão concedida com sucesso! Notificação de teste enviada.');
      } else {
        const cur = refreshPermissionState();
        if (cur === 'denied') {
          setTestSentMessage('Permissão bloqueada no navegador. Abra em aba dedicada ou permita no cadeado da URL.');
        } else {
          setTestSentMessage('Solicitação cancelada ou pendente. Toque novamente para ativar.');
        }
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSendTestNotification = async () => {
    setTestSentMessage(null);
    soundAlert.playChime();
    soundAlert.playAlarmBurst();

    let sent = false;

    // 1. Try Desktop Notification
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          const notif = new Notification('⏰ Lembrete Inteligente (Teste)', {
            body: 'Seus alarmes e avisos estão funcionando com sucesso em segundo plano!',
            icon: '/icon-192.png',
            tag: 'test_notification',
          });
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
          sent = true;
        } catch {}
      }
    }

    // 2. Try Service Worker Notification
    if ('serviceWorker' in navigator) {
      try {
        const swReadyPromise = navigator.serviceWorker.ready;
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 500));
        const reg = await Promise.race([swReadyPromise, timeoutPromise]);
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('⏰ Lembrete Inteligente (Teste)', {
            body: 'Seus alarmes e avisos estão funcionando com sucesso em segundo plano!',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'test_notification_sw',
            vibrate: [400, 150, 400],
          } as any);
          sent = true;
        }
      } catch {}
    }

    if (sent) {
      setTestSentMessage('Notificação disparada para o seu dispositivo com som!');
    } else {
      setTestSentMessage('Para receber notificações visuais na tela, ative a permissão de notificações.');
    }
  };

  const openInNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in select-none">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl text-slate-100 animate-in zoom-in-95 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Alarmes em Segundo Plano
              </h2>
              <p className="text-xs text-slate-400">
                Notificações e som com navegador minimizado
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Status Cards */}
        <div className="mt-4 space-y-2.5">
          {/* Notification Permission Status */}
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bell className="w-4 h-4 text-indigo-400 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-white block">
                  Notificações do Sistema:
                </span>
                <span className="text-[11px] text-slate-400">
                  Avisos visuais na tela quando minimizado
                </span>
              </div>
            </div>

            {notificationPermission === 'granted' ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Ativado
              </span>
            ) : notificationPermission === 'denied' ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                Bloqueado
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Pendente
              </span>
            )}
          </div>

          {/* Sound Engine Status */}
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-white block">
                  Áudio e Sirene Contínua:
                </span>
                <span className="text-[11px] text-slate-400">
                  Som em loop com suporte a MediaSession
                </span>
              </div>
            </div>

            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Pronto
            </span>
          </div>

          {/* Background Worker Status */}
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-white block">
                  Relógio em Segundo Plano:
                </span>
                <span className="text-[11px] text-slate-400">
                  Web Worker dedicado ativo a cada 1s
                </span>
              </div>
            </div>

            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Ativo
            </span>
          </div>
        </div>

        {/* Feedback Alert if test was triggered */}
        {testSentMessage && (
          <div className="mt-3 p-3 rounded-2xl bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{testSentMessage}</span>
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 space-y-2.5">
          {notificationPermission !== 'granted' && (
            <button
              onClick={handleRequest}
              disabled={isRequesting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span>{isRequesting ? 'Solicitando...' : 'Ativar Permissão de Notificações'}</span>
            </button>
          )}

          {notificationPermission === 'granted' && (
            <div className="p-2.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium text-emerald-100">
                Notificações ativas! Seus avisos tocarão e aparecerão na tela mesmo em segundo plano.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleSendTestNotification}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700/80 active:scale-[0.98] text-white font-semibold text-xs border border-slate-700 transition cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5 text-indigo-400" />
              <span>Testar Notificação</span>
            </button>

            <button
              onClick={() => {
                testSound();
                setTestSentMessage('Tocando som alto de alarme agora!');
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700/80 active:scale-[0.98] text-white font-semibold text-xs border border-slate-700 transition cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Testar Som</span>
            </button>
          </div>

          <button
            onClick={openInNewTab}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-slate-400 hover:text-white text-[11px] transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Abrir aplicativo em aba dedicada</span>
          </button>
        </div>
      </div>
    </div>
  );
};
