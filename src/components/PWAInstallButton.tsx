import React, { useState } from 'react';
import {
  Download,
  Share2,
  PlusSquare,
  X,
  Smartphone,
  Monitor,
  MoreVertical,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'android' | 'ios' | 'desktop'>(() => {
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'android';
  });

  // If already running standalone inside installed PWA, show discreet badge
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
    if (isInstallable) {
      const success = await install();
      if (!success) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      {/* Discreet and simple install button */}
      <button
        type="button"
        onClick={handleInstallClick}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-200 hover:text-white border border-indigo-500/30 hover:border-indigo-400/50 shadow-sm transition active:scale-95 cursor-pointer text-xs font-semibold"
        title="Instalar aplicativo / plugin no seu celular ou computador"
        aria-label="Instalar aplicativo"
      >
        <Download className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>Instalar</span>
      </button>

      {/* Installation Instruction Modal with guaranteed viewport centering & scrollability */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl text-slate-100 flex flex-col max-h-[90vh] animate-in zoom-in-95 overflow-hidden">
            {/* Header (pinned at top) */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 shrink-0 bg-slate-900">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-lg shrink-0">
                  📲
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                    <span>Instalar Aplicativo</span>
                    <span className="text-[10px] text-emerald-400 font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15">
                      PWA
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Atalho direto na tela inicial do seu celular</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto p-4 sm:p-5 space-y-3.5 flex-1 scrollbar-thin scrollbar-thumb-slate-700">
              {/* Direct 1-Click Install if supported by browser */}
              {isInstallable && (
                <div className="p-3 rounded-2xl bg-indigo-950/70 border border-indigo-500/40 flex items-center justify-between gap-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-indigo-200">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-semibold">Instalação Direta:</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowModal(false);
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition cursor-pointer shrink-0 active:scale-95"
                  >
                    Instalar Agora
                  </button>
                </div>
              )}

              {/* Tabs for different operating systems */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-800 border border-slate-700 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedTab('android')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    selectedTab === 'android'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Android</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTab('ios')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    selectedTab === 'ios'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>iPhone</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTab('desktop')}
                  className={`flex-1 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    selectedTab === 'desktop'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>Computador</span>
                </button>
              </div>

              {/* Tab Contents */}
              <div className="space-y-2.5 text-xs text-slate-300">
                {selectedTab === 'android' && (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 shadow-sm">
                      <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 mt-0.5 shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">1. Toque nos 3 pontos (⋮)</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          No canto superior direito do Google Chrome ou navegador do seu celular.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 shadow-sm">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                        <Download className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">2. "Instalar aplicativo"</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          Toque na opção <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {selectedTab === 'ios' && (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 shadow-sm">
                      <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 mt-0.5 shrink-0">
                        <Share2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">1. Botão Compartilhar (⎋)</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          Na barra inferior do navegador Safari do seu iPhone ou iPad.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 shadow-sm">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                        <PlusSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">2. "Adicionar à Tela de Início"</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          Role o menu para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {selectedTab === 'desktop' && (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 shadow-sm">
                      <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 mt-0.5 shrink-0">
                        <Download className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">1. Ícone na Barra de Endereço</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          Clique no ícone de instalação <strong>(⊕)</strong> no canto direito da barra de endereço do Chrome ou Edge.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/80 border border-slate-700/70 shadow-sm">
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-xs">2. Confirmar Instalação</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          O app será instalado como um aplicativo de desktop com ícone na área de trabalho.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Footer (pinned at bottom) */}
            <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition cursor-pointer"
              >
                Entendido, fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
