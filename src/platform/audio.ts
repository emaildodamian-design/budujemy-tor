// Soft sounds only, synthesised on the device (no audio files, no network).
// Everything is quiet sine tones with slow fade-in/fade-out, so nothing is
// ever sudden or loud. Sound is OFF unless the parent enables it.

/** Hard ceiling for any sound, as linear gain (≈ -22 dB). */
export const MAX_GAIN = 0.08;
/** Minimum fade-in, so no sound starts with a click or a bang. */
export const MIN_ATTACK_S = 0.04;

export interface Note {
  freq: number;
  at: number; // seconds from now
  dur: number; // seconds
  gain: number; // 0..1 of MAX_GAIN
}

export const SOUNDS = {
  place: [
    { freq: 392, at: 0, dur: 0.35, gain: 0.7 },
    { freq: 523.25, at: 0.12, dur: 0.4, gain: 0.5 },
  ],
  arrive: [
    { freq: 392, at: 0, dur: 0.4, gain: 0.55 },
    { freq: 493.88, at: 0.2, dur: 0.4, gain: 0.5 },
    { freq: 587.33, at: 0.4, dur: 0.7, gain: 0.45 },
  ],
  chug: [{ freq: 110, at: 0, dur: 0.22, gain: 0.5 }],
  engineOff: [
    { freq: 220, at: 0, dur: 0.6, gain: 0.5 },
    { freq: 164.81, at: 0.35, dur: 0.9, gain: 0.4 },
  ],
} satisfies Record<string, Note[]>;

export type SoundName = keyof typeof SOUNDS;

export class SoftAudio {
  private ctx: AudioContext | null = null;

  constructor(private enabled: boolean) {}

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  play(name: SoundName): void {
    if (!this.enabled) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const t0 = this.ctx.currentTime + 0.02;
      for (const n of SOUNDS[name]) this.note(this.ctx, n, t0);
    } catch {
      // No audio available: silently continue.
    }
  }

  private note(ctx: AudioContext, n: Note, t0: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.freq;
    const start = t0 + n.at;
    const peak = Math.min(1, n.gain) * MAX_GAIN;
    const attack = Math.max(MIN_ATTACK_S, n.dur * 0.25);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.linearRampToValueAtTime(0, start + n.dur + attack);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + n.dur + attack + 0.05);
  }
}
