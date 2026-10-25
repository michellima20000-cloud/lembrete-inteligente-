import React from 'react';
import { Loader2 } from 'lucide-react';

export const ModalLoadingFallback: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 shadow-xl">
        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
        <span className="text-xs font-semibold">Carregando...</span>
      </div>
    </div>
  );
};
