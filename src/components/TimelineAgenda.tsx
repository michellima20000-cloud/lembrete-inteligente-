import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  RotateCcw,
  Trash2,
  AlertTriangle,
  ChevronRight,
  MoreVertical,
  Bell,
  Sparkles,
  Filter,
  Search,
  Repeat,
  Smartphone,
  Download,
  ExternalLink,
  CalendarPlus,
  Check,
  Copy,
  Zap,
  Radio,
  Volume2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { useUser } from '../context/UserContext';
import { Lembrete, StatusTarefa } from '../types';
import { formatRecurrenceLabel } from '../utils/recurrence';
import { soundAlert } from '../utils/audioAlert';
import {
  addReminderToDeviceCalendar,
  getGoogleCalendarUrl,
  exportAllRemindersToIcs,
  getWebcalFeedUrl,
  openAutoCalendarSubscription,
} from '../utils/calendarSync';

export const TimelineAgenda: React.FC = () => {
  const {
    reminders,
    updateStatus,
    snoozeReminder,
    deleteReminder,
    isLoading,
    notificationPermission,
    requestNotificationPermission,
    subscribePush,
    isPushSubscribed,
  } = useReminders();
  const { currentUser } = useUser();

  const [activeTab, setActiveTab] = useState<'pendentes' | 'adiados' | 'concluídos' | 'todos'>('pendentes');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  const [copiedWebcal, setCopiedWebcal] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Automatic Mobile Device Background Synchronization
  const [isAutoSyncActive, setIsAutoSyncActive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('lembrete_auto_sync_device');
      return saved !== 'false';
    } catch {
      return true;
    }
  });
  const [isConfiguringAuto, setIsConfiguringAuto] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [lastAutoSyncTime, setLastAutoSyncTime] = useState<Date>(() => new Date());


  const showToast = (msg: string) => {
    setSyncToast(msg);
    setTimeout(() => setSyncToast(null), 4000);
  };

  const handleExportAll = () => {
    if (!reminders || reminders.length === 0) {
      showToast('Nenhum lembrete para exportar no momento.');
      return;
    }
    exportAllRemindersToIcs(reminders);
    showToast('Arquivo de alarme (.ics) gerado! Abra com seu calendário/relógio.');
  };

  const handleCopyWebcal = async () => {
    const feed = getWebcalFeedUrl(currentUser?.id || 'guest');
    const targetUrl = feed.webcal;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(targetUrl);
        setCopiedWebcal(true);
        setTimeout(() => setCopiedWebcal(false), 3000);
        showToast('Link WebCal copiado! Cole no Google Agenda ou Apple Calendar.');
      } else {
        window.location.href = targetUrl;
      }
    } catch {
      window.location.href = targetUrl;
    }
  };

  const handleSyncItem = async (item: Lembrete) => {
    const res = await addReminderToDeviceCalendar(item);
    if (res.method === 'share') {
      showToast('Enviado para o calendário/relógio do celular!');
    } else if (res.method === 'google') {
      showToast('Abrindo no Google Agenda...');
    } else {
      showToast('Arquivo .ics de alarme pronto para o celular!');
    }
  };

  // 1-Tap Automatic Mobile Device & Authorization Configuration
  const handleAutoConfigureMobile = async () => {
    setIsConfiguringAuto(true);
    try {
      // 1. Enable audio subsystem keep-alive for lock-screen sound
      soundAlert.startBackgroundKeepAlive();

      // 2. Request native notification permissions if not granted
      let permGranted = notificationPermission === 'granted';
      if (!permGranted && typeof window !== 'undefined' && 'Notification' in window) {
        permGranted = await requestNotificationPermission();
      }

      // 3. Register Cloud Push Subscription
      if (!isPushSubscribed) {
        await subscribePush().catch(() => {});
      }

      // 4. Automatically connect phone's native calendar/clock via WebCal
      openAutoCalendarSubscription(currentUser?.id || 'guest');

      // 5. Persist auto-sync setting
      localStorage.setItem('lembrete_auto_sync_device', 'true');
      setIsAutoSyncActive(true);
      setLastAutoSyncTime(new Date());

      if (permGranted) {
        showToast('🎉 Disparo e sincronização automática ativados no celular!');
      } else {
        showToast('Agenda conectada! Lembre-se de permitir as notificações no navegador.');
      }
    } catch (err) {
      console.error('Error during auto-configuration:', err);
      showToast('Configurando no celular... Conectando agenda nativa.');
    } finally {
      setIsConfiguringAuto(false);
    }
  };

  const toggleAutoSync = () => {
    const nextState = !isAutoSyncActive;
    setIsAutoSyncActive(nextState);
    try {
      localStorage.setItem('lembrete_auto_sync_device', nextState ? 'true' : 'false');
    } catch {}

    if (nextState) {
      showToast('⚡ Sincronização automática em segundo plano ativada!');
      handleAutoConfigureMobile();
    } else {
      showToast('Sincronização automática desativada temporariamente.');
    }
  };

  // Keep track of background sync timestamp whenever reminders list updates
  useEffect(() => {
    if (isAutoSyncActive && reminders && reminders.length > 0) {
      setLastAutoSyncTime(new Date());
    }
  }, [reminders, isAutoSyncActive]);


  // Continuously update live countdown and instantly recalculate when returning from lockscreen
  useEffect(() => {
    const updateTick = () => setCurrentTimeMs(Date.now());

    // Update every 30 seconds so minute countdown stays fresh without draining CPU
    const interval = setInterval(updateTick, 30000);

    // When phone is unlocked or user switches back to browser, update immediately
    const handleVisibility = () => {
      updateTick();
    };

    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Group and count tabs
  const pendingCount = reminders.filter((r) => r.status_tarefa === 'pendente').length;
  const postponedCount = reminders.filter((r) => r.status_tarefa === 'adiado').length;
  const completedCount = reminders.filter((r) => r.status_tarefa === 'concluído').length;

  // Filter items
  const filteredReminders = reminders.filter((item) => {
    // Tab filter
    if (activeTab === 'pendentes' && item.status_tarefa !== 'pendente') return false;
    if (activeTab === 'adiados' && item.status_tarefa !== 'adiado') return false;
    if (activeTab === 'concluídos' && item.status_tarefa !== 'concluído') return false;

    // Category filter
    if (selectedCategory !== 'todas' && item.categoria !== selectedCategory) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.titulo.toLowerCase().includes(q) ||
        (item.categoria && item.categoria.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate friendly relative countdown & formatting
  const formatTimeInfo = (isoString: string) => {
    const targetDate = new Date(isoString);
    const now = new Date(currentTimeMs);
    const diffMs = targetDate.getTime() - now.getTime();
    const diffMin = Math.round(diffMs / 60000);

    const isToday = targetDate.toDateString() === now.toDateString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = targetDate.toDateString() === tomorrow.toDateString();

    const timeFormatted = targetDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const dateFormatted = targetDate.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });

    let relativeLabel = '';
    let isOverdue = false;

    if (diffMin < 0) {
      isOverdue = true;
      const absMin = Math.abs(diffMin);
      if (absMin < 60) {
        relativeLabel = `Vencido há ${absMin} min`;
      } else {
        const hours = Math.floor(absMin / 60);
        relativeLabel = `Vencido há ${hours}h`;
      }
    } else if (diffMin === 0) {
      relativeLabel = 'Agora!';
    } else if (diffMin < 60) {
      relativeLabel = `Em ${diffMin} min`;
    } else if (diffMin < 1440) {
      const hours = Math.floor(diffMin / 60);
      const remainingMin = diffMin % 60;
      relativeLabel = remainingMin > 0 ? `Em ${hours}h ${remainingMin}m` : `Em ${hours}h`;
    } else {
      const days = Math.floor(diffMin / 1440);
      relativeLabel = `Em ${days} ${days === 1 ? 'dia' : 'dias'}`;
    }

    const dayPrefix = isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : dateFormatted;

    return {
      dayPrefix,
      timeFormatted,
      relativeLabel,
      isOverdue,
    };
  };

  const categories = ['todas', 'Trabalho', 'Saúde', 'Finanças', 'Pessoal', 'Estudos'];

  return (
    <section className="mt-6 space-y-4">
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white tracking-wide">
              Cronograma & Agenda
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Ordem Cronológica
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Lembretes isolados para: <strong className="text-indigo-300">{currentUser?.nome || 'sua conta'}</strong>
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar compromisso..."
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Toast Notification */}
      {syncToast && (
        <div className="p-3 rounded-2xl bg-indigo-600/90 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center gap-2 animate-in fade-in">
          <Smartphone className="w-4 h-4 shrink-0 text-white" />
          <span className="flex-1">{syncToast}</span>
        </div>
      )}

      {/* Mobile Calendar & System Alarm Integration Card - AUTOMATIC MODE */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-2xl space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shrink-0">
              <Smartphone className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Disparo Nativo no Celular (Alarme do Sistema)
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Tela Bloqueada
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  <span className={`w-1.5 h-1.5 rounded-full ${isAutoSyncActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  {isAutoSyncActive ? 'Automático Ativo' : 'Manual'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Integração contínua com o relógio e agenda do seu aparelho (Samsung / Google / Apple) para tocar alarme sonoro mesmo com a tela bloqueada ou app fechado.
              </p>
            </div>
          </div>
        </div>

        {/* 1-Tap Automatic Mobile Setup CTA */}
        {notificationPermission !== 'granted' || !isPushSubscribed ? (
          <div className="p-3.5 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 space-y-2.5">
            <div className="flex items-center gap-2 text-indigo-200 text-xs font-semibold">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
              <span>Configuração Automática Direta no Celular:</span>
            </div>
            <button
              onClick={handleAutoConfigureMobile}
              disabled={isConfiguringAuto}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-indigo-600 to-indigo-700 hover:from-emerald-500 hover:to-indigo-600 text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/30 transition active:scale-[0.98] border border-emerald-400/40 disabled:opacity-60"
            >
              {isConfiguringAuto ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Configurando Automaticamente no Celular...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300 animate-bounce" />
                  <span>⚡ Configurar Tudo Automaticamente no Celular (1 Toque)</span>
                </>
              )}
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              Autoriza notificações nativas, liga o alarme em segundo plano e conecta automaticamente com seu relógio.
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-emerald-300">
                  Disparo Automático Configurado no Celular!
                </span>
                <p className="text-[10px] text-slate-400">
                  Seus alarmes tocam automaticamente pelo sistema do aparelho com tela bloqueada.
                </p>
              </div>
            </div>
            <button
              onClick={handleAutoConfigureMobile}
              disabled={isConfiguringAuto}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 shrink-0"
              title="Atualizar agenda nativa agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isConfiguringAuto ? 'animate-spin' : ''}`} />
              <span>Sincronizar Celular Agora</span>
            </button>
          </div>
        )}

        {/* Live Auto-Sync Status & Toggle Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <span className={`flex h-3 w-3 ${isAutoSyncActive ? 'relative' : ''}`}>
                {isAutoSyncActive && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${isAutoSyncActive ? 'bg-emerald-500' : 'bg-slate-600'}`} />
              </span>
            </div>
            <div>
              <div className="text-xs text-white">
                <span className="font-semibold">Sincronização em Segundo Plano: </span>
                <span className={isAutoSyncActive ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {isAutoSyncActive ? 'ATIVADA (Tempo Real)' : 'DESATIVADA'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                {isAutoSyncActive
                  ? `Última atualização automática: ${lastAutoSyncTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • ${reminders.filter(r => r.status_tarefa !== 'concluído').length} alarme(s) ativos`
                  : 'Ative para manter seu relógio/agenda sincronizados automaticamente'}
              </div>
            </div>
          </div>

          <button
            onClick={toggleAutoSync}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              isAutoSyncActive
                ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {isAutoSyncActive ? (
              <>
                <ToggleRight className="w-4 h-4 text-emerald-400" />
                <span>Automático: Ligado</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4 text-slate-400" />
                <span>Automático: Desligado</span>
              </>
            )}
          </button>
        </div>

        {/* 3 Pillars Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${notificationPermission === 'granted' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-slate-400">Notificações:</span>
            <span className={`font-semibold ml-auto ${notificationPermission === 'granted' ? 'text-emerald-300' : 'text-amber-300'}`}>
              {notificationPermission === 'granted' ? 'Autorizadas' : 'Pendente'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isPushSubscribed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-slate-400">Push em Nuvem:</span>
            <span className={`font-semibold ml-auto ${isPushSubscribed ? 'text-emerald-300' : 'text-amber-300'}`}>
              {isPushSubscribed ? 'Conectado' : 'Pendente'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isAutoSyncActive ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <span className="text-slate-400">Relógio/Agenda:</span>
            <span className={`font-semibold ml-auto ${isAutoSyncActive ? 'text-emerald-300' : 'text-slate-400'}`}>
              {isAutoSyncActive ? 'Sincronizado' : 'Manual'}
            </span>
          </div>
        </div>

        {/* Advanced / Manual Options Accordion */}
        <div className="pt-1 border-t border-slate-800/50">
          <button
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 transition py-1"
          >
            <span>Opções manuais (.ics avulso, link WebCal direto)</span>
            {showAdvancedOptions ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {showAdvancedOptions && (
            <div className="mt-2 p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5 animate-in fade-in">
              <p className="text-[11px] text-slate-400">
                Se desejar exportar ou assinar manualmente sem a automação do sistema:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-semibold transition active:scale-95"
                  title="Baixar arquivo .ics para abrir manualmente em qualquer app"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo .ics</span>
                </button>

                <button
                  onClick={handleCopyWebcal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95"
                  title="Copiar URL WebCal para colar em calendários externos"
                >
                  {copiedWebcal ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Link Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Copiar Link WebCal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-slate-800 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('pendentes')}
          className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition ${
            activeTab === 'pendentes'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Pendentes</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'pendentes' ? 'bg-indigo-900/70 text-indigo-200' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {pendingCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('adiados')}
          className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition ${
            activeTab === 'adiados'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Adiados</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'adiados' ? 'bg-amber-950/70 text-amber-200' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {postponedCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('concluídos')}
          className={`flex-1 min-w-[90px] flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition ${
            activeTab === 'concluídos'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Concluídos</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'concluídos' ? 'bg-emerald-950/70 text-emerald-200' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {completedCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('todos')}
          className={`min-w-[70px] flex items-center justify-center gap-1 py-2 px-3 rounded-xl text-xs font-semibold transition ${
            activeTab === 'todos'
              ? 'bg-slate-700 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Todos</span>
          <span className="text-[10px] text-slate-400">({reminders.length})</span>
        </button>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
        <Filter className="w-3 h-3 text-slate-500 shrink-0 ml-1" />
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-medium capitalize whitespace-nowrap transition ${
              selectedCategory === cat
                ? 'bg-slate-700 text-white font-semibold'
                : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items List */}
      {filteredReminders.length === 0 ? (
        <div className="py-12 px-4 text-center rounded-3xl bg-slate-900/40 border border-slate-800/60 flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 flex items-center justify-center text-2xl mb-3 text-indigo-400">
            ⏰
          </div>
          <h3 className="text-sm font-bold text-white">Nenhum lembrete nesta visualização</h3>
          <p className="text-xs text-slate-400 max-w-xs mt-1">
            {activeTab === 'pendentes'
              ? 'Tudo em dia! Diga ou digite um comando acima para agendar novas tarefas.'
              : 'Nenhum item encontrado com os filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredReminders.map((item) => {
            const timeInfo = formatTimeInfo(item.data_hora_execucao);
            const isCompleted = item.status_tarefa === 'concluído';
            const isPostponed = item.status_tarefa === 'adiado';

            return (
              <div
                key={item.id}
                className={`group relative rounded-3xl p-4 transition-all border ${
                  isCompleted
                    ? 'bg-slate-900/40 border-slate-800/50 opacity-75'
                    : timeInfo.isOverdue
                    ? 'bg-rose-950/20 border-rose-500/40 shadow-lg shadow-rose-950/20'
                    : isPostponed
                    ? 'bg-amber-950/20 border-amber-500/30'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Status Toggle Button */}
                  <button
                    onClick={() => updateStatus(item.id, isCompleted ? 'pendente' : 'concluído')}
                    className={`mt-0.5 rounded-full transition-transform active:scale-90 ${
                      isCompleted
                        ? 'text-emerald-400 hover:text-emerald-300'
                        : 'text-slate-500 hover:text-emerald-400'
                    }`}
                    title={isCompleted ? 'Marcar como pendente' : 'Marcar como concluído'}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5 fill-emerald-500/20" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      {/* Urgency Badge */}
                      {item.urgencia === 'alta' && (
                        <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Urgente
                        </span>
                      )}

                      {/* Category Badge */}
                      {item.categoria && (
                        <span className="px-2 py-0.2 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700/60">
                          {item.categoria}
                        </span>
                      )}

                      {/* Recurrence Badge */}
                      {item.recorrencia && item.recorrencia !== 'nenhuma' && (
                        <span className="px-2 py-0.2 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                          <Repeat className="w-3 h-3 text-indigo-400" />
                          <span>{formatRecurrenceLabel(item.recorrencia, item.dias_semana)}</span>
                        </span>
                      )}

                      {/* Postponed Badge */}
                      {isPostponed && (
                        <span className="px-2 py-0.2 rounded-md text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Adiado ({item.adiado_vezes || 1}x)
                        </span>
                      )}
                    </div>

                    {/* Task Title */}
                    <h3
                      className={`text-sm font-semibold text-white leading-snug break-words ${
                        isCompleted ? 'line-through text-slate-400' : ''
                      }`}
                    >
                      {item.titulo}
                    </h3>

                    {/* Schedule Time & Countdown */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
                      {/* Scheduled Time */}
                      <span className="flex items-center gap-1 text-slate-300 font-medium">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>
                          {timeInfo.dayPrefix} às <strong>{timeInfo.timeFormatted}</strong>
                        </span>
                      </span>

                      {/* Relative Countdown Badge */}
                      {!isCompleted && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                            timeInfo.isOverdue
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                              : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                          }`}
                        >
                          {timeInfo.isOverdue && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                          {timeInfo.relativeLabel}
                        </span>
                      )}

                      {/* Antecedência Notice */}
                      {item.antecedencia_minutos > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-amber-400/90 font-medium">
                          <Bell className="w-3 h-3" />
                          Aviso {item.antecedencia_minutos} min antes
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick Action Button: Adiar 10 Minutos (Explicit requirement) */}
                  {!isCompleted && (
                    <div className="flex items-center gap-1.5 shrink-0 self-center">
                      <button
                        onClick={() => snoozeReminder(item.id, 10)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition active:scale-95"
                        title="Adiar compromisso por 10 minutos"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden xs:inline">+10 min</span>
                      </button>

                      {/* Context menu for delete / more options */}
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActiveMenuId(activeMenuId === item.id ? null : item.id)
                          }
                          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenuId === item.id && (
                          <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl py-1 text-xs text-slate-200 animate-in fade-in">
                            <button
                              onClick={() => {
                                snoozeReminder(item.id, 30);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              Adiar +30 minutos
                            </button>
                            <button
                              onClick={() => {
                                snoozeReminder(item.id, 60);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              Adiar +1 hora
                            </button>
                            <button
                              onClick={() => {
                                snoozeReminder(item.id, 1440);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2"
                            >
                              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                              Adiar para amanhã
                            </button>
                            <div className="border-t border-slate-800 my-1" />
                            <button
                              onClick={() => {
                                handleSyncItem(item);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-indigo-950/40 text-indigo-300 flex items-center gap-2 font-medium"
                            >
                              <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                              Alarme do Celular (.ics)
                            </button>
                            <a
                              href={getGoogleCalendarUrl(item)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => setActiveMenuId(null)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-300 flex items-center gap-2"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              Abrir no Google Agenda
                            </a>
                            <div className="border-t border-slate-800 my-1" />
                            <button
                              onClick={() => {
                                deleteReminder(item.id);
                                setActiveMenuId(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-rose-950/40 text-rose-400 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir Lembrete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isCompleted && (
                    <button
                      onClick={() => deleteReminder(item.id)}
                      className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 transition"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
