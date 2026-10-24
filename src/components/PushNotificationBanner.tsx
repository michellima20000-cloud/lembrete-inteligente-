import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  X,
  Volume2,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { useUser } from '../context/UserContext';
import { soundAlert } from '../utils/audioAlert';

export const PushNotificationBanner: React.FC = () => {
  const { currentUser } = useUser();
  const {
    isPushSubscribed,
    notificationPermission,
    subscribePush,
    testPushNotification,
  } = useReminders();

  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // If dismissed by user in this session, don't show
  if (isDismissed) return null;

  const isGranted = notificationPermission === 'granted' && isPushSubscribed;
  const isDenied = notificationPermission === 'denied';

  const handleActivate = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      soundAlert.startBackgroundKeepAlive();
      const res = await subscribePush();
      if (res && res.success) {
        soundAlert.playSuccess();
        setTestResult({
          success: true,
          message: 'Alarmes ativados! Enviando disparo de teste para seu celular...',
        });
        // Auto-send verification push after 600ms so user immediately sees device vibrate and alert
        setTimeout(() => {
          testPushNotification()
            .then((tRes) => {
              if (tRes && tRes.success) {
                setTestResult({
                  success: true,
                  message: '✅ Disparo em segundo plano 100% confirmado e ativo no seu celular!',
                });
              }
            })
            .catch(() => {});
        }, 600);
      } else {
        setTestResult(res || {
          success: false,
          message: 'Não foi possível ativar as notificações push.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Falha ao ativar notificações push.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    setIsLoading(true);
    try {
      soundAlert.startBackgroundKeepAlive();
      const res = await testPushNotification();
      setTestResult(res);
      if (res.success) {
        soundAlert.playChime();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // If already granted and working, show compact status card with test button
  if (isGranted) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/50 border border-emerald-500/30 p-3 sm:p-3.5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 border border-emerald-500/30">
              <BellRing className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-emerald-300">
                  Alarmes em Segundo Plano Ativos
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Tela Bloqueada OK
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Seu dispositivo receberá push de alta prioridade e vibração mesmo se o app estiver fechado.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={handleTest}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              title="Disparar notificação de teste no celular"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Testar no Celular</span>
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition"
              title="Fechar aviso"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={`mt-2.5 p-2 rounded-xl text-[11px] font-medium flex items-center gap-1.5 ${
              testResult.success
                ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/40'
                : 'bg-rose-950/80 text-rose-200 border border-rose-500/40'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}
      </div>
    );
  }

  // If permission was denied by browser setting
  if (isDenied) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-amber-950/50 border border-amber-500/40 p-3 sm:p-3.5 shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <h4 className="font-bold text-amber-200">
                Permissão de Notificação Bloqueada no Navegador
              </h4>
              <p className="text-amber-300/80 text-[11px] mt-0.5 leading-relaxed">
                Para que o alarme toque com a tela do celular apagada ou bloqueada, permita as notificações nas configurações do seu navegador (clique no ícone de cadeado na barra de endereços).
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 text-slate-400 hover:text-white transition"
            aria-label="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Unsubscribed state - Primary Call to Action
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-950/90 via-slate-900 to-indigo-900/80 border-2 border-indigo-500/50 p-3.5 sm:p-4 shadow-xl shadow-indigo-950/40 backdrop-blur-md">
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30 shrink-0">
            <Bell className="w-5 h-5 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-black text-white tracking-tight">
                Ativar Alarmes em Segundo Plano
              </h3>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Recomendado
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-snug">
              Toque abaixo para permitir que o celular <strong className="text-white">vibre e desperte com som contínuo</strong> mesmo com a tela bloqueada ou app minimizado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-center shrink-0">
          <button
            onClick={handleActivate}
            disabled={isLoading}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 active:scale-[0.98] text-white text-xs font-black shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ativando...</span>
              </>
            ) : (
              <>
                <Smartphone className="w-4 h-4" />
                <span>Ativar Alertas no Celular</span>
              </>
            )}
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0"
            title="Lembrar mais tarde"
            aria-label="Lembrar mais tarde"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            testResult.success
              ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/40'
              : 'bg-rose-950/80 text-rose-200 border border-rose-500/40'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}
    </div>
  );
};
