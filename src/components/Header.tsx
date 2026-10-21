import React, { useState } from 'react';
import { Volume2, VolumeX, LogOut, CalendarCheck, Bell, BellOff } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useReminders } from '../context/RemindersContext';
import { PWAInstallButton } from './PWAInstallButton';
import { UserAccountModal } from './UserAccountModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { soundAlert } from '../utils/audioAlert';

export const Header: React.FC = () => {
  const { currentUser, firebaseUser, signOutFirebase } = useUser();
  const { soundEnabled, toggleSound, notificationPermission, isIframe } = useReminders();

  const [showUserModal, setShowUserModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  const handleNotificationClick = () => {
    // Prime the audio engine on user gesture
    soundAlert.unlockAudio().catch(() => {});
    setShowNotificationModal(true);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <CalendarCheck className="w-4.5 h-4.5" />
            </div>
            <h1 className="text-base font-bold tracking-tight text-white">
              Lembrete <span className="text-indigo-400">Inteligente</span>
            </h1>
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

            {/* Web Notification Toggle & Background Alarm Settings */}
            <button
              onClick={handleNotificationClick}
              className={`p-2 rounded-xl transition-all cursor-pointer relative active:scale-95 ${
                notificationPermission === 'granted'
                  ? 'bg-indigo-950/60 text-emerald-300 border border-emerald-500/30 hover:bg-indigo-900/60'
                  : isIframe
                  ? 'bg-indigo-950/50 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-900/50'
                  : 'bg-slate-800 text-amber-300 border border-amber-500/30 hover:bg-slate-700 hover:text-amber-200'
              }`}
              title={
                notificationPermission === 'granted'
                  ? 'Notificações e alarme em segundo plano ativos'
                  : isIframe
                  ? 'Alarmes em segundo plano (Clique para abrir em aba direta)'
                  : 'Ativar notificações em segundo plano'
              }
              aria-label="Configurar alarmes e notificações em segundo plano"
            >
              {notificationPermission === 'granted' ? (
                <Bell className="w-4 h-4 text-emerald-400" />
              ) : isIframe ? (
                <Bell className="w-4 h-4 text-indigo-400" />
              ) : (
                <BellOff className="w-4 h-4 text-amber-400" />
              )}
              {notificationPermission === 'granted' ? (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ) : isIframe ? (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-400" />
              ) : (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
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
      {showNotificationModal && (
        <NotificationSettingsModal onClose={() => setShowNotificationModal(false)} />
      )}
    </>
  );
};
