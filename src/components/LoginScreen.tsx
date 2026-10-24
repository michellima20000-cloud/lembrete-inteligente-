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

export const LoginScreen: React.FC = () => {
  const {
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    authError,
    clearAuthError,
    recentEmails,
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
    if (!email.trim()) return;
    if (mode === 'register' && !password.trim()) return;

    setResetSentMessage(null);
    clearAuthError();
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
      setResetSentMessage(`Instruções de redefinição de senha processadas para ${cleanEmail}!`);
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
              ? 'Entre com sua conta para acessar e sincronizar'
              : 'Cadastre sua conta para sincronizar seus lembretes'}
          </p>

          <div className="mt-5" />

          {/* Primary 1-Tap Google Sign-In */}
          <button
            type="button"
            onClick={async () => {
              clearAuthError();
              setIsSubmitting(true);
              try {
                await signInWithGoogle();
              } catch (err: any) {
                // Ignore popup cancels
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
            className="w-full py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs shadow-lg flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continuar com o Google</span>
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">
              ou com e-mail
            </span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Mode Switch Tabs (Entrar / Cadastrar) */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-slate-800/80 border border-slate-700/60">
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
                  inputMode="email"
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
              {recentEmails && recentEmails.length > 0 && !email && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 ml-1">
                  <span className="text-[10px] text-slate-400">Recente:</span>
                  {recentEmails.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setEmail(item)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] text-indigo-300 hover:text-white transition cursor-pointer"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
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
                  required={mode === 'register'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'login' ? 'Digite sua senha (ou deixe em branco)' : 'Mínimo 6 caracteres'}
                  minLength={mode === 'register' ? 6 : undefined}
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
