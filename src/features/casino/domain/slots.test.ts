import { describe, expect, it } from 'vitest';
import {
  chooseSlotOutcome,
  evaluateStops,
  REEL_LENGTH,
  STRIPS,
  stopsFor,
  stopsForClass,
  symbolAt,
  type SlotClass,
  type SlotScriptConfig,
  type SlotSymbol,
} from './slots';
import { SLOT_RULES } from '../config/casinoRules';

const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const ALL: SlotSymbol[] = [
  'diamond',
  'crown',
  'key',
  'champagne',
  'rose',
  'emblem',
  'thirty',
];

describe('reel strips', () => {
  it('are the same length and carry every symbol, the Thirty exactly once', () => {
    expect(STRIPS).toHaveLength(3);
    for (const strip of STRIPS) {
      expect(strip).toHaveLength(REEL_LENGTH);
      for (const symbol of ALL) expect(strip).toContain(symbol);
      expect(strip.filter((s) => s === 'thirty')).toHaveLength(1);
    }
  });

  it('wraps indices in both directions', () => {
    expect(symbolAt(0, REEL_LENGTH)).toBe(symbolAt(0, 0));
    expect(symbolAt(0, -1)).toBe(symbolAt(0, REEL_LENGTH - 1));
  });
});

describe('combination evaluation', () => {
  const stopsOf = (symbols: SlotSymbol[]) =>
    symbols.map((s, reel) => stopsFor(s, reel)[0]!);

  it('pays a triple by symbol, with the Thirty as the jackpot', () => {
    const jackpot = evaluateStops(stopsOf(['thirty', 'thirty', 'thirty']));
    expect(jackpot).toMatchObject({ class: 'jackpot', multiplier: 100 });
    const crowns = evaluateStops(stopsOf(['crown', 'crown', 'crown']));
    expect(crowns).toMatchObject({
      class: 'triple',
      symbol: 'crown',
      multiplier: 15,
    });
  });

  it('pays a pair only from the left', () => {
    expect(evaluateStops(stopsOf(['rose', 'rose', 'key']))).toMatchObject({
      class: 'pair',
      multiplier: 2,
    });
    expect(evaluateStops(stopsOf(['rose', 'key', 'rose'])).class).toBe('miss');
    expect(evaluateStops(stopsOf(['key', 'rose', 'rose'])).class).toBe('miss');
  });
});

describe('outcome engine', () => {
  it('turns every class into stops that evaluate to that class', () => {
    const classes: SlotClass[] = ['jackpot', 'triple', 'pair', 'miss'];
    const rng = lcg(7);
    for (const wanted of classes) {
      for (let i = 0; i < 300; i += 1) {
        const stops = stopsForClass(wanted, rng);
        expect(evaluateStops(stops).class).toBe(wanted);
      }
    }
  });

  const config: SlotScriptConfig = {
    script: ['pair', 'miss', 'triple', 'jackpot'],
    filler: { miss: 1, pair: 0, triple: 0, jackpot: 1 },
  };

  it('plays the script in order, addressed by spins already played', () => {
    const rng = lcg(3);
    const classes = [0, 1, 2, 3].map(
      (n) =>
        chooseSlotOutcome({ spinsPlayed: n, config, rng, jackpotPaid: false })
          .evaluation.class,
    );
    expect(classes).toEqual(['pair', 'miss', 'triple', 'jackpot']);
  });

  it('never offers the jackpot by chance once it has paid', () => {
    const rng = lcg(11);
    for (let i = 0; i < 200; i += 1) {
      const out = chooseSlotOutcome({
        spinsPlayed: 99,
        config,
        rng,
        jackpotPaid: true,
      });
      expect(out.evaluation.class).not.toBe('jackpot');
      expect(out.source).toBe('random');
    }
  });

  it('can still offer it by chance before it has paid, when configured', () => {
    const rng = lcg(5);
    const classes = new Set<SlotClass>();
    for (let i = 0; i < 100; i += 1)
      classes.add(
        chooseSlotOutcome({ spinsPlayed: 99, config, rng, jackpotPaid: false })
          .evaluation.class,
      );
    expect(classes.has('jackpot')).toBe(true);
  });

  it('honours a developer override ahead of the script', () => {
    const out = chooseSlotOutcome({
      spinsPlayed: 0,
      config,
      rng: lcg(1),
      override: 'jackpot',
      jackpotPaid: true,
    });
    expect(out.source).toBe('override');
    expect(out.evaluation.class).toBe('jackpot');
  });

  it('ships a script whose seventh spin is the jackpot and never repeats it', () => {
    expect(SLOT_RULES.config.script[6]).toBe('jackpot');
    expect(SLOT_RULES.config.filler.jackpot).toBe(0);
  });
});
