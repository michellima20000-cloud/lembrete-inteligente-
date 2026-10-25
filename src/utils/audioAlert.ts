// High-Volume Continuous Looping Synthesizer & Alarm Engine
// Engineered for piercing, loud reminder alarms that wake mobile devices and desktop speakers.
// Specifically optimized for Android PWA background playback and lock-screen ringing:
// 1. Single persistent HTML5 Audio element pre-loaded with loud alarm WAV siren
// 2. Continuous background Audio Focus keep-alive (un-throttled by Android Doze)
// 3. Instant volume ramping (0.0001 -> 1.0) on alarm trigger: completely bypasses mobile Autoplay restrictions
// 4. Android Lock Screen MediaSession integration with interactive Snooze and Dismiss actions
// 5. Dual-engine Web Audio compressor and multi-oscillator harmonic booster

export type MediaSessionActionCallback = (action: 'pause' | 'stop' | 'nexttrack' | 'previoustrack') => void;

function createAlarmWavDataUri(): string {
  // Generate a 1.2 second loud dual-tone digital alarm sample
  const sampleRate = 22050;
  const numChannels = 1;
  const duration = 1.2;
  const totalSamples = Math.floor(sampleRate * duration);
  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Synthesize 4 rapid loud penetrating alarm beeps: 980Hz and 1300Hz
  // Beep schedule in seconds: [0.0 - 0.14], [0.18 - 0.32], [0.36 - 0.50], [0.54 - 0.74]
  const beeps = [
    { start: 0.0, end: 0.14, freq: 980 },
    { start: 0.18, end: 0.32, freq: 1300 },
    { start: 0.36, end: 0.50, freq: 980 },
    { start: 0.54, end: 0.74, freq: 1300 },
  ];

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    for (const b of beeps) {
      if (t >= b.start && t <= b.end) {
        // High harmonic richness: fundamental sine + sharp square + octave harmonic
        const s1 = Math.sin(2 * Math.PI * b.freq * t);
        const s2 = Math.sign(Math.sin(2 * Math.PI * b.freq * t)) * 0.45;
        const s3 = Math.sin(4 * Math.PI * b.freq * t) * 0.3;
        sample = (s1 + s2 + s3) * 0.9;
        break;
      }
    }

    // Clamp 16-bit PCM
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

class SoundAlertManager {
  private audioCtx: AudioContext | null = null;
  private isSoundEnabled = true;
  private isRinging = false;
  // Single persistent HTMLAudioElement ensuring Android Audio Focus is never lost
  private primaryAudioElement: HTMLAudioElement | null = null;
  private isKeepAlivePlaying = false;
  private audioPlayPromise: Promise<void> | null = null;
  private webAudioInterval: ReturnType<typeof setInterval> | null = null;
  private vibrationInterval: ReturnType<typeof setInterval> | null = null;
  private cachedWavUri: string | null = null;
  private actionListeners: Set<MediaSessionActionCallback> = new Set();
  private currentReminderTitle = '';

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        try {
          const ctx = this.getAudioContext();
          if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          // Activate background media session and start persistent audio channel
          this.startBackgroundKeepAlive();

          if (this.isRinging) {
            this.startRingingAlarm(this.currentReminderTitle);
          }
        } catch {}
      };

      // Register multi-gesture unlock hooks
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('focus', unlockAudio, { passive: true });
      window.addEventListener('pageshow', unlockAudio, { passive: true });
    }
  }

  private handleAudioError(err: any) {
    if (!err) return;
    if (
      err.name === 'AbortError' ||
      (typeof err.message === 'string' && (err.message.includes('interrupted') || err.message.includes('pause')))
    ) {
      return;
    }
    if (err.name === 'NotAllowedError') {
      console.warn('[SoundAlert] Autoplay deferred until user interaction');
      return;
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Lazily initializes and returns the single persistent HTMLAudioElement.
   * This element is NEVER replaced or destroyed, ensuring Android keeps the AudioTrack active.
   */
  private getPrimaryAudioElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.primaryAudioElement) {
      try {
        if (!this.cachedWavUri) {
          this.cachedWavUri = createAlarmWavDataUri();
        }
        const audio = new Audio(this.cachedWavUri);
        audio.loop = true;
        audio.volume = 0.0001; // Silent baseline: maintains Android audio focus without sound
        audio.preload = 'auto';
        this.primaryAudioElement = audio;
      } catch (err) {
        console.warn('[SoundAlert] Could not initialize primary audio element:', err);
      }
    }
    return this.primaryAudioElement;
  }

  public setSoundEnabled(enabled: boolean) {
    this.isSoundEnabled = enabled;
    if (!enabled) {
      this.stopRingingAlarm();
      if (this.primaryAudioElement) {
        try {
          this.primaryAudioElement.pause();
          this.isKeepAlivePlaying = false;
        } catch {}
      }
    } else {
      this.startBackgroundKeepAlive();
    }
  }

  public getSoundEnabled(): boolean {
    return this.isSoundEnabled;
  }

  public getIsRinging(): boolean {
    return this.isRinging;
  }

  public onMediaSessionAction(cb: MediaSessionActionCallback): () => void {
    this.actionListeners.add(cb);
    return () => {
      this.actionListeners.delete(cb);
    };
  }

  private dispatchMediaSessionAction(action: 'pause' | 'stop' | 'nexttrack' | 'previoustrack') {
    this.actionListeners.forEach((cb) => {
      try { cb(action); } catch {}
    });
  }

  /**
   * Generates a single high-impact dual-tone alarm burst at maximum loudness via Web Audio.
   * Used to amplify the output when the browser tab is active.
   */
  public playAlarmBurst() {
    if (!this.isSoundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // DynamicsCompressor to amplify perceptible loudness without clipping
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, now);
      compressor.knee.setValueAtTime(30, now);
      compressor.ratio.setValueAtTime(14, now);
      compressor.attack.setValueAtTime(0.002, now);
      compressor.release.setValueAtTime(0.12, now);
      compressor.connect(ctx.destination);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.0, now);
      masterGain.connect(compressor);

      // 4 High-urgency penetrating beeps: [980Hz, 1300Hz, 980Hz, 1300Hz]
      const beeps = [
        { freq: 980, time: 0.0, dur: 0.14 },
        { freq: 1300, time: 0.18, dur: 0.14 },
        { freq: 980, time: 0.36, dur: 0.14 },
        { freq: 1300, time: 0.54, dur: 0.22 },
      ];

      beeps.forEach(({ freq, time, dur }) => {
        const start = now + time;
        const end = start + dur;

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);

        const sub = ctx.createOscillator();
        sub.type = 'square';
        sub.frequency.setValueAtTime(freq * 0.5, start);

        const overtone = ctx.createOscillator();
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, start);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.99, start);
        gain.gain.exponentialRampToValueAtTime(0.01, end);

        osc.connect(gain);
        sub.connect(gain);
        overtone.connect(gain);
        gain.connect(masterGain);

        osc.start(start);
        sub.start(start);
        overtone.start(start);
        osc.stop(end);
        sub.stop(end);
        overtone.stop(end);
      });

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([400, 100, 400, 100, 500]);
      }
    } catch (e) {
      console.warn('[SoundAlert] Could not play alarm burst:', e);
    }
  }

  /**
   * Starts the persistent audio keep-alive stream.
   * Runs at volume 0.0001 (digital silence), which claims Android Audio Focus and
   * informs Android that this tab is playing media — preventing process sleep.
   */
  public startBackgroundKeepAlive() {
    if (typeof window === 'undefined' || !this.isSoundEnabled) return;
    const audio = this.getPrimaryAudioElement();
    if (!audio) return;

    if (!this.isRinging) {
      audio.volume = 0.0001;
    }

    if (this.isKeepAlivePlaying && !audio.paused) return;

    try {
      const p = audio.play();
      if (p) {
        p.then(() => {
          this.isKeepAlivePlaying = true;
          this.registerMediaSession(this.isRinging, this.currentReminderTitle);
        }).catch((e) => {
          this.handleAudioError(e);
        });
      }
    } catch {}
  }

  /**
   * Registers mediaSession metadata so Android lock screen shows alarm controls.
   */
  public registerMediaSession(isAlarmRinging = false, reminderTitle?: string) {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        if (isAlarmRinging) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: `🚨 [ALARME] ${reminderTitle || 'Compromisso Agendado'}`,
            artist: 'Lembrete Inteligente (Toque para Ver)',
            album: 'Alarme em Execução Contínua',
            artwork: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          });
        } else {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: '⏰ Monitoramento de Alarmes Ativo',
            artist: 'Lembrete Inteligente',
            album: 'Execução em Segundo Plano 100%',
            artwork: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          });
        }

        navigator.mediaSession.playbackState = 'playing';

        // Play handler: wake / un-pause
        navigator.mediaSession.setActionHandler('play', () => {
          if (this.isRinging) {
            this.startRingingAlarm(this.currentReminderTitle);
          } else {
            this.startBackgroundKeepAlive();
          }
        });

        // Pause handler: user tapped Pause on the lock screen widget -> stops ringing!
        navigator.mediaSession.setActionHandler('pause', () => {
          this.stopRingingAlarm();
          this.dispatchMediaSessionAction('pause');
        });

        // Stop handler: user tapped Stop on the lock screen widget -> stops ringing!
        navigator.mediaSession.setActionHandler('stop', () => {
          this.stopRingingAlarm();
          this.dispatchMediaSessionAction('stop');
        });

        // Next Track handler: mapped to Snooze 10 minutes from lock screen!
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          this.stopRingingAlarm();
          this.dispatchMediaSessionAction('nexttrack');
        });

        // Previous Track handler: mapped to Complete from lock screen!
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          this.stopRingingAlarm();
          this.dispatchMediaSessionAction('previoustrack');
        });
      } catch {}
    }
  }

  /**
   * Starts continuous, loud, looping alarm ringing that NEVER stops on its own.
   * Continues sounding and vibrating UNTIL the user explicitly clicks Concluir or Adiar!
   *
   * KEY ARCHITECTURAL ADVANTAGE:
   * Since this.primaryAudioElement was ALREADY playing during keep-alive, ramping
   * volume to 1.0 does NOT count as a new autoplay, so Android allows it even
   * with the screen locked or tab minimized!
   */
  public startRingingAlarm(reminderTitle?: string) {
    if (!this.isSoundEnabled) return;
    this.isRinging = true;
    if (reminderTitle) {
      this.currentReminderTitle = reminderTitle;
    }

    const audio = this.getPrimaryAudioElement();
    if (audio) {
      // 1. Immediately ramp volume to 100% MAXIMUM PIERCING LOUDNESS
      audio.volume = 1.0;
      audio.loop = true;

      // 2. Restart playback position if already playing, or call play()
      try {
        audio.currentTime = 0;
      } catch {}

      if (audio.paused) {
        if (!this.audioPlayPromise) {
          this.audioPlayPromise = audio.play();
          this.audioPlayPromise
            ?.catch((err) => this.handleAudioError(err))
            .finally(() => {
              this.audioPlayPromise = null;
            });
        }
      }
    }

    this.registerMediaSession(true, this.currentReminderTitle);

    // 3. Play immediate Web Audio burst for maximum punch
    this.playAlarmBurst();

    // 4. Reset repeating timers to prevent overlapping intervals
    if (this.webAudioInterval) {
      clearInterval(this.webAudioInterval);
      this.webAudioInterval = null;
    }
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    // 5. Reinforcing Web Audio pulse every 1.2s when awake
    this.webAudioInterval = setInterval(() => {
      if (!this.isRinging || !this.isSoundEnabled) {
        this.stopRingingAlarm();
        return;
      }
      this.playAlarmBurst();
    }, 1200);

    // 6. Continuous mobile vibration loop: intense alternating buzzes
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([800, 250, 800, 250, 800, 250, 1200]);
      this.vibrationInterval = setInterval(() => {
        if (!this.isRinging) {
          if (this.vibrationInterval) clearInterval(this.vibrationInterval);
          return;
        }
        navigator.vibrate([800, 250, 800, 250, 800, 250, 1200]);
      }, 2500);
    }
  }

  /**
   * Stops the loud alarm ringing, lowering volume back to silent keep-alive.
   * DOES NOT PAUSE the element, maintaining Android Audio Focus for the next alarm!
   */
  public stopRingingAlarm() {
    this.isRinging = false;
    this.currentReminderTitle = '';

    // Drop volume back to 0.0001 (silent baseline), KEEP PLAYING to preserve Audio Focus
    if (this.primaryAudioElement) {
      this.primaryAudioElement.volume = 0.0001;
    }

    this.registerMediaSession(false);

    // Stop repeating timers
    if (this.webAudioInterval) {
      clearInterval(this.webAudioInterval);
      this.webAudioInterval = null;
    }
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    // Cancel active vibration
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }

  public playAlarm() {
    this.playAlarmBurst();
  }

  public playChime() {
    if (!this.isSoundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

      osc2.frequency.setValueAtTime(880, now + 0.15);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.35); // D6

      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.15);
      osc1.stop(now + 0.35);
      osc2.stop(now + 0.6);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([150, 80, 150]);
      }
    } catch (e) {
      console.warn('Audio chime could not play:', e);
    }
  }

  public playSuccess() {
    if (!this.isSoundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(80);
      }
    } catch (e) {
      console.warn('Success sound could not play:', e);
    }
  }
}

export const soundAlert = new SoundAlertManager();

// Safety lock: instantly re-activate AudioContext and force full alarm ringing when screen wakes or tab becomes visible
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (soundAlert.getIsRinging()) {
        soundAlert.startRingingAlarm();
      } else {
        soundAlert.startBackgroundKeepAlive();
      }
    }
  });
}
