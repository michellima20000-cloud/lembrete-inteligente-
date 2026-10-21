import React, { useState } from 'react';
import { Bell, BellRing, CheckCircle2, AlertCircle, Volume2, Sparkles } from 'lucide-react';
import { useReminders } from '../context/RemindersContext';

export const BackgroundAlarmBanner: React.FC = () => {
  const { notificationPermission, requestNotificationPermission, testSound } = useReminders();
  const [isRequesting, setIsRequesting] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const handleActivate = async () => {
    setIsRequesting(true);
    try {
      const ok = await requestNotificationPermission();
      if (ok) {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 5000);
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleQuickTest = () => {
    testSound();
    setTestSent(true);
    setTimeout(() => setTestSent(false), 4000);
  };

  if (notificationPermission === 'granted') {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
          <span className="font-semibold text-emerald-100">
            Alarmes em Segundo Plano Ativos
          </span>
          <span className="hidden sm:inline text-emerald-300/80 font-normal">
            &bull; Notificações e som tocarão mesmo minimizado
          </span>
        </div>

        <button
          onClick={handleQuickTest}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-800/60 hover:bg-emerald-700/60 text-emerald-100 font-medium transition cursor-pointer text-[11px]"
          title="Toca um som curto para testar seus alto-falantes"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>{testSent ? 'Som tocando...' : 'Testar Som'}</span>
        </button>
      </div>
    );
  }

  if (notificationPermission === 'denied') {
    return (
      <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 shadow-sm">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold text-amber-100">
            Notificações bloqueadas nas configurações do seu navegador
          </p>
          <p className="text-amber-300/80 mt-0.5 leading-relaxed text-[11px]">
            Para ouvir os alarmes e ver os avisos com a janela minimizada, clique no ícone de permissões ao lado da barra de endereço (cadeado/configurações) e permita &quot;Notificações&quot; e &quot;Som&quot;.
          </p>
        </div>
      </div>
    );
  }

  // Permission 'default': prompt user to activate
  return (
    <div className="mb-4 p-4 rounded-3xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-indigo-950/80 border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/10 text-slate-100">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0 shadow-inner">
            <BellRing className="w-5 h-5 text-indigo-300 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white">
                Ativar Alarme em Segundo Plano
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                Importante
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Permita as notificações para que o som e o alerta do lembrete toquem quando o navegador estiver <strong>minimizado</strong> ou em segundo plano.
            </p>
          </div>
        </div>

        <button
          onClick={handleActivate}
          disabled={isRequesting}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition cursor-pointer"
        >
          <Bell className="w-4 h-4" />
          <span>{isRequesting ? 'Solicitando...' : 'Ativar e Testar Agora'}</span>
        </button>
      </div>
    </div>
  );
};
