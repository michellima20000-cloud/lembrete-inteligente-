import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Apple,
  Laptop,
  Download,
  Share,
  PlusSquare,
  MoreVertical,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ onClose }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, install } = usePWAInstall();
  const [selectedPlatform, setSelectedPlatform] = useState<'android' | 'ios' | 'desktop'>(() => {
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'android';
  });
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  const handleNativeInstall = async () => {
    setIsInstalling(true);
    try {
      const ok = await install();
      if (ok) {
        setInstallSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1800);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-indigo-500/30 p-5 sm:p-6 shadow-2xl text-slate-100 overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="Lembrete Inteligente"
              className="w-12 h-12 rounded-2xl shadow-md border border-indigo-500/40 object-cover"
            />
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>Instalar Aplicativo</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h2>
              <p className="text-xs text-slate-400">
                Acesse direto da tela inicial com alarmes confiáveis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If successfully installed */}
        {installSuccess ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Aplicativo Instalado com Sucesso!</h3>
            <p className="text-xs text-slate-300">
              O Lembrete Inteligente já está disponível na sua tela de início.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Quick 1-Click Native Install Button if browser supports beforeinstallprompt */}
            {isInstallable && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-900/80 to-purple-900/70 border border-indigo-500/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-indigo-200">
                    Disponível para instalação direta:
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    1 Toque
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleNativeInstall}
                  disabled={isInstalling}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-black shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isInstalling ? 'Instalando...' : 'Instalar no Meu Aparelho Agora'}</span>
                </button>
              </div>
            )}

            {/* Platform Selector Tabs */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedPlatform('android')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition ${
                  selectedPlatform === 'android'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlatform('ios')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition ${
                  selectedPlatform === 'ios'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Apple className="w-3.5 h-3.5" />
                <span>iPhone / iPad</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlatform('desktop')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition ${
                  selectedPlatform === 'desktop'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Computador</span>
              </button>
            </div>

            {/* Instruction Guides per Platform */}
            <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-3">
              {/* Android Guide */}
              {selectedPlatform === 'android' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Abra o menu do Chrome
                        <MoreVertical className="w-3.5 h-3.5 text-indigo-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        No canto superior direito do Google Chrome, toque no botão de três pontinhos.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Toque em "Instalar aplicativo"
                        <Download className="w-3.5 h-3.5 text-indigo-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Também pode aparecer como <span className="text-indigo-300">"Adicionar à tela inicial"</span>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Confirme em "Instalar"
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        O ícone do Lembrete Inteligente ficará fixado nos seus aplicativos nativos.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* iOS Guide */}
              {selectedPlatform === 'ios' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Toque em Compartilhar no Safari
                        <Share className="w-3.5 h-3.5 text-indigo-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Na barra inferior do Safari no iPhone, toque no ícone de quadrado com a seta para cima (⎋).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Selecione "Adicionar à Tela de Início"
                        <PlusSquare className="w-3.5 h-3.5 text-indigo-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Deslize as opções para baixo até encontrar o botão com sinal de mais (+).
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Toque em "Adicionar" no canto superior
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        Pronto! O aplicativo abrirá em tela cheia sem barras de navegação.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Desktop Guide */}
              {selectedPlatform === 'desktop' && (
                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Verifique a barra de endereços
                        <Download className="w-3.5 h-3.5 text-indigo-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        No Chrome ou Edge, clique no ícone de computador/instalação no canto direito da barra de URL.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1">
                        Clique em "Instalar"
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">
                        O Lembrete Inteligente abrirá em sua própria janela independente.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* If in iframe or preview, offer to open in standalone browser window */}
            {isInIframe && (
              <div className="pt-1">
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir em Janela Cheia para Habilitar Instalação</span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
