import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Shield, Sparkles } from 'lucide-react';
import { useReminders } from '../context/RemindersContext';

interface AiResponseJsonModalProps {
  onClose: () => void;
}

export const AiResponseJsonModal: React.FC<AiResponseJsonModalProps> = ({ onClose }) => {
  const { lastAiResponse } = useReminders();
  const [copied, setCopied] = useState(false);

  if (!lastAiResponse) return null;

  const jsonString = JSON.stringify(lastAiResponse, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <Terminal className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                Saída JSON do Cérebro IA
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h2>
              <p className="text-xs text-slate-400">
                Formato padronizado e isolado por perfil
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Isolation Badge */}
        <div className="mt-3 p-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Conta Isolada: <code className="font-mono text-indigo-300">{lastAiResponse.user_id}</code>
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar'}</span>
          </button>
        </div>

        {/* Code Content */}
        <div className="mt-3 flex-1 overflow-auto rounded-2xl bg-slate-950 p-4 border border-slate-800 font-mono text-xs text-emerald-400">
          <pre className="whitespace-pre-wrap break-all leading-relaxed">{jsonString}</pre>
        </div>

        <p className="mt-3 text-[11px] text-slate-400 text-center shrink-0">
          Estrutura estrita consumida diretamente pela interface PWA em smartphones.
        </p>
      </div>
    </div>
  );
};
