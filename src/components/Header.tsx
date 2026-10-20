import React, { useState } from 'react';
import { Volume2, VolumeX, LogOut, Flame, CalendarCheck } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useReminders } from '../context/RemindersContext';
import { PWAInstallButton } from './PWAInstallButton';
import { UserAccountModal } from './UserAccountModal';

export const Header: React.FC = () => {
  const { currentUser, firebaseUser, signOutFirebase } = useUser();
  const { soundEnabled, toggleSound } = useReminders();

  const [showUserModal, setShowUserModal] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Brand & Status Indicator */}
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-500 shadow-md shadow-indigo-500/25">
              <CalendarCheck className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-black tracking-tight text-white">
                  Lembrete <span className="text-indigo-400">Inteligente</span>
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Agenda Conectada
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Firebase Cloud</span>
                <span className="text-slate-600">&bull;</span>
                <span className="text-emerald-400 font-medium">Conta Isolada</span>
              </p>
            </div>
          </div>

          {/* Actions & Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Sound Toggle */}
            <button
              onClick={toggleSound}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-900/60'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              }`}
              title={soundEnabled ? 'Som ativado (clique para desativar)' : 'Som desativado (clique para ativar)'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Authenticated User Chip */}
            {currentUser && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowUserModal(true)}
                  className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-2xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 transition"
                  title="Ver detalhes da conta autenticada"
                >
                  {firebaseUser?.photoURL ? (
                    <img
                      src={firebaseUser.photoURL}
                      alt={currentUser.nome}
                      className="w-6 h-6 rounded-full object-cover border border-indigo-400"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-xl flex items-center justify-center text-xs font-bold text-white shadow"
                      style={{ backgroundColor: currentUser.avatarCor }}
                    >
                      {currentUser.nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold text-white max-w-[80px] sm:max-w-[120px] truncate">
                    {currentUser.nome.split(' ')[0]}
                  </span>
                </button>

                {/* Direct Sign-Out Button */}
                <button
                  onClick={signOutFirebase}
                  className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 border border-slate-700/60 transition"
                  title="Sair da conta Google"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showUserModal && <UserAccountModal onClose={() => setShowUserModal(false)} />}
    </>
  );
};
