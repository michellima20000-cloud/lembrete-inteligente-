/**
 * High-performance Image Preloader & In-Memory Decoder
 * Warms the browser's decoded image cache so images render instantly with zero layout shifts or stutter.
 */

const preloadedUrls = new Set<string>();

/**
 * Preloads a single image and forces hardware decoding if supported
 */
export function preloadImage(src: string): Promise<boolean> {
  if (!src) return Promise.resolve(false);
  if (preloadedUrls.has(src)) return Promise.resolve(true);

  return new Promise((resolve) => {
    try {
      const img = new Image();
      let resolved = false;

      const finish = (success: boolean) => {
        if (!resolved) {
          resolved = true;
          if (success) preloadedUrls.add(src);
          resolve(success);
        }
      };

      img.onload = () => {
        if ('decode' in img && typeof img.decode === 'function') {
          img.decode().then(() => finish(true)).catch(() => finish(true));
        } else {
          finish(true);
        }
      };

      img.onerror = () => finish(false);

      // Timeout safeguard to avoid hanging on slow/offline connections
      setTimeout(() => finish(false), 3000);

      img.src = src;
    } catch {
      resolve(false);
    }
  });
}

/**
 * Preloads multiple images concurrently
 */
export async function preloadImages(urls: string[]): Promise<boolean[]> {
  const valid = urls.filter((u) => typeof u === 'string' && u.trim().length > 0);
  return Promise.all(valid.map((u) => preloadImage(u)));
}

/**
 * Critical app images to preload immediately on startup
 */
export const CRITICAL_APP_IMAGES = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  '/icon-maskable-512.png',
];

/**
 * Initiates preloading of critical assets immediately
 */
export function startCriticalImagePreloading(): void {
  if (typeof window !== 'undefined') {
    // Run on idle or next tick so it doesn't compete with initial JS execution
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        preloadImages(CRITICAL_APP_IMAGES).catch(() => {});
      }, { timeout: 1500 });
    } else {
      setTimeout(() => {
        preloadImages(CRITICAL_APP_IMAGES).catch(() => {});
      }, 50);
    }
  }
}
