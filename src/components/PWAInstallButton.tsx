import React, { useState } from 'react';
import { Download, CheckCircle2, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ModalLoadingFallback } from './skeletons/ModalLoadingFallback';

const PWAInstallModal = React.lazy(() =>
  import('./PWAInstallModal').then((m) => ({ default: m.PWAInstallModal }))
);

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already installed and running standalone as PWA, show discreet badge
  if (isInstalled) {
    return (
      <div
        className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold"
        title="Aplicativo já instalado no dispositivo"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Instalado</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    // 1. If native browser install prompt is directly available, trigger it first
    if (isInstallable) {
      try {
        const accepted = await install();
        if (accepted) return;
      } catch {}
    }

    // 2. Otherwise open the full mobile/desktop installation guide modal
    setShowModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-400/30 shadow-md shadow-indigo-600/20 transition active:scale-95 cursor-pointer text-xs font-bold"
        title="Instalar aplicativo no seu celular ou computador"
        aria-label="Instalar aplicativo"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden xs:inline sm:inline">Instalar App</span>
        <span className="inline xs:hidden sm:hidden">Instalar</span>
      </button>

      {showModal && (
        <React.Suspense fallback={<ModalLoadingFallback />}>
          <PWAInstallModal onClose={() => setShowModal(false)} />
        </React.Suspense>
      )}
    </>
  );
};
