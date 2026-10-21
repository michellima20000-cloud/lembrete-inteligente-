import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  RotateCcw,
  Trash2,
  AlertTriangle,
  MoreVertical,
  Bell,
  Search,
} from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { useUser } from '../context/UserContext';
import { Lembrete, StatusTarefa } from '../types';

export const TimelineAgenda: React.FC = () => {
  const { reminders, updateStatus, snoozeReminder, deleteReminder, isLoading } = useReminders();
  const { currentUser } = useUser();

  const [activeTab, setActiveTab] = useState<'pendentes' | 'adiados' | 'concluídos' | 'todos'>('pendentes');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Group and count tabs
  const pendingCount = reminders.filter((r) => r.status_tarefa === 'pendente').length;
  const postponedCount = reminders.filter((r) => r.status_tarefa === 'adiado').length;
  const completedCount = reminders.filter((r) => r.status_tarefa === 'concluído').length;

  // Filter items strictly by status tab and search query
  const filteredReminders = reminders.filter((item) => {
    if (activeTab === 'pendentes' && item.status_tarefa !== 'pendente') return false;
    if (activeTab === 'adiados' && item.status_tarefa !== 'adiado') return false;
    if (activeTab === 'concluídos' && item.status_tarefa !== 'concluído') return false;

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
      {/* Clean Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight">
            Agenda de Lembretes
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Organizados em ordem cronológica para <span className="text-indigo-300 font-medium">{currentUser?.nome || 'você'}</span>
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-60">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar compromisso..."
            className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Modern Full-Width Segmented Tabs - Zero Lateral Overflow */}
      <div className="w-full grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-900/90 border border-slate-800/80">
        <button
          onClick={() => setActiveTab('pendentes')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'pendentes'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="truncate">Pendentes</span>
          <span className="text-[10px] tabular-nums font-bold opacity-80">
            {pendingCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('adiados')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'adiados'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="truncate">Adiados</span>
          <span className="text-[10px] tabular-nums font-bold opacity-80">
            {postponedCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('concluídos')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'concluídos'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="truncate">Concluídos</span>
          <span className="text-[10px] tabular-nums font-bold opacity-80">
            {completedCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('todos')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'todos'
              ? 'bg-slate-700 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span className="truncate">Todos</span>
          <span className="text-[10px] tabular-nums font-bold opacity-80">
            {reminders.length}
          </span>
        </button>
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
                    {/* Clean Subtle Metadata Header */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
                      {item.categoria && item.categoria !== 'todas' && item.categoria !== 'Geral' && (
                        <>
                          <span className="text-slate-300 font-medium">{item.categoria}</span>
                          <span className="text-slate-600">·</span>
                        </>
                      )}
                      {item.urgencia === 'alta' && (
                        <>
                          <span className="text-rose-400 font-bold uppercase text-[9px] tracking-wider">Urgente</span>
                          <span className="text-slate-600">·</span>
                        </>
                      )}
                      {isPostponed && (
                        <span className="text-amber-400 font-medium">
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
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-xs">
                      {/* Scheduled Time */}
                      <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                        <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>
                          {timeInfo.dayPrefix} às <strong className="text-white font-semibold">{timeInfo.timeFormatted}</strong>
                        </span>
                      </span>

                      {!isCompleted && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span
                            className={`font-medium text-xs flex items-center gap-1 ${
                              timeInfo.isOverdue
                                ? 'text-rose-400 font-semibold'
                                : 'text-indigo-300'
                            }`}
                          >
                            {timeInfo.isOverdue && <AlertTriangle className="w-3 h-3 text-rose-400 inline" />}
                            {timeInfo.relativeLabel}
                          </span>
                        </>
                      )}

                      {/* Antecedência Notice */}
                      {item.antecedencia_minutos > 0 && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="text-amber-300/90 text-[11px] font-medium flex items-center gap-1">
                            <Bell className="w-3 h-3 text-amber-400" />
                            Aviso {item.antecedencia_minutos}m antes
                          </span>
                        </>
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
