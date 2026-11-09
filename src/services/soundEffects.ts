/**
 * Studio MacroPad - Web Audio Mechanical Sound Synthesizer
 * Provides tactile acoustic feedback for Cherry MX tactile switches and knurled encoder clicks.
 */

export type SoundProfile = 'thock' | 'click' | 'tactile';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private profile: SoundProfile = 'thock';
  private lastDialTickMs = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bertopad_sound_profile') as SoundProfile;
        if (saved && (saved === 'thock' || saved === 'click' || saved === 'tactile')) {
          this.profile = saved;
        }
      } catch {}
    }
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

  public get soundProfile(): SoundProfile {
    return this.profile;
  }

  public setProfile(profile: SoundProfile) {
    this.profile = profile;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('bertopad_sound_profile', profile);
      } catch {}
    }
    this.playKeyClick();
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

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(6);
      } catch {}
    }

    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (this.profile === 'thock') {
        // Deep Holy Panda / Ink acoustic thock with low-end resonance
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.055);

        gain.gain.setValueAtTime(0.38, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

        // High transient tap
        const clickOsc = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        clickOsc.type = 'triangle';
        clickOsc.frequency.setValueAtTime(620, now);
        clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.015);
        clickGain.gain.setValueAtTime(0.18, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
        clickOsc.connect(clickGain);
        clickGain.connect(this.ctx.destination);
        clickOsc.start(now);
        clickOsc.stop(now + 0.018);
      } else if (this.profile === 'click') {
        // Crisp Cherry MX Blue dual-stage snap
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1450, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.028);

        gain.gain.setValueAtTime(0.32, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);
      } else {
        // Classic Cherry Brown tactile bottom-out
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.04);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
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
