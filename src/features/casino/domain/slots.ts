/**
 * The Thirty Club slot machine: symbols, reel strips, evaluation and the
 * outcome engine. Pure and deterministic; randomness is injected. The
 * outcome is chosen first as a CLASS (jackpot / triple / pair / miss), then
 * turned into reel stops, then re-evaluated from those stops, so what the
 * reels show is by construction what the engine decided.
 */

export type SlotSymbol =
  'diamond' | 'crown' | 'key' | 'champagne' | 'rose' | 'emblem' | 'thirty';

export const SYMBOL_NAMES: Record<SlotSymbol, string> = {
  diamond: 'Diamond',
  crown: 'Crown',
  key: 'Golden key',
  champagne: 'Champagne',
  rose: 'Rose',
  emblem: 'Thirty Club emblem',
  thirty: 'Thirty',
};

export const REEL_LENGTH = 12;
export const REELS = 3;

/**
 * One strip per reel, read in the direction the reel turns. Every symbol is
 * on every reel; the Thirty appears exactly once on each, so the jackpot is
 * a rare, specific alignment.
 */
export const STRIPS: readonly (readonly SlotSymbol[])[] = [
  [
    'diamond',
    'rose',
    'crown',
    'champagne',
    'key',
    'emblem',
    'rose',
    'thirty',
    'diamond',
    'champagne',
    'crown',
    'key',
  ],
  [
    'rose',
    'key',
    'champagne',
    'diamond',
    'thirty',
    'crown',
    'emblem',
    'rose',
    'key',
    'diamond',
    'champagne',
    'crown',
  ],
  [
    'champagne',
    'crown',
    'rose',
    'key',
    'diamond',
    'emblem',
    'thirty',
    'champagne',
    'rose',
    'crown',
    'key',
    'diamond',
  ],
];

export type SlotClass = 'jackpot' | 'triple' | 'pair' | 'miss';

/** Winnings multiplier on the stake (stake returned on top is not counted). */
export const PAYOUT: Record<SlotSymbol, number> = {
  champagne: 8,
  rose: 6,
  diamond: 10,
  crown: 15,
  key: 20,
  emblem: 40,
  thirty: 100,
};
export const PAIR_PAYOUT = 2;

export interface SlotEvaluation {
  /** The symbol on the payline of each reel. */
  line: readonly SlotSymbol[];
  class: SlotClass;
  symbol: SlotSymbol | null;
  /** Multiplier of the stake paid (0 for a miss). */
  multiplier: number;
}

export function symbolAt(reel: number, index: number): SlotSymbol {
  const strip = STRIPS[reel]!;
  return strip[((index % REEL_LENGTH) + REEL_LENGTH) % REEL_LENGTH]!;
}

/** Evaluates stops (the strip index showing on the payline of each reel). */
export function evaluateStops(stops: readonly number[]): SlotEvaluation {
  const line = stops.map((stop, reel) => symbolAt(reel, stop));
  const [a, b, c] = line;
  if (a && a === b && b === c) {
    return a === 'thirty'
      ? { line, class: 'jackpot', symbol: a, multiplier: PAYOUT.thirty }
      : { line, class: 'triple', symbol: a, multiplier: PAYOUT[a] };
  }
  if (a && a === b)
    return { line, class: 'pair', symbol: a, multiplier: PAIR_PAYOUT };
  return { line, class: 'miss', symbol: null, multiplier: 0 };
}

export function stopsFor(symbol: SlotSymbol, reel: number): number[] {
  const strip = STRIPS[reel]!;
  return strip.flatMap((s, i) => (s === symbol ? [i] : []));
}

const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;

const ORDINARY: readonly SlotSymbol[] = [
  'diamond',
  'crown',
  'key',
  'champagne',
  'rose',
  'emblem',
];

/** Reel stops that evaluate to exactly `wanted`. */
export function stopsForClass(wanted: SlotClass, rng: () => number): number[] {
  if (wanted === 'jackpot')
    return [0, 1, 2].map((r) => pick(stopsFor('thirty', r), rng));
  if (wanted === 'triple') {
    const symbol = pick(ORDINARY, rng);
    return [0, 1, 2].map((r) => pick(stopsFor(symbol, r), rng));
  }
  if (wanted === 'pair') {
    const symbol = pick(ORDINARY, rng);
    const third = pick(
      (
        [
          'diamond',
          'crown',
          'key',
          'champagne',
          'rose',
          'emblem',
          'thirty',
        ] as const
      ).filter((s) => s !== symbol),
      rng,
    );
    return [
      pick(stopsFor(symbol, 0), rng),
      pick(stopsFor(symbol, 1), rng),
      pick(stopsFor(third, 2), rng),
    ];
  }
  // A miss: any stops that make neither a pair nor a triple. Usually a
  // near miss on the third reel, because that is what a real machine does.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const stops = [0, 1, 2].map(() => Math.floor(rng() * REEL_LENGTH));
    if (evaluateStops(stops).class === 'miss') return stops;
  }
  return [0, 1, 2]; // diamond / rose / champagne: a miss on these strips
}

export interface SlotScriptConfig {
  /** Class for each spin, addressed by spins already played. */
  script: readonly SlotClass[];
  /** Weights for spins past the script. Jackpot is excluded unless allowed. */
  filler: { miss: number; pair: number; triple: number; jackpot: number };
}

export interface SlotOutcome {
  stops: number[];
  evaluation: SlotEvaluation;
  source: 'override' | 'script' | 'random';
}

export function chooseSlotOutcome(args: {
  spinsPlayed: number;
  config: SlotScriptConfig;
  rng: () => number;
  override?: SlotClass | null;
  /** Once the jackpot has paid, it is not offered again by chance. */
  jackpotPaid: boolean;
}): SlotOutcome {
  const { spinsPlayed, config, rng, override, jackpotPaid } = args;
  let wanted: SlotClass;
  let source: SlotOutcome['source'];
  if (override) {
    wanted = override;
    source = 'override';
  } else if (spinsPlayed < config.script.length) {
    wanted = config.script[spinsPlayed]!;
    source = 'script';
  } else {
    const f = config.filler;
    const weights: [SlotClass, number][] = [
      ['miss', f.miss],
      ['pair', f.pair],
      ['triple', f.triple],
      ['jackpot', jackpotPaid ? 0 : f.jackpot],
    ];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng() * total;
    wanted = 'miss';
    for (const [cls, weight] of weights) {
      if (roll < weight) {
        wanted = cls;
        break;
      }
      roll -= weight;
    }
    source = 'random';
  }
  const stops = stopsForClass(wanted, rng);
  return { stops, evaluation: evaluateStops(stops), source };
}
