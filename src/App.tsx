import React, { useState } from 'react';
import { UserProvider, useUser } from './context/UserContext';
import { RemindersProvider } from './context/RemindersContext';
import { Header } from './components/Header';
import { VoiceAndTextInput } from './components/VoiceAndTextInput';
import { TimelineAgenda } from './components/TimelineAgenda';
import { ActiveAlarmModal } from './components/ActiveAlarmModal';
import { ManualAddModal } from './components/ManualAddModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LoginScreen } from './components/LoginScreen';
import { PushNotificationBanner } from './components/PushNotificationBanner';
import { MobilePWAInstallBanner } from './components/MobilePWAInstallBanner';

function MainApp() {
  const { isAuthenticated, isAuthReady } = useUser();
  const [showManualModal, setShowManualModal] = useState(false);

  // Loading state while Firebase checks auth token (only if no cached user session)
  if (!isAuthReady && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/30 animate-pulse">
          ⏰
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-400">
          Iniciando Lembrete Inteligente...
        </p>
      </div>
    );
  }

  // If not authenticated, require Google login
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-4 sm:py-6 space-y-4">
        {/* PWA Mobile Installation Banner */}
        <MobilePWAInstallBanner />

        {/* Push Notifications Activation / Status Banner */}
        <PushNotificationBanner />

        {/* Voice and Text AI Brain Input */}
        <VoiceAndTextInput onOpenManualModal={() => setShowManualModal(true)} />

        {/* Timeline Agenda strictly ordered */}
        <TimelineAgenda />
      </main>

      {/* Footer / Mobile Safe Area */}
      <footer className="w-full max-w-2xl mx-auto px-4 py-6 text-center text-xs text-slate-500 border-t border-slate-900 mt-auto">
        <p className="flex items-center justify-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Lembrete Inteligente &bull; Agenda de Lembretes e Compromissos
        </p>
      </footer>

      {/* Overlays & Modals */}
      {showManualModal && <ManualAddModal onClose={() => setShowManualModal(false)} />}
      <ActiveAlarmModal />
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <UserProvider>
      <RemindersProvider>
        <MainApp />
      </RemindersProvider>
    </UserProvider>
  );
}
