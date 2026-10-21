import React, { useState } from 'react';
import {
  Clock,
  Mic,
  AlertCircle,
  Mail,
  Lock,
  User,
  LogIn,
  UserPlus,
  Eye,
  EyeOff,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { PWAInstallButton } from './PWAInstallButton';
import { soundAlert } from '../utils/audioAlert';

export const LoginScreen: React.FC = () => {
  const {
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    authError,
    clearAuthError,
  } = useUser();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('lembrete_saved_email') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState(() => {
    try {
      return localStorage.getItem('lembrete_saved_pass') || '';
    } catch {
      return '';
    }
  });
  const [nome, setNome] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetSentMessage, setResetSentMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleQuickRegister = async () => {
    if (!email.trim() || !password.trim()) return;
    soundAlert.unlockAudio().catch(() => {});
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    setIsSubmitting(true);
    clearAuthError();
    try {
      await signUpWithEmail(email, password, nome || email.split('@')[0]);
    } catch {
      // Error handled in UserContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    soundAlert.unlockAudio().catch(() => {});
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    setResetSentMessage(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, nome);
      }
    } catch {
      // Handled and displayed via authError in UserContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setResetSentMessage(null);
      return;
    }
    setIsResetting(true);
    clearAuthError();
    try {
      await resetPassword(cleanEmail);
      setResetSentMessage(`E-mail de recuperação enviado para ${cleanEmail}! Abra sua caixa de entrada (ou pasta de spam) e clique no link para definir sua nova senha.`);
    } catch {
      // Error handled in UserContext
    } finally {
      setIsResetting(false);
    }
  };

  const switchMode = (newMode: 'login' | 'register') => {
    clearAuthError();
    setResetSentMessage(null);
    setMode(newMode);
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
              ? 'Entre com seu e-mail e senha para acessar'
              : 'Cadastre sua conta para sincronizar seus lembretes'}
          </p>

          {/* Mode Switch Tabs (Entrar / Cadastrar) */}
          <div className="mt-5 grid grid-cols-2 p-1 rounded-2xl bg-slate-800/80 border border-slate-700/60">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'login'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'register'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Cadastrar</span>
            </button>
          </div>

          <div className="mt-4" />

          {/* Reset Password Success Banner */}
          {resetSentMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2 text-left animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{resetSentMessage}</p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {authError && (
            <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 flex items-start gap-2.5 text-left animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold leading-relaxed">{authError}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={handleQuickRegister}
                      disabled={isSubmitting || password.length < 6}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-500/50 text-emerald-200 font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Cadastrar com este e-mail agora</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isResetting}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isResetting ? 'Enviando...' : 'Redefinir senha'}</span>
                  </button>
                  {authError.includes('já existe') && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-bold transition cursor-pointer"
                    >
                      Mudar para Entrar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="ml-auto text-[11px] underline text-slate-400 hover:text-white cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* Firebase Email & Password Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
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
                E-mail
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu-email@exemplo.com"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1 ml-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Senha
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isResetting}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1 cursor-pointer"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Esqueci a senha</span>
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-2xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 text-slate-400 hover:text-white transition p-1 cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Ver senha digitada'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4 text-indigo-400" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 ml-1">
                {showPassword
                  ? '👁️ Senha visível: confira se não há maiúsculas ou espaços indesejados.'
                  : 'Toque no olho para visualizar a senha antes de enviar.'}
              </p>
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
                  <span>Entrar</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Criar Conta</span>
                </>
              )}
            </button>
          </form>

          {/* Quick toggle at bottom */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition cursor-pointer font-medium"
            >
              {mode === 'login'
                ? 'Não tem conta? Cadastrar'
                : 'Já possui uma conta? Fazer login'}
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-2">
        <p>Lembrete Inteligente &bull; Agenda de Lembretes e Compromissos</p>
      </footer>
    </div>
  );
};
