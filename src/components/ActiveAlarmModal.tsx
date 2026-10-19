import React from 'react';
import { Bell, CheckCircle2, RotateCcw, X, Clock, AlertTriangle } from 'lucide-react';
import { useReminders } from '../context/RemindersContext';

export const ActiveAlarmModal: React.FC = () => {
  const { activeAlarmReminder, dismissAlarm, snoozeReminder, updateStatus } = useReminders();

  if (!activeAlarmReminder) return null;

  const targetDate = new Date(activeAlarmReminder.data_hora_execucao);
  const timeFormatted = targetDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-amber-500/80 p-6 shadow-2xl text-slate-100 shadow-amber-500/20 animate-in zoom-in-95">
        {/* Ringing bell icon header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 shadow-xl shadow-amber-500/30 animate-bounce">
            <Bell className="w-10 h-10 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
            </span>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Alerta de Compromisso!
          </span>

          <h2 className="mt-3 text-lg font-black text-white leading-snug">
            {activeAlarmReminder.titulo}
          </h2>

          <div className="flex items-center gap-2 mt-2 text-sm text-slate-300">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>
              Agendado para <strong>{timeFormatted}</strong>
            </span>
            {activeAlarmReminder.antecedencia_minutos > 0 && (
              <span className="text-xs text-amber-400 font-semibold">
                (Aviso {activeAlarmReminder.antecedencia_minutos}m antes)
              </span>
            )}
          </div>

          {activeAlarmReminder.categoria && (
            <span className="mt-2 text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 font-medium">
              Categoria: {activeAlarmReminder.categoria}
            </span>
          )}
        </div>

        {/* Priority Actions */}
        <div className="mt-6 space-y-2.5">
          {/* Concluir Agora */}
          <button
            onClick={() => updateStatus(activeAlarmReminder.id, 'concluído')}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 active:scale-[0.98] transition"
          >
            <CheckCircle2 className="w-5 h-5" />
            Concluir Tarefa Agora
          </button>

          {/* Adiar 10 Minutos (Explicit requirement) */}
          <button
            onClick={() => snoozeReminder(activeAlarmReminder.id, 10)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-bold text-sm shadow-md active:scale-[0.98] transition"
          >
            <RotateCcw className="w-4 h-4" />
            Adiar por 10 Minutos
          </button>

          {/* Dispensar */}
          <button
            onClick={dismissAlarm}
            className="w-full py-2.5 px-4 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800/80 text-xs font-semibold transition"
          >
            Dispensar Alarme
          </button>
        </div>
      </div>
    </div>
  );
};
