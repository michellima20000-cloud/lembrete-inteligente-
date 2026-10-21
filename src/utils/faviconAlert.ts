// Dynamic Favicon Alert for Background & Minimized Tab Visibility
// Flashes the tab icon with a bright red ringing alarm badge when an alarm is sounding.

class FaviconAlertManager {
  private originalFaviconHref: string = '/icon.svg';
  private isAlerting = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private alertDataUri: string | null = null;
  private toggleState = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (link) {
        this.originalFaviconHref = link.href;
      }
      this.generateAlarmFavicon();
    }
  }

  private generateAlarmFavicon() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw red alert circle background
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fill();

      // Inner white bell outline or exclamation symbol
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏰', 32, 34);

      this.alertDataUri = canvas.toDataURL('image/png');
    } catch {
      // Fallback
    }
  }

  private setFavicon(href: string) {
    if (typeof document === 'undefined') return;
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  public startAlert() {
    if (this.isAlerting) return;
    this.isAlerting = true;
    this.toggleState = false;

    if (!this.alertDataUri) {
      this.generateAlarmFavicon();
    }

    if (this.intervalId) clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      this.toggleState = !this.toggleState;
      this.setFavicon(this.toggleState && this.alertDataUri ? this.alertDataUri : this.originalFaviconHref);
    }, 750);
  }

  public stopAlert() {
    this.isAlerting = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.setFavicon(this.originalFaviconHref);
  }
}

export const faviconAlert = new FaviconAlertManager();
