import React, { useState } from 'react';
import {
  ShieldCheck,
  Clock,
  Mic,
  Flame,
  AlertCircle,
  Mail,
  Lock,
  User,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { PWAInstallButton } from './PWAInstallButton';

export const LoginScreen: React.FC = () => {
  const { signInWithEmail, signUpWithEmail, authError, clearAuthError } = useUser();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, nome);
      }
    } catch {
      // Handled in UserContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMode = () => {
    clearAuthError();
    setMode((prev) => (prev === 'login' ? 'register' : 'login'));
  };

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
      <div className="max-w-md w-full mx-auto my-auto py-6">
        <div className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {/* Logo Glow */}
          <div className="relative mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-500 shadow-xl shadow-indigo-500/25">
            <span className="text-3xl">🧠</span>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-slate-900"></span>
            </span>
          </div>

          <h1 className="text-xl font-black tracking-tight text-white text-center">
            Lembrete <span className="text-indigo-400">Inteligente</span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-xs mx-auto text-center">
            {mode === 'login'
              ? 'Acesse com sua conta autenticada no Firebase'
              : 'Cadastre sua conta diretamente no Firebase'}
          </p>

          {/* Key Features Pill badges */}
          <div className="grid grid-cols-2 gap-2 mt-4 text-left">
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-bold">
                <Mic className="w-3.5 h-3.5" />
                Voz e Áudio
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comandos por voz ou texto.
              </p>
            </div>

            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                <Clock className="w-3.5 h-3.5" />
                Alertas e Prazos
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sons e adiamento inteligente.
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
                  type="button"
                  onClick={clearAuthError}
                  className="mt-1 text-[11px] underline text-rose-300 hover:text-white"
                >
                  Fechar aviso
                </button>
              </div>
            </div>
          )}

          {/* Firebase Email & Password Form */}
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            {mode === 'register' && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1 ml-1">
                  Seu Nome
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex: Michel Lima"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 ml-1">
                E-mail da Conta Firebase
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu-email@exemplo.com"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1 ml-1">
                Senha
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Primary Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Entrar com Conta Firebase</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Criar Conta Firebase</span>
                </>
              )}
            </button>
          </form>

          {/* Toggle Login / Register */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              {mode === 'login'
                ? 'Não tem conta? Cadastrar no Firebase'
                : 'Já possui uma conta? Fazer login'}
            </button>
          </div>

          {/* Production & Security badge */}
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Autenticação direta via Firebase Auth</span>
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
