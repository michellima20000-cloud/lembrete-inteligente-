import React, { useState, useEffect, Suspense, lazy } from 'react';
import { UserProvider, useUser } from './context/UserContext';
import { RemindersProvider } from './context/RemindersContext';
import { Header } from './components/Header';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PushNotificationBanner } from './components/PushNotificationBanner';
import { MobilePWAInstallBanner } from './components/MobilePWAInstallBanner';
import { TimelineSkeleton } from './components/skeletons/TimelineSkeleton';
import { VoiceInputSkeleton } from './components/skeletons/VoiceInputSkeleton';
import { ModalLoadingFallback } from './components/skeletons/ModalLoadingFallback';
import { startCriticalImagePreloading } from './utils/imagePreloader';

// Major components code-split with React.lazy
const LoginScreen = lazy(() =>
  import('./components/LoginScreen').then((m) => ({ default: m.LoginScreen }))
);

const VoiceAndTextInput = lazy(() =>
  import('./components/VoiceAndTextInput').then((m) => ({ default: m.VoiceAndTextInput }))
);

const TimelineAgenda = lazy(() =>
  import('./components/TimelineAgenda').then((m) => ({ default: m.TimelineAgenda }))
);

const ManualAddModal = lazy(() =>
  import('./components/ManualAddModal').then((m) => ({ default: m.ManualAddModal }))
);

const ActiveAlarmModal = lazy(() =>
  import('./components/ActiveAlarmModal').then((m) => ({ default: m.ActiveAlarmModal }))
);

function MainApp() {
  const { isAuthenticated, isAuthReady } = useUser();
  const [showManualModal, setShowManualModal] = useState(false);

  // Trigger high-performance hardware image preloading on startup
  useEffect(() => {
    startCriticalImagePreloading();
  }, []);

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

  // If not authenticated, require login screen (code-split via Suspense)
  if (!isAuthenticated) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/30 animate-pulse">
              ⏰
            </div>
            <p className="mt-4 text-xs font-semibold text-slate-400">Carregando...</p>
          </div>
        }
      >
        <LoginScreen />
      </Suspense>
    );
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

        {/* Voice and Text AI Brain Input (Code-split with fluid skeleton) */}
        <Suspense fallback={<VoiceInputSkeleton />}>
          <VoiceAndTextInput onOpenManualModal={() => setShowManualModal(true)} />
        </Suspense>

        {/* Timeline Agenda strictly ordered (Code-split with fluid skeleton) */}
        <Suspense fallback={<TimelineSkeleton />}>
          <TimelineAgenda />
        </Suspense>
      </main>

      {/* Footer / Mobile Safe Area */}
      <footer className="w-full max-w-2xl mx-auto px-4 py-6 text-center text-xs text-slate-500 border-t border-slate-900 mt-auto">
        <p className="flex items-center justify-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Lembrete Inteligente &bull; Agenda de Lembretes e Compromissos
        </p>
      </footer>

      {/* Overlays & Modals (Code-split and loaded on-demand via Suspense) */}
      {showManualModal && (
        <Suspense fallback={<ModalLoadingFallback />}>
          <ManualAddModal onClose={() => setShowManualModal(false)} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <ActiveAlarmModal />
      </Suspense>

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
