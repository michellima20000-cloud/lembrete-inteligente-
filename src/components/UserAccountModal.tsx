import React from 'react';
import { X, ShieldCheck, LogOut, Flame, Mail, User, CheckCircle2, Volume2, Bell, Download } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useReminders } from '../context/RemindersContext';
import { PWAInstallButton } from './PWAInstallButton';
import firebaseConfig from '../../firebase-applet-config.json';

interface UserAccountModalProps {
  onClose: () => void;
}

export const UserAccountModal: React.FC<UserAccountModalProps> = ({ onClose }) => {
  const { currentUser, firebaseUser, signOutFirebase } = useUser();
  const { testSound, notificationPermission, requestNotificationPermission } = useReminders();

  if (!currentUser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Conta Autenticada</h2>
              <p className="text-xs text-slate-400">Firebase Authentication</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-center">
          {firebaseUser?.photoURL ? (
            <img
              src={firebaseUser.photoURL}
              alt={currentUser.nome}
              className="w-16 h-16 rounded-full mx-auto object-cover border-2 border-indigo-500 shadow-md"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-xl font-bold text-white shadow-md"
              style={{ backgroundColor: currentUser.avatarCor }}
            >
              {currentUser.nome.charAt(0).toUpperCase()}
            </div>
          )}

          <h3 className="mt-3 font-bold text-white text-base">{currentUser.nome}</h3>
          {currentUser.email && (
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1 mt-0.5">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              {currentUser.email}
            </p>
          )}

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {firebaseUser ? 'Autenticado no Firebase' : currentUser?.email ? 'Conta Sincronizada' : 'Modo Convidado'}
          </div>
        </div>

        {/* Alert & Sound settings */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-800/70 border border-slate-700/70 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-amber-400" />
              Alarme Alto:
            </span>
            <button
              onClick={testSound}
              className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] transition cursor-pointer"
            >
              Testar Som Agora
            </button>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/50">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-emerald-400" />
              Alertas Celular:
            </span>
            {notificationPermission === 'granted' ? (
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ativado
              </span>
            ) : (
              <button
                onClick={requestNotificationPermission}
                className="px-2.5 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] transition cursor-pointer"
              >
                Permitir Alertas
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/50">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-indigo-400" />
              Instalar App:
            </span>
            <PWAInstallButton />
          </div>
        </div>

        {/* Firebase Project Info */}
        <div className="mt-4 p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-amber-300">
              <Flame className="w-4 h-4 text-amber-400" />
              Projeto Firebase:
            </span>
            <span className="font-mono text-amber-200 text-[11px] truncate max-w-[140px]">
              {firebaseConfig.projectId || 'gen-lang-client-0682320671'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>ID do Usuário (UID):</span>
            <span className="font-mono text-slate-300 truncate max-w-[140px]">
              {currentUser.id}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          <button
            onClick={() => {
              signOutFirebase();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-500/40 text-rose-300 font-bold text-xs transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {firebaseUser ? 'Sair da Conta Firebase' : 'Sair da Conta'}
          </button>
        </div>
      </div>
    </div>
  );
};
