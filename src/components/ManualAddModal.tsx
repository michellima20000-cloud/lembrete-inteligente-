import React, { useState } from 'react';
import { X, Calendar, Clock, Plus, Tag, AlertTriangle } from 'lucide-react';
import { useReminders } from '../context/RemindersContext';

interface ManualAddModalProps {
  onClose: () => void;
}

export const ManualAddModal: React.FC<ManualAddModalProps> = ({ onClose }) => {
  const { createManualReminder } = useReminders();

  const now = new Date();
  now.setMinutes(now.getMinutes() + 15);
  const defaultIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const [titulo, setTitulo] = useState('');
  const [dateTime, setDateTime] = useState(defaultIso);
  const [antecedencia, setAntecedencia] = useState(0);
  const [categoria, setCategoria] = useState('Trabalho');
  const [urgencia, setUrgencia] = useState<'baixa' | 'media' | 'alta'>('media');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !dateTime) return;

    setIsSubmitting(true);
    try {
      // Format to AAAA-MM-DDTHH:MM:SS
      const fullDate = dateTime.length === 16 ? `${dateTime}:00` : dateTime;
      await createManualReminder({
        titulo: titulo.trim(),
        data_hora_execucao: fullDate,
        antecedencia_minutos: Number(antecedencia),
        categoria,
        urgencia,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Novo Lembrete Manual</h2>
              <p className="text-xs text-slate-400">Preenchimento direto de data e horário</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Descrição da Tarefa *
            </label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Verificar cadastro XPTO e confirmar documentação"
              className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Data e Horário *
              </label>
              <input
                type="datetime-local"
                required
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Antecedência de Alerta
              </label>
              <select
                value={antecedencia}
                onChange={(e) => setAntecedencia(Number(e.target.value))}
                className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={0}>No horário exato (0 min)</option>
                <option value={5}>5 minutos antes</option>
                <option value={10}>10 minutos antes</option>
                <option value={15}>15 minutos antes</option>
                <option value={30}>30 minutos antes</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                Categoria
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Trabalho">Trabalho</option>
                <option value="Saúde">Saúde</option>
                <option value="Finanças">Finanças</option>
                <option value="Pessoal">Pessoal</option>
                <option value="Estudos">Estudos</option>
                <option value="Geral">Geral</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-indigo-400" />
                Urgência
              </label>
              <select
                value={urgencia}
                onChange={(e) => setUrgencia(e.target.value as any)}
                className="w-full rounded-2xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl bg-slate-800 text-slate-300 font-medium text-sm hover:bg-slate-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !titulo.trim()}
              className="flex-1 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Criar Lembrete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
