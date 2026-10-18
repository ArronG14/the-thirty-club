/**
 * Casino sound, synthesised with the Web Audio API: no files, no
 * dependencies. Nothing is created before `unlock()`, which the UI calls
 * from a user gesture (autoplay rules), and every method is a no-op when
 * sound is off or the browser has no AudioContext. The casino is fully
 * usable in silence.
 */

type Ctx = AudioContext;

export interface CasinoAudio {
  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void;
  setEnabled(on: boolean): void;
  chip(): void;
  /** The wheel and ball: a whirr, then ticks that slow to the settle. */
  roulette(ballSeconds: number): void;
  slotsStart(): void;
  reelStop(index: number): void;
  win(big: boolean): void;
  reveal(): void;
  dispose(): void;
}

export function createCasinoAudio(initiallyOn: boolean): CasinoAudio {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;
  let ambient: { stop(): void } | null = null;
  let enabled = initiallyOn;
  let noise: AudioBuffer | null = null;

  const Ctor: typeof AudioContext | undefined =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);

  function ready(): Ctx | null {
    return enabled && ctx && ctx.state !== 'closed' && master ? ctx : null;
  }

  function noiseBuffer(c: Ctx) {
    if (noise) return noise;
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  function tone(
    freq: number,
    start: number,
    length: number,
    gain: number,
    type: OscillatorType = 'sine',
    slideTo?: number,
  ) {
    const c = ready();
    if (!c || !master) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + start);
    if (slideTo)
      osc.frequency.exponentialRampToValueAtTime(
        slideTo,
        c.currentTime + start + length,
      );
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + length);
    osc.connect(g).connect(master);
    osc.start(c.currentTime + start);
    osc.stop(c.currentTime + start + length + 0.05);
  }

  function burst(
    start: number,
    length: number,
    gain: number,
    filter: number,
    q = 1,
    type: BiquadFilterType = 'bandpass',
  ) {
    const c = ready();
    if (!c || !master) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = filter;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + length);
    src.connect(f).connect(g).connect(master);
    src.start(c.currentTime + start, Math.random());
    src.stop(c.currentTime + start + length + 0.05);
  }

  function startAmbient(c: Ctx) {
    if (ambient || !master) return;
    // A very quiet, slowly breathing chord: the room tone of a salon.
    const bus = c.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(0.028, c.currentTime + 4);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    bus.connect(lp).connect(master);
    const oscs = [110, 164.8, 220.3, 277.2].map((f, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const depth = c.createGain();
      depth.gain.value = 1.2;
      lfo.connect(depth).connect(o.frequency);
      o.connect(bus);
      o.start();
      lfo.start();
      return [o, lfo] as const;
    });
    ambient = {
      stop() {
        bus.gain.cancelScheduledValues(c.currentTime);
        bus.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
        for (const [o, lfo] of oscs) {
          o.stop(c.currentTime + 0.7);
          lfo.stop(c.currentTime + 0.7);
        }
      },
    };
  }

  return {
    unlock() {
      if (!Ctor || !enabled) return;
      try {
        if (!ctx) {
          ctx = new Ctor();
          master = ctx.createGain();
          master.gain.value = 0.7;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume();
        startAmbient(ctx);
      } catch {
        ctx = null;
      }
    },
    setEnabled(on) {
      enabled = on;
      if (!on) {
        ambient?.stop();
        ambient = null;
      } else if (ctx) {
        if (ctx.state === 'suspended') void ctx.resume();
        startAmbient(ctx);
      }
    },
    chip() {
      burst(0, 0.05, 0.22, 3400, 4);
      tone(1900, 0.005, 0.09, 0.05, 'triangle', 1500);
    },
    roulette(ballSeconds) {
      const c = ready();
      if (!c) return;
      // Wheel whirr.
      burst(0, ballSeconds * 0.9, 0.05, 700, 0.6);
      // Ball ticks on the track, each wider apart than the last.
      let at = 0.15;
      let gap = 0.045;
      while (at < ballSeconds - 0.5) {
        burst(at, 0.04, 0.09, 4200 + Math.random() * 900, 6);
        at += gap;
        gap *= 1.045;
      }
      // Dropping into the pockets.
      for (let i = 0; i < 6; i += 1) {
        const when = ballSeconds - 0.62 + i * (0.1 + i * 0.035);
        burst(when, 0.05, 0.16 / (1 + i * 0.4), 2600 - i * 220, 5);
        tone(1500 - i * 140, when, 0.07, 0.03 / (1 + i * 0.3), 'triangle');
      }
    },
    slotsStart() {
      burst(0, 0.25, 0.2, 900, 1.5);
      tone(180, 0, 0.3, 0.08, 'sawtooth', 90);
      for (let i = 0; i < 18; i += 1)
        burst(0.2 + i * 0.07, 0.03, 0.05, 2800, 5);
    },
    reelStop(index) {
      burst(0, 0.07, 0.3, 700 + index * 120, 2);
      tone(220 + index * 40, 0, 0.12, 0.09, 'square', 120);
    },
    win(big) {
      const notes = big ? [523, 659, 784, 1047, 1319, 1568] : [659, 784, 988];
      notes.forEach((f, i) => {
        tone(f, i * 0.11, 0.7, 0.08, 'sine');
        tone(f * 2, i * 0.11, 0.45, 0.025, 'triangle');
      });
      if (big)
        for (let i = 0; i < 14; i += 1)
          burst(0.1 + i * 0.09, 0.05, 0.08, 4600, 6);
    },
    reveal() {
      tone(392, 0, 1.4, 0.07, 'sine');
      tone(587, 0.18, 1.3, 0.06, 'sine');
      tone(784, 0.36, 1.6, 0.05, 'sine');
      tone(1175, 0.6, 1.2, 0.025, 'triangle');
    },
    dispose() {
      ambient?.stop();
      ambient = null;
      const c = ctx;
      ctx = null;
      master = null;
      if (c && c.state !== 'closed') void c.close().catch(() => undefined);
    },
  };
}
