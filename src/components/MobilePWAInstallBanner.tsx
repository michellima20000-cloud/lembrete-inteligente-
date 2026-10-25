import React, { useState } from 'react';
import { Smartphone, Download, X, Sparkles, CheckCircle2, Apple } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PWAInstallModal } from './PWAInstallModal';

export const MobilePWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isMobile, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('lembrete_pwa_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  // Do not show if already running in standalone mode (installed) or dismissed by user
  if (isInstalled || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('lembrete_pwa_banner_dismissed', 'true');
    } catch {}
  };

  const handleInstallAction = async () => {
    if (isInstallable) {
      try {
        const accepted = await install();
        if (accepted) return;
      } catch {}
    }
    setShowModal(true);
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-500/40 p-3.5 sm:p-4 shadow-xl backdrop-blur-md animate-in fade-in duration-300">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 shrink-0">
              <Smartphone className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                  <span>Instalar no Celular</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-200 border border-purple-400/30">
                  {isIOS ? 'iPhone' : isAndroid ? 'Android' : 'PWA'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                Adicione o ícone na sua tela inicial para abrir como app nativo com navegação fluida e alarmes em segundo plano.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-center shrink-0">
            <button
              type="button"
              onClick={handleInstallAction}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] text-white text-xs font-black shadow-lg shadow-purple-600/30 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'Instalar com 1 Toque' : isIOS ? 'Como Instalar no iPhone' : 'Instalar Aplicativo'}</span>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition shrink-0 cursor-pointer"
              title="Fechar aviso de instalação"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showModal && <PWAInstallModal onClose={() => setShowModal(false)} />}
    </>
  );
};
