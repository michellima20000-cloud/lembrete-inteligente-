// Helper to detect if running inside an iframe (like AI Studio preview) or top-level window / PWA
export const isInsideIframe = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
};

export const openAppInDedicatedTab = () => {
  if (typeof window !== 'undefined') {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  }
};
