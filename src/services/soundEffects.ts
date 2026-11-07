/**
 * Studio MacroPad - Web Audio Mechanical Sound Synthesizer
 * Provides tactile acoustic feedback for Cherry MX tactile switches and knurled encoder clicks.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastDialTickMs = 0;

  constructor() {
    // Lazy audio context initialization on first interaction
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public get isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.playKeyClick();
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public playKeyClick() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Sharp mechanical bottom-out click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.04);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.045);
    } catch (_) {}
  }

  public playDialTick() {
    if (!this.enabled) return;
    const nowWall = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowWall - this.lastDialTickMs < 42) return;
    this.lastDialTickMs = nowWall;

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // High-frequency metallic ratchet detent
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.018);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);
    } catch (_) {}
  }

  public playSuccessChime() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Pure two-tone harmonic chime (C6 -> G6)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now); // C6
      osc1.frequency.exponentialRampToValueAtTime(1567.98, now + 0.12); // G6

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1318.51, now + 0.05); // E6

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    } catch (_) {}
  }

  public playHapticBlip() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.025);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (_) {}
  }
}

export const soundEngine = new SoundEngine();
