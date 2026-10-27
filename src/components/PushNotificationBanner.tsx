import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  X,
  Smartphone,
  ShieldCheck,
  Info,
  Lock,
  BatteryCharging,
  Cpu,
  RefreshCw,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { useUser } from '../context/UserContext';
import { soundAlert } from '../utils/audioAlert';
import { PushDiagnosticModal } from './PushDiagnosticModal';

export const PushNotificationBanner: React.FC = () => {
  const { currentUser } = useUser();
  const {
    isPushSubscribed,
    notificationPermission,
    requestNotificationPermission,
    checkNotificationPermission,
    subscribePush,
    testPushNotification,
    testPushDelayed,
    pingStatus,
  } = useReminders();

  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [isDelayedTesting, setIsDelayedTesting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showBatteryInfo, setShowBatteryInfo] = useState(false);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);

  // Verification Layer: Check native permission immediately on mount and on focus
  useEffect(() => {
    checkNotificationPermission().catch(() => {});
  }, [checkNotificationPermission]);

  // Auto-subscribe if system permission was already granted in browser
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      currentUser?.id &&
      !isPushSubscribed
    ) {
      subscribePush().catch(() => {});
    }
  }, [currentUser?.id, isPushSubscribed, subscribePush]);

  // If dismissed by user in this session, don't show banner, but show modal if requested
  if (isDismissed) {
    return showDiagnosticModal ? (
      <PushDiagnosticModal onClose={() => setShowDiagnosticModal(false)} />
    ) : null;
  }

  const isGranted = notificationPermission === 'granted' && isPushSubscribed;
  const isDenied = notificationPermission === 'denied';

  // Request native permission and subscribe
  const handleRequestAuthorization = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      soundAlert.startBackgroundKeepAlive();

      if (typeof window === 'undefined' || !('Notification' in window)) {
        setTestResult({
          success: false,
          message: 'A API de Notificações nativa não é suportada neste navegador.',
        });
        return;
      }

      // If already denied, recheck if the user unlocked in browser settings
      if (Notification.permission === 'denied') {
        const recheck = await checkNotificationPermission();
        if (recheck === 'denied') {
          setTestResult({
            success: false,
            message: 'Permissão bloqueada nas configurações do navegador. Clique no cadeado 🔒 na barra de endereços para permitir notificações e toque em "Reverificar Permissão".',
          });
          setShowPermissionGuide(true);
          return;
        }
      }

      // Prompt native browser permission dialog
      const granted = await requestNotificationPermission();

      if (granted) {
        soundAlert.playSuccess();
        setTestResult({
          success: true,
          message: 'Autorização concedida! Conectando canal de segundo plano ao servidor...',
        });

        const res = await subscribePush();
        if (res && res.success) {
          setTimeout(() => {
            testPushNotification()
              .then((tRes) => {
                if (tRes && tRes.success) {
                  setTestResult({
                    success: true,
                    message: '✅ Notificações nativas autorizadas e ativas no seu celular!',
                  });
                }
              })
              .catch(() => {});
          }, 600);
        }
      } else {
        setTestResult({
          success: false,
          message: 'Autorização não foi concedida. Toque novamente para permitir.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Falha ao solicitar autorização nativa.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Re-verify permission layer
  const handleRecheckPermission = async () => {
    setIsCheckingPermission(true);
    setTestResult(null);
    try {
      const perm = await checkNotificationPermission();
      if (perm === 'granted') {
        soundAlert.playSuccess();
        const res = await subscribePush();
        setTestResult({
          success: true,
          message: res.success
            ? '✅ Permissão detectada com sucesso! Alertas ativados.'
            : 'Permissão concedida. Sincronizando com a nuvem...',
        });
      } else if (perm === 'denied') {
        setTestResult({
          success: false,
          message: 'As notificações continuam desativadas no navegador. Veja o guia abaixo.',
        });
        setShowPermissionGuide(true);
      } else {
        setTestResult({
          success: false,
          message: 'Permissão ainda pendente de autorização. Toque em "Solicitar Autorização".',
        });
      }
    } finally {
      setIsCheckingPermission(false);
    }
  };

  const handleImmediateTest = async () => {
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

  const handleDelayedTest = async () => {
    setIsDelayedTesting(true);
    setCountdown(5);
    try {
      soundAlert.startBackgroundKeepAlive();
      const res = await testPushDelayed(5);
      setTestResult(res);
      if (res.success) {
        soundAlert.playChime();
      }

      // 5-second countdown timer for user to lock screen
      let currentSec = 5;
      const interval = setInterval(() => {
        currentSec -= 1;
        if (currentSec <= 0) {
          clearInterval(interval);
          setCountdown(null);
          setIsDelayedTesting(false);
        } else {
          setCountdown(currentSec);
        }
      }, 1000);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Erro ao agendar teste com tela bloqueada.',
      });
      setIsDelayedTesting(false);
      setCountdown(null);
    }
  };

  // If already granted and working, show comprehensive background status card
  if (isGranted) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-indigo-950/60 border border-emerald-500/35 p-3.5 sm:p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 border border-emerald-500/30 mt-0.5">
              <BellRing className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm font-black text-emerald-300">
                  Segundo Plano Ativo no Celular
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  Tela Bloqueada OK
                </span>
                {pingStatus.online && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Servidor Monitorando
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Seu dispositivo receberá notificações de alta prioridade e vibração com o horário exato, mesmo com o app fechado ou tela bloqueada.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto shrink-0">
            {/* Immediate test button */}
            <button
              onClick={handleImmediateTest}
              disabled={isLoading || isDelayedTesting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white text-xs font-bold transition border border-slate-700 shadow-sm cursor-pointer disabled:opacity-50"
              title="Disparar notificação de teste imediato"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>Testar Agora</span>
            </button>

            {/* Test with locked screen button */}
            <button
              onClick={handleDelayedTest}
              disabled={isLoading || isDelayedTesting}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition shadow-md shadow-emerald-600/30 cursor-pointer disabled:opacity-50"
              title="Testar alarme disparando com tela bloqueada"
            >
              {isDelayedTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Bloqueie a Tela ({countdown}s)</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Testar Tela Bloqueada</span>
                </>
              )}
            </button>

            {/* Diagnostic and setup guide button */}
            <button
              onClick={() => setShowDiagnosticModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:scale-95 text-indigo-300 hover:text-indigo-200 text-xs font-bold transition border border-indigo-500/30 shadow-sm cursor-pointer"
              title="Abrir diagnósticos avançados e guia de configuração do Service Worker"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Diagnóstico & Guia</span>
            </button>

            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
              title="Fechar aviso"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Informative toggle about 0.00% battery consumption on Android */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/70">
          <button
            onClick={() => setShowBatteryInfo(!showBatteryInfo)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Por que meu Android mostra 0,00% de bateria consumida?</span>
            <span className="text-[10px] text-slate-400 underline">
              {showBatteryInfo ? 'Ocultar detalhes' : 'Ver explicação'}
            </span>
          </button>

          {showBatteryInfo && (
            <div className="mt-2 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 space-y-2 leading-relaxed animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <BatteryCharging className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  <strong className="text-white">O consumo de 0,00% é normal e esperado!</strong> O Lembrete Inteligente usa a arquitetura em nuvem (Web Push via Google Play Services).
                </p>
              </div>
              <p className="text-slate-400 pl-6">
                Em vez de gastar a bateria do seu celular deixando um processo pesado rodando o tempo todo em segundo plano, nosso servidor monitora seus alarmes e envia um sinal de despertar no horário exato. A configuração <strong className="text-emerald-300">"Nenhuma restrição"</strong> que você ativou garante que o Android nunca bloqueará essa notificação de alta prioridade.
              </p>
              <div className="pl-6 pt-1">
                <button
                  onClick={handleDelayedTest}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[10px] font-bold border border-emerald-500/40 transition"
                >
                  <Lock className="w-3 h-3" />
                  Clique aqui e bloqueie seu celular para testar agora
                </button>
              </div>
            </div>
          )}
        </div>

        {testResult && (
          <div
            className={`mt-2.5 p-2 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
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
        {showDiagnosticModal && (
          <PushDiagnosticModal onClose={() => setShowDiagnosticModal(false)} />
        )}
      </div>
    );
  }

  // If permission was denied by browser setting (Desativadas pelo usuário no navegador)
  if (isDenied) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/80 via-slate-900 to-amber-950/70 border-2 border-rose-500/50 p-4 shadow-xl shadow-rose-950/30">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-rose-200">
                  Notificações Desativadas no Navegador
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  Permissão Bloqueada (Denied)
                </span>
              </div>
              <p className="text-xs text-rose-200/90 mt-1 leading-relaxed">
                O navegador está bloqueando os alertas. Para que o alarme toque com a tela do celular apagada ou bloqueada, é necessário autorizar as notificações nas permissões do site.
              </p>

              {/* Instructions Box */}
              <div className="mt-2.5 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 space-y-1.5 leading-snug">
                <div className="flex items-start gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">No Android / Chrome:</strong> Toque no ícone de <strong>cadeado 🔒</strong> ou configurações na barra de endereço &gt; <strong>Permissões</strong> &gt; Ative <strong>Notificações</strong>.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-white">No iPhone (iOS 16.4+):</strong> Salve o app na <strong>Tela de Início</strong> (Safari &gt; Compartilhar &gt; Adicionar à Tela de Início) e abra por lá.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-col items-center sm:items-stretch gap-2 shrink-0">
            {/* Re-verify permission button */}
            <button
              onClick={handleRecheckPermission}
              disabled={isCheckingPermission}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold transition shadow-md shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              title="Verificar se você já desbloqueou no cadeado do navegador"
            >
              {isCheckingPermission ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Reverificar Autorização</span>
            </button>

            {/* Prompt authorization again */}
            <button
              onClick={handleRequestAuthorization}
              disabled={isLoading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Tentar abrir o diálogo nativo de autorização"
            >
              {isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Solicitar Novamente</span>
            </button>

            <button
              onClick={() => setShowDiagnosticModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-[11px] font-semibold border border-slate-700 transition"
            >
              <Cpu className="w-3 h-3 text-indigo-400" />
              <span>Ver Guia & Diagnóstico</span>
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={`mt-2.5 p-2 rounded-xl text-xs font-medium flex items-center gap-2 ${
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

        {showDiagnosticModal && (
          <PushDiagnosticModal onClose={() => setShowDiagnosticModal(false)} />
        )}
      </div>
    );
  }

  // Desativadas / Autorização Pendente (Estado Default ou Não Inscrito)
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-950/95 via-slate-900 to-indigo-900/85 border-2 border-indigo-500/60 p-3.5 sm:p-4 shadow-xl shadow-indigo-950/40 backdrop-blur-md">
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30 shrink-0">
            <Bell className="w-5 h-5 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs sm:text-sm font-black text-white tracking-tight">
                Notificações Desativadas no Celular
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Autorização Necessária
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-snug">
              O sistema precisa da sua permissão para <strong className="text-white">despertar alarmes com som e vibração contínua</strong> mesmo com a tela bloqueada ou app minimizado.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-center shrink-0">
          {/* Re-verify check */}
          <button
            onClick={handleRecheckPermission}
            disabled={isCheckingPermission}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition cursor-pointer"
            title="Verificar status atual da permissão nativa"
          >
            {isCheckingPermission ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>Verificar</span>
          </button>

          {/* Primary request authorization button */}
          <button
            onClick={handleRequestAuthorization}
            disabled={isLoading}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 active:scale-[0.98] text-white text-xs font-black shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
            title="Solicitar permissão nativa e ativar alarmes em segundo plano"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Solicitando...</span>
              </>
            ) : (
              <>
                <BellRing className="w-4 h-4 animate-pulse" />
                <span>Solicitar Autorização & Ativar</span>
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

      {showDiagnosticModal && (
        <PushDiagnosticModal onClose={() => setShowDiagnosticModal(false)} />
      )}
    </div>
  );
};

