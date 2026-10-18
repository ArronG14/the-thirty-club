/**
 * The vault's mechanism, synthesised with Web Audio (no files): dial
 * detents, bolts, the release and the hinge. Quiet by design, never
 * essential, and silent until Alise touches "Turn the key" (iOS will not
 * start audio without a gesture).
 */
type Kind = 'tick' | 'bolts' | 'release' | 'swing' | 'glow';

export interface VaultSounds {
  unlock(): void;
  play(kind: Kind): void;
  setEnabled(on: boolean): void;
  dispose(): void;
}

export function createVaultSounds(): VaultSounds {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let noise: AudioBuffer | null = null;

  const ensure = () => {
    if (ctx) return ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const ping = (freq: number, at: number, decay: number, level: number) => {
    const c = ctx!;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(master!);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  };

  const burst = (
    at: number,
    duration: number,
    level: number,
    filter: BiquadFilterType,
    freq: number,
    q = 1,
  ) => {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = c.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(f).connect(gain).connect(master!);
    src.start(at, Math.random() * 0.5, duration + 0.05);
  };

  return {
    unlock() {
      const c = ensure();
      if (c && c.state !== 'running') void c.resume().catch(() => undefined);
    },
    setEnabled(on) {
      enabled = on;
    },
    play(kind) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime + 0.005;
      switch (kind) {
        case 'tick':
          burst(now, 0.025, 0.18, 'bandpass', 4200, 6);
          ping(2900 + Math.random() * 200, now, 0.04, 0.035);
          break;
        case 'bolts':
          for (const d of [0, 0.09, 0.17]) {
            burst(now + d, 0.09, 0.3, 'lowpass', 900);
            ping(110, now + d, 0.14, 0.12);
          }
          break;
        case 'release':
          burst(now, 0.16, 0.45, 'lowpass', 600);
          ping(72, now, 0.35, 0.25);
          for (const [f, l] of [
            [523, 0.035],
            [1312, 0.02],
            [2149, 0.012],
          ] as const)
            ping(f, now + 0.02, 1.4, l);
          break;
        case 'swing':
          burst(now, 1.3, 0.05, 'bandpass', 380, 4);
          break;
        case 'glow':
          ping(220, now, 2.2, 0.02);
          ping(330, now + 0.05, 2.4, 0.015);
          break;
      }
    },
    dispose() {
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
