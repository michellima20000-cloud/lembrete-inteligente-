import { useEffect, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    return (window as any).__pwaInstallPrompt || null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Detect true standalone mode (running as installed PWA on home screen / app launcher)
    // CRITICAL: Never use document.referrer.includes('android-app://') because that matches
    // anyone opening a link from WhatsApp, Telegram, Gmail, or any Android app!
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setIsInstalled(isStandalone);

    // Detect device platform & environment
    const userAgent = (window.navigator.userAgent || '').toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handlePromptAvailable = () => {
      if ((window as any).__pwaInstallPrompt) {
        setDeferredPrompt((window as any).__pwaInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      (window as any).__pwaInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-available', handlePromptAvailable);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-available', handlePromptAvailable);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    const prompt = deferredPrompt || (window as any).__pwaInstallPrompt;
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        (window as any).__pwaInstallPrompt = null;
        return true;
      }
    } catch (err) {
      console.warn('[PWA] Erro ao disparar prompt nativo de instalação:', err);
    }
    return false;
  };

  const getCleanAppUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    // Strip iframe/token parameters and return clean base URL
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    return url.origin + url.pathname;
  }, []);

  const copyAppUrl = useCallback(async (): Promise<boolean> => {
    const url = getCleanAppUrl();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      return true;
    } catch (err) {
      console.warn('[PWA] Falha ao copiar link:', err);
      return false;
    }
  }, [getCleanAppUrl]);

  /**
   * Abre a URL diretamente no Google Chrome nativo do Android
   * Isso evita que qualquer aplicativo de banco ou terceiro intercepte o link!
   */
  const openDirectInChrome = useCallback(() => {
    if (typeof window === 'undefined') return;
    const cleanUrl = getCleanAppUrl();
    const urlObj = new URL(cleanUrl);
    const hostAndPath = `${urlObj.host}${urlObj.pathname}`;

    if (isAndroid) {
      // Intent explícito para o pacote com.android.chrome
      // Garante que o Android abra EXCLUSIVAMENTE o Google Chrome
      const chromeIntent = `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = chromeIntent;
    } else {
      // Se estiver em iframe no iOS ou desktop, quebra o iframe com segurança
      if (window.top && window.top !== window.self) {
        try {
          window.top.location.href = cleanUrl;
        } catch {
          window.location.href = cleanUrl;
        }
      } else {
        window.location.href = cleanUrl;
      }
    }
  }, [getCleanAppUrl, isAndroid]);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const isMobile = isIOS || isAndroid || (typeof window !== 'undefined' && window.innerWidth <= 768);

  return {
    isInstallable: !!(deferredPrompt || (window as any)?.__pwaInstallPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    isMobile,
    isInIframe,
    copied,
    install,
    copyAppUrl,
    openDirectInChrome,
    getCleanAppUrl,
  };
}
