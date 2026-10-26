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
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ onClose }) => {
  const {
    isInstallable,
    isIOS,
    isAndroid,
    isInIframe,
    copied,
    install,
    copyAppUrl,
    openDirectInChrome,
    getCleanAppUrl,
  } = usePWAInstall();

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

  const cleanUrl = getCleanAppUrl();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-indigo-500/30 p-5 sm:p-6 shadow-2xl text-slate-100 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt="Lembrete Inteligente"
              className="w-12 h-12 rounded-2xl shadow-md border border-indigo-500/40 object-cover"
            />
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5">
                <span>Instalar no Celular</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h2>
              <p className="text-xs text-slate-400">
                Fixe o app na tela inicial e receba alarmes confiáveis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-4 py-2 mt-2">
          {/* If successfully installed */}
          {installSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Aplicativo Instalado com Sucesso!</h3>
              <p className="text-xs text-slate-300">
                O Lembrete Inteligente já está fixado na sua tela inicial como aplicativo nativo.
              </p>
            </div>
          ) : (
            <>
              {/* Top Anti-Bank Notice / Direct Install Option */}
              {isInstallable ? (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-900/90 via-purple-900/80 to-indigo-900/90 border border-indigo-400/50 shadow-lg space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-indigo-100 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Pronto para Instalação Nativa
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      1 Toque Direto
                    </span>
                  </div>
                  <p className="text-xs text-indigo-200/90 leading-relaxed">
                    Instale diretamente no sistema operacional do aparelho, sem abrir banco ou outros apps:
                  </p>
                  <button
                    type="button"
                    onClick={handleNativeInstall}
                    disabled={isInstalling}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-black shadow-lg shadow-indigo-600/40 transition cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isInstalling ? 'Instalando...' : 'Instalar no Celular Agora'}</span>
                  </button>
                </div>
              ) : null}

              {/* Explanatory callout about preventing external banking apps from intercepting */}
              <div className="p-3 rounded-2xl bg-slate-800/60 border border-indigo-500/20 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Por que o celular abriu o banco antes?</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  No Android, quando links em pré-visualização são abertos em abas genéricas, o sistema do celular tenta associar a aplicativos bancários ou pagamentos. Siga o passo a passo abaixo para fixar o aplicativo <strong>diretamente no Chrome</strong> sem abrir outros apps.
                </p>
              </div>

              {/* Platform Selector Tabs */}
              <div className="flex items-center p-1 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedPlatform('android')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition cursor-pointer ${
                    selectedPlatform === 'android'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Android (Chrome)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlatform('ios')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition cursor-pointer ${
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
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition cursor-pointer ${
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
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3.5">
                {/* Android Guide */}
                {selectedPlatform === 'android' && (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        1
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white flex items-center gap-1">
                          No Google Chrome, toque nos 3 pontinhos
                          <MoreVertical className="w-3.5 h-3.5 text-indigo-400" />
                        </p>
                        <p className="text-slate-400 text-[11px] mt-0.5">
                          Fica no canto superior direito do seu navegador Google Chrome.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        2
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white flex items-center gap-1">
                          Toque em "Instalar aplicativo"
                          <Download className="w-3.5 h-3.5 text-emerald-400" />
                        </p>
                        <p className="text-slate-400 text-[11px] mt-0.5">
                          Ou <span className="text-indigo-300 font-semibold">"Adicionar à tela inicial"</span> no menu do navegador.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        3
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white flex items-center gap-1">
                          Confirme em "Instalar"
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        </p>
                        <p className="text-slate-400 text-[11px] mt-0.5">
                          O ícone do Lembrete Inteligente ficará nos seus apps nativos e nunca mais abrirá no banco.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* iOS Guide */}
                {selectedPlatform === 'ios' && (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        1
                      </div>
                      <div className="flex-1">
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
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        2
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white flex items-center gap-1">
                          Selecione "Adicionar à Tela de Início"
                          <PlusSquare className="w-3.5 h-3.5 text-indigo-400" />
                        </p>
                        <p className="text-slate-400 text-[11px] mt-0.5">
                          Role as opções para baixo até encontrar a opção com sinal de mais (+).
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        3
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-white flex items-center gap-1">
                          Toque em "Adicionar"
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
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        1
                      </div>
                      <div className="flex-1">
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
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white font-black text-xs shrink-0 mt-0.5 shadow-sm">
                        2
                      </div>
                      <div className="flex-1">
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

              {/* Action Buttons to Safely Open or Copy Link (Prevents opening Bank or Third-Party apps) */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                  Opções de Acesso Direto:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Button 1: Force open in official Chrome package (Android) */}
                  <button
                    type="button"
                    onClick={openDirectInChrome}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs font-bold border border-indigo-500/30 transition cursor-pointer active:scale-95 shadow-md"
                  >
                    <Compass className="w-3.5 h-3.5 text-indigo-200" />
                    <span>{isAndroid ? 'Abrir no Google Chrome' : 'Abrir em Janela Direta'}</span>
                  </button>

                  {/* Button 2: Copy clean URL to paste into Chrome */}
                  <button
                    type="button"
                    onClick={copyAppUrl}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 ${
                      copied
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-white" />
                        <span>Link Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-300" />
                        <span>Copiar Link do App</span>
                      </>
                    )}
                  </button>
                </div>

                {copied && (
                  <p className="text-[11px] text-emerald-400 text-center font-medium animate-in fade-in">
                    ✓ Link copiado! Cole na barra de endereços do Google Chrome no celular para instalar direto.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            PWA Standalone &bull; 100% Offline
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

