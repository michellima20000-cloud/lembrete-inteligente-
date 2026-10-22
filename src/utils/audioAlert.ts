// High-Volume Continuous Looping Synthesizer & Alarm Engine
// Engineered for piercing, loud reminder alarms that wake mobile devices and desktop speakers.
// Uses dual-engine architecture:
// 1. Looping HTML5 Audio element backed by a synthesized loud WAV siren buffer (immune to background timer throttling)
// 2. Web Audio API with DynamicsCompressor and multi-oscillator harmonic boosting for maximum acoustic pressure

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

  // Synthesize 4 rapid loud penetrating alarm beeps: 950Hz and 1300Hz
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
  private loopAudioElement: HTMLAudioElement | null = null;
  private audioPlayPromise: Promise<void> | null = null;
  private webAudioInterval: ReturnType<typeof setInterval> | null = null;
  private vibrationInterval: ReturnType<typeof setInterval> | null = null;
  private cachedWavUri: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        try {
          const ctx = this.getAudioContext();
          if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          if (this.loopAudioElement && this.loopAudioElement.paused && this.isRinging) {
            if (!this.audioPlayPromise) {
              this.audioPlayPromise = this.loopAudioElement.play();
              this.audioPlayPromise
                ?.catch((err) => this.handleAudioError(err))
                .finally(() => {
                  this.audioPlayPromise = null;
                });
            }
          }
        } catch {}
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  private handleAudioError(err: any) {
    if (!err) return;
    // Gracefully ignore AbortError caused by pause() interrupting play() when user dismisses/snoozes
    if (
      err.name === 'AbortError' ||
      (typeof err.message === 'string' && (err.message.includes('interrupted') || err.message.includes('pause')))
    ) {
      return;
    }
    // Autoplay restrictions are normal before the first user gesture
    if (err.name === 'NotAllowedError') {
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

  private getLoopAudioElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.loopAudioElement) {
      try {
        if (!this.cachedWavUri) {
          this.cachedWavUri = createAlarmWavDataUri();
        }
        const audio = new Audio(this.cachedWavUri);
        audio.loop = true;
        audio.volume = 1.0;
        audio.preload = 'auto';
        this.loopAudioElement = audio;
      } catch (err) {
        console.warn('Could not initialize loop audio element:', err);
      }
    }
    return this.loopAudioElement;
  }

  public setSoundEnabled(enabled: boolean) {
    this.isSoundEnabled = enabled;
    if (!enabled) {
      this.stopRingingAlarm();
    }
  }

  public getSoundEnabled(): boolean {
    return this.isSoundEnabled;
  }

  public getIsRinging(): boolean {
    return this.isRinging;
  }

  /**
   * Generates a single high-impact dual-tone alarm burst at maximum loudness.
   * Uses DynamicsCompressor to amplify output to the limit without distortion.
   */
  public playAlarmBurst() {
    if (!this.isSoundEnabled) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      // Compressor to maximize perceptible loudness
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-14, now);
      compressor.knee.setValueAtTime(30, now);
      compressor.ratio.setValueAtTime(14, now);
      compressor.attack.setValueAtTime(0.002, now);
      compressor.release.setValueAtTime(0.12, now);
      compressor.connect(ctx.destination);

      // Master gain booster
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

        // Primary tone (sawtooth for piercing sharpness)
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, start);

        // Sub/harmonic tone for body and room presence
        const sub = ctx.createOscillator();
        sub.type = 'square';
        sub.frequency.setValueAtTime(freq * 0.5, start);

        // High overtone
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

      // Powerful mobile vibration
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([400, 100, 400, 100, 500]);
      }
    } catch (e) {
      console.warn('Could not play alarm burst:', e);
    }
  }

  /**
   * Starts continuous, loud, looping alarm ringing that NEVER stops on its own.
   * Continues sounding and vibrating UNTIL the user explicitly clicks Concluir or Adiar!
   */
  public startRingingAlarm() {
    if (!this.isSoundEnabled) return;
    this.isRinging = true;

    // 1. Play continuous HTML5 looping audio (immune to background tab throttling)
    try {
      const audio = this.getLoopAudioElement();
      if (audio) {
        audio.volume = 1.0;
        if (this.audioPlayPromise) {
          this.audioPlayPromise = this.audioPlayPromise
            .then(() => {
              if (this.isRinging && audio.paused) {
                try {
                  audio.currentTime = 0;
                } catch {}
                return audio.play();
              }
            })
            .catch((err) => this.handleAudioError(err));
        } else {
          try {
            audio.currentTime = 0;
          } catch {}
          this.audioPlayPromise = audio.play();
          this.audioPlayPromise
            ?.catch((err) => this.handleAudioError(err))
            .finally(() => {
              this.audioPlayPromise = null;
            });
        }
      }
    } catch (e) {
      // Loop audio play deferred
    }

    // 2. Play immediate Web Audio burst for instant maximum loudness
    this.playAlarmBurst();

    // 3. Clear existing timers to avoid duplicate stacking
    if (this.webAudioInterval) {
      clearInterval(this.webAudioInterval);
      this.webAudioInterval = null;
    }
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    // 4. Foreground Web Audio reinforcing pulse every 1.2s
    this.webAudioInterval = setInterval(() => {
      if (!this.isRinging || !this.isSoundEnabled) {
        this.stopRingingAlarm();
        return;
      }
      this.playAlarmBurst();
    }, 1200);

    // 5. Continuous mobile vibration loop
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([600, 200, 600, 200, 800]);
      this.vibrationInterval = setInterval(() => {
        if (!this.isRinging) {
          if (this.vibrationInterval) clearInterval(this.vibrationInterval);
          return;
        }
        navigator.vibrate([600, 200, 600, 200, 800]);
      }, 2500);
    }
  }

  /**
   * Stops the continuous alarm ringing completely when user acts.
   */
  public stopRingingAlarm() {
    this.isRinging = false;

    // Stop HTML5 looping audio safely without interrupting in-flight play()
    if (this.loopAudioElement) {
      const audio = this.loopAudioElement;
      if (this.audioPlayPromise) {
        this.audioPlayPromise
          .then(() => {
            if (!this.isRinging) {
              try {
                audio.pause();
                audio.currentTime = 0;
              } catch {}
            }
          })
          .catch(() => {})
          .finally(() => {
            this.audioPlayPromise = null;
          });
      } else {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {}
      }
    }

    // Stop repeating timers
    if (this.webAudioInterval) {
      clearInterval(this.webAudioInterval);
      this.webAudioInterval = null;
    }
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    // Cancel any active vibration
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
