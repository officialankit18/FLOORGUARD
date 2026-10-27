export class SoundAlertService {
  private static audioCtx: AudioContext | null = null;
  private static isSoundEnabled = false;
  private static alarmTimer: ReturnType<typeof setInterval> | null = null;
  public static startContinuousAlarm() {
    if (this.alarmTimer) return;
    this.playIntrusionAlarm();
    this.alarmTimer = setInterval(() => this.playIntrusionAlarm(), 1100);
  }
  public static stopContinuousAlarm() {
    if (this.alarmTimer) clearInterval(this.alarmTimer);
    this.alarmTimer = null;
  }

  public static setSoundEnabled(enabled: boolean) {
    this.isSoundEnabled = enabled;
    if (enabled && !this.audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      } catch (e) {
        console.warn('Web Audio API not supported on this browser:', e);
      }
    }
  }

  public static getSoundEnabled(): boolean {
    return this.isSoundEnabled;
  }

  private static ensureContext(): AudioContext | null {
    if (!this.isSoundEnabled) return null;
    if (!this.audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      } catch (e) {
        return null;
      }
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Play active intrusion alert buzzer (dual-tone oscillation)
   */
  public static playIntrusionAlarm() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.15);
      osc.frequency.linearRampToValueAtTime(800, now + 0.3);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.45);
      osc.frequency.linearRampToValueAtTime(800, now + 0.6);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.7);
    } catch (e) {
      console.warn('Audio alert playback error:', e);
    }
  }

  /**
   * Play positive chime for authorized known face match
   */
  public static playAuthorizedMatchTone() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch (_) {}
  }

  /**
   * Play subtle pressure tap chirp
   */
  public static playFootstepChirp() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (_) {}
  }
}
