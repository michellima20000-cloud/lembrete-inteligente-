import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

// Downloads an internet shortcut file (.url) that directly launches the Web App as an installed shortcut
function downloadShortcutFile() {
  const currentUrl = window.location.origin || window.location.href;
  const shortcutContent = `[InternetShortcut]
URL=${currentUrl}
IconIndex=0
IconFile=${currentUrl}/icon-192.png
HotKey=0
IDList=
[{000214A0-0000-0000-C000-000000000046}]
Prop3=19,11
`;
  const blob = new Blob([shortcutContent], { type: 'application/internet-shortcut' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Lembrete-Inteligente.url';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showInNewTabLink, setShowInNewTabLink] = useState(false);

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
    // 1. Automatically trigger native browser install prompt if available
    let prompted = false;
    if (isInstallable) {
      try {
        prompted = await install();
      } catch {}
    }

    // 2. Automatically download the direct desktop/mobile shortcut file
    try {
      downloadShortcutFile();
    } catch (e) {
      console.warn('Erro ao baixar atalho:', e);
    }

    // 3. Detect if running inside an iframe (like AI Studio preview)
    const inIframe = window.self !== window.top;
    if (inIframe) {
      setShowInNewTabLink(true);
    }

    // 4. Show a clean, compact toast banner confirming the download/installation
    if (prompted) {
      setToastMessage('Instalação confirmada pelo navegador!');
    } else {
      setToastMessage('Download do atalho iniciado! Abra o arquivo baixado ou clique no ícone (+) na barra de endereço.');
    }

    setTimeout(() => {
      setToastMessage(null);
    }, 8000);
  };

  return (
    <>
      {/* Discreet and simple install button */}
      <button
        type="button"
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-200 hover:text-white border border-indigo-500/30 hover:border-indigo-400/50 shadow-sm transition active:scale-95 cursor-pointer text-xs font-semibold"
        title="Baixar instalador e instalar aplicativo no seu dispositivo"
        aria-label="Instalar aplicativo"
      >
        <Download className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>Instalar</span>
      </button>

      {/* Clean floating toast notification (NEVER cut off, no giant dialog) */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-md p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/50 text-slate-100 shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <p className="font-bold text-white flex items-center gap-1.5">
              <span>Instalação / Download Iniciado</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </p>
            <p className="text-slate-300 mt-0.5 leading-relaxed">{toastMessage}</p>

            {showInNewTabLink && (
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition"
              >
                <span>Abrir em Tela Cheia para Instalar</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};
