// High-Reliability Background Timer & Web Worker Ticker
// Bypasses browser background tab throttling (clamped setTimeout/setInterval) by leveraging
// an isolated Web Worker dedicated timer thread, augmented by visibilitychange & focus listeners.

type TickCallback = () => void;

class BackgroundTimerService {
  private worker: Worker | null = null;
  private fallbackInterval: ReturnType<typeof setInterval> | null = null;
  private subscribers = new Set<TickCallback>();
  private isRunning = false;

  constructor() {
    this.initWorker();
    this.bindWindowEvents();
  }

  private initWorker() {
    if (typeof window === 'undefined') return;

    try {
      // Inline Blob Worker avoids separate script bundling issues and executes on independent OS thread
      const workerCode = `
        var timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) {
              timer = setInterval(function() {
                self.postMessage('tick');
              }, 1000);
            }
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        if (e.data === 'tick') {
          this.notifySubscribers();
        }
      };

      this.worker.onerror = (err) => {
        console.warn('Web Worker timer warning, fallback active:', err);
        this.startFallback();
      };
    } catch (e) {
      console.warn('Could not initialize Worker, using fallback timer:', e);
      this.startFallback();
    }
  }

  private bindWindowEvents() {
    if (typeof window === 'undefined') return;

    // Immediately trigger a tick check when the user returns to the tab or unminimizes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.notifySubscribers();
      }
    });

    window.addEventListener('focus', () => {
      this.notifySubscribers();
    });
  }

  private startFallback() {
    if (!this.fallbackInterval) {
      this.fallbackInterval = setInterval(() => {
        this.notifySubscribers();
      }, 1000);
    }
  }

  private notifySubscribers() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error('Error in tick subscriber:', err);
      }
    });
  }

  public subscribe(cb: TickCallback): () => void {
    this.subscribers.add(cb);
    if (!this.isRunning) {
      this.start();
    }
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) {
        this.stop();
      }
    };
  }

  public start() {
    this.isRunning = true;
    if (this.worker) {
      try {
        this.worker.postMessage('start');
      } catch {}
    }
    this.startFallback();
  }

  public stop() {
    this.isRunning = false;
    if (this.worker) {
      try {
        this.worker.postMessage('stop');
      } catch {}
    }
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }
}

export const backgroundTimer = new BackgroundTimerService();
