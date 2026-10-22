import React, { useState } from 'react';
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
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { useUser } from '../context/UserContext';
import { Lembrete, StatusTarefa } from '../types';

export const TimelineAgenda: React.FC = () => {
  const { reminders, updateStatus, snoozeReminder, deleteReminder, isLoading } = useReminders();
  const { currentUser } = useUser();

  const [activeTab, setActiveTab] = useState<'pendentes' | 'adiados' | 'concluídos' | 'todos'>('pendentes');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

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
    const now = new Date();
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
