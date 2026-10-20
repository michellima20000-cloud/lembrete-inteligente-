import React from 'react';
import { ShieldCheck, Sparkles, Clock, Mic, Flame, AlertCircle } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { PWAInstallButton } from './PWAInstallButton';

export const LoginScreen: React.FC = () => {
  const { signInWithGoogle, signInAsGuest, authError, clearAuthError } = useUser();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar with PWA install */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-500 shadow-md">
            <span className="text-base">🧠</span>
          </div>
          <span className="text-xs font-bold text-white tracking-wide">
            Lembrete <span className="text-indigo-400">Inteligente</span>
          </span>
        </div>
        <PWAInstallButton />
      </div>

      {/* Main Card */}
      <div className="max-w-md w-full mx-auto my-auto py-8">
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-md text-center">
          {/* Logo Glow */}
          <div className="relative mx-auto mb-5 flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-500 shadow-xl shadow-indigo-500/25">
            <span className="text-4xl">🧠</span>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-slate-900"></span>
            </span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white">
            Lembrete <span className="text-indigo-400">Inteligente</span>
          </h1>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            Cérebro de IA para tarefas por áudio e texto com isolamento estrito de conta e sincronização em tempo real.
          </p>

          {/* Key Features Pill badges */}
          <div className="grid grid-cols-2 gap-2 mt-6 text-left">
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-bold">
                <Mic className="w-3.5 h-3.5" />
                Voz e Áudio
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comandos naturais falados ou digitados.
              </p>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                Sem Perder Prazos
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Alertas sonoros e adiamento de 10 min.
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {authError && (
            <div className="mt-4 p-3 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2 text-left animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{authError}</p>
                <button
                  onClick={clearAuthError}
                  className="mt-1 text-[11px] underline text-rose-300 hover:text-white"
                >
                  Fechar aviso
                </button>
              </div>
            </div>
          )}

          {/* Login Buttons */}
          <div className="mt-6 space-y-2.5">
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm shadow-xl shadow-white/10 active:scale-[0.98] transition cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.98 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continuar com o Google</span>
            </button>

            <button
              onClick={signInAsGuest}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-200 font-semibold text-xs transition active:scale-[0.98] cursor-pointer"
            >
              <span>Entrar como Convidado (Modo Demonstração)</span>
            </button>
          </div>

          {/* Production & Security badge */}
          <div className="mt-6 pt-5 border-t border-slate-800 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Autenticação segura via Firebase Auth</span>
            <span className="text-slate-600">&bull;</span>
            <span className="flex items-center gap-1 text-amber-400">
              <Flame className="w-3 h-3" /> Produção
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-2">
        <p>Lembrete Inteligente PWA &bull; Isolamento Multi-Conta</p>
      </footer>
    </div>
  );
};
