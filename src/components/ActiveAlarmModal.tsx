import React, { useEffect } from 'react';
import { Bell, CheckCircle2, RotateCcw, X, Clock, AlertTriangle, Volume2 } from 'lucide-react';
import { useReminders } from '../context/RemindersContext';
import { soundAlert } from '../utils/audioAlert';

export const ActiveAlarmModal: React.FC = () => {
  const { activeAlarmReminder, dismissAlarm, snoozeReminder, updateStatus } = useReminders();

  // Ring loud alarm continuously while the modal is open with an active reminder
  // NEVER stops on its own until user takes explicit action (Concluir, Adiar, or Dispensar)
  useEffect(() => {
    if (activeAlarmReminder) {
      soundAlert.startRingingAlarm(activeAlarmReminder.titulo);
    } else {
      soundAlert.stopRingingAlarm();
    }
    return () => {
      soundAlert.stopRingingAlarm();
    };
  }, [activeAlarmReminder]);

  if (!activeAlarmReminder) return null;

  const targetDate = new Date(activeAlarmReminder.data_hora_execucao);
  const timeFormatted = targetDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleConcluir = () => {
    soundAlert.stopRingingAlarm();
    updateStatus(activeAlarmReminder.id, 'concluído');
  };

  const handleAdiar = (minutos = 10) => {
    soundAlert.stopRingingAlarm();
    snoozeReminder(activeAlarmReminder.id, minutos);
  };

  const handleDispensar = () => {
    soundAlert.stopRingingAlarm();
    dismissAlarm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in select-none">
      {/* Background pulsing red/amber alarm ambient glow */}
      <div className="absolute inset-0 bg-gradient-radial from-amber-600/20 via-rose-600/10 to-transparent pointer-events-none animate-pulse" />

      <div className="relative w-full max-w-sm rounded-3xl bg-slate-900 border-2 border-amber-500 p-6 shadow-2xl text-slate-100 shadow-amber-500/30 animate-in zoom-in-95">
        {/* Ringing siren bell header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3 flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 shadow-2xl shadow-amber-500/50 animate-bounce">
            <Bell className="w-10 h-10 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-90"></span>
              <span className="relative inline-flex rounded-full h-5 w-5 bg-rose-500 border-2 border-slate-900"></span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse">
            <Volume2 className="w-3.5 h-3.5 animate-spin" />
            <span>Alarme Ativo Tocando</span>
          </div>

          <h2 className="mt-3 text-xl font-black text-white leading-snug break-words max-w-full">
            {activeAlarmReminder.titulo}
          </h2>

          <div className="flex items-center gap-2 mt-2 text-sm text-slate-300">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>
              Horário: <strong className="text-white">{timeFormatted}</strong>
            </span>
            {activeAlarmReminder.antecedencia_minutos > 0 && (
              <span className="text-xs text-amber-400 font-bold">
                (Aviso {activeAlarmReminder.antecedencia_minutos}m antes)
              </span>
            )}
          </div>

          {activeAlarmReminder.categoria && (
            <span className="mt-2 text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 font-medium">
              Categoria: {activeAlarmReminder.categoria}
            </span>
          )}

          <p className="mt-3 text-[11px] text-amber-300/80 font-medium">
            O som continuará tocando até você concluir ou adiar.
          </p>
        </div>

        {/* Priority User Actions */}
        <div className="mt-6 space-y-2.5">
          {/* Concluir / Vou Fazer Agora */}
          <button
            onClick={handleConcluir}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.98] text-white font-extrabold text-sm shadow-xl shadow-emerald-600/30 transition cursor-pointer"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-100" />
            <span>Concluir Tarefa Agora</span>
          </button>

          {/* Adiar 10 Minutos */}
          <button
            onClick={() => handleAdiar(10)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 active:scale-[0.98] text-amber-300 font-bold text-sm shadow-md transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Adiar por 10 Minutos</span>
          </button>

          {/* Dispensar */}
          <button
            onClick={handleDispensar}
            className="w-full py-2.5 px-4 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800/80 text-xs font-semibold transition cursor-pointer"
          >
            Dispensar Alarme
          </button>
        </div>
      </div>
    </div>
  );
};
