/**
 * European roulette: the wheel, the bets and the settlement. Pure and
 * deterministic; randomness is always injected.
 */

/** Pockets in clockwise order as seen from above, starting at zero. */
export const WHEEL_ORDER: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

export const POCKETS = WHEEL_ORDER.length;

const RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColour = 'red' | 'black' | 'green';

export function colourOf(n: number): PocketColour {
  if (n === 0) return 'green';
  return RED.has(n) ? 'red' : 'black';
}

/** Position of a number on the wheel (0…36), or -1. */
export function pocketIndex(n: number): number {
  return WHEEL_ORDER.indexOf(n);
}

export type RouletteBet =
  | { kind: 'straight'; number: number }
  | { kind: 'red' }
  | { kind: 'black' }
  | { kind: 'odd' }
  | { kind: 'even' }
  | { kind: 'low' }
  | { kind: 'high' }
  | { kind: 'dozen'; index: 1 | 2 | 3 };

export interface PlacedBet {
  bet: RouletteBet;
  stake: number;
}

export function betKey(bet: RouletteBet): string {
  if (bet.kind === 'straight') return `straight:${bet.number}`;
  if (bet.kind === 'dozen') return `dozen:${bet.index}`;
  return bet.kind;
}

export function betLabel(bet: RouletteBet): string {
  switch (bet.kind) {
    case 'straight':
      return `Number ${bet.number}`;
    case 'dozen':
      return ['First dozen', 'Second dozen', 'Third dozen'][bet.index - 1]!;
    case 'low':
      return '1 to 18';
    case 'high':
      return '19 to 36';
    default:
      return bet.kind[0]!.toUpperCase() + bet.kind.slice(1);
  }
}

export function isValidBet(bet: RouletteBet): boolean {
  if (bet.kind === 'straight')
    return Number.isInteger(bet.number) && bet.number >= 0 && bet.number <= 36;
  if (bet.kind === 'dozen') return bet.index >= 1 && bet.index <= 3;
  return ['red', 'black', 'odd', 'even', 'low', 'high'].includes(bet.kind);
}

/** Does `bet` win when `n` comes up? Zero loses every outside bet. */
export function betWins(bet: RouletteBet, n: number): boolean {
  switch (bet.kind) {
    case 'straight':
      return bet.number === n;
    case 'red':
      return colourOf(n) === 'red';
    case 'black':
      return colourOf(n) === 'black';
    case 'odd':
      return n > 0 && n % 2 === 1;
    case 'even':
      return n > 0 && n % 2 === 0;
    case 'low':
      return n >= 1 && n <= 18;
    case 'high':
      return n >= 19 && n <= 36;
    case 'dozen':
      return n >= 1 && Math.ceil(n / 12) === bet.index;
  }
}

/** Winnings per unit staked (the stake itself is returned on top). */
export function payoutOdds(bet: RouletteBet): number {
  if (bet.kind === 'straight') return 35;
  if (bet.kind === 'dozen') return 2;
  return 1;
}

export interface BetSettlement {
  placed: PlacedBet;
  won: boolean;
  /** Chips returned for this bet: stake × (odds + 1) if it won, else 0. */
  returned: number;
}

export interface Settlement {
  number: number;
  colour: PocketColour;
  staked: number;
  returned: number;
  /** Returned minus staked. */
  net: number;
  bets: BetSettlement[];
  won: boolean;
}

export function settle(bets: readonly PlacedBet[], n: number): Settlement {
  const settled = bets.map((placed): BetSettlement => {
    const won = betWins(placed.bet, n);
    return {
      placed,
      won,
      returned: won ? placed.stake * (payoutOdds(placed.bet) + 1) : 0,
    };
  });
  const staked = bets.reduce((sum, b) => sum + b.stake, 0);
  const returned = settled.reduce((sum, b) => sum + b.returned, 0);
  return {
    number: n,
    colour: colourOf(n),
    staked,
    returned,
    net: returned - staked,
    bets: settled,
    won: returned > staked,
  };
}

/** Adds chips to a bet, merging with an existing bet of the same kind. */
export function addStake(
  bets: readonly PlacedBet[],
  bet: RouletteBet,
  chips: number,
): PlacedBet[] {
  const key = betKey(bet);
  const found = bets.some((b) => betKey(b.bet) === key);
  if (!found) return [...bets, { bet, stake: chips }];
  return bets.map((b) =>
    betKey(b.bet) === key ? { ...b, stake: b.stake + chips } : b,
  );
}

export function totalStake(bets: readonly PlacedBet[]): number {
  return bets.reduce((sum, b) => sum + b.stake, 0);
}

/** Validates a bet slip against the table rules and the player's chips. */
export function validateSlip(
  bets: readonly PlacedBet[],
  rules: { minTotal: number; maxTotal: number },
  balance: number,
): string | null {
  if (bets.length === 0) return 'Place a chip before spinning.';
  for (const placed of bets) {
    if (!isValidBet(placed.bet)) return 'That bet is not on the table.';
    if (!Number.isInteger(placed.stake) || placed.stake <= 0)
      return 'A bet must be a whole number of chips.';
  }
  const total = totalStake(bets);
  if (total < rules.minTotal)
    return `The table minimum is ${rules.minTotal} chips.`;
  if (total > rules.maxTotal)
    return `The table limit is ${rules.maxTotal} chips.`;
  if (total > balance) return 'You do not hold enough chips for that.';
  return null;
}

export type ScriptStep = 'win' | 'lose' | 'free';

export interface RouletteOutcome {
  number: number;
  source: 'override' | 'script-win' | 'script-lose' | 'random';
}

/**
 * Decides where the ball lands, BEFORE any animation. Scripted steps are
 * addressed by how many spins have already been played, so a refresh can
 * never replay or skip a step. When a step cannot be honoured (no number
 * would make this slip win, or lose) the spin is simply random.
 */
export function chooseNumber(args: {
  bets: readonly PlacedBet[];
  spinsPlayed: number;
  script: readonly ScriptStep[];
  rng: () => number;
  override?: number | null;
}): RouletteOutcome {
  const { bets, spinsPlayed, script, rng, override } = args;
  if (override != null && override >= 0 && override <= 36)
    return { number: Math.floor(override), source: 'override' };
  const random = (): RouletteOutcome => ({
    number: Math.min(POCKETS - 1, Math.floor(rng() * POCKETS)),
    source: 'random',
  });
  const step = script[spinsPlayed] ?? 'free';
  if (step === 'free') return random();
  const numbers = WHEEL_ORDER.slice().sort((a, b) => a - b);
  const candidates = numbers.filter((n) => {
    const s = settle(bets, n);
    return step === 'win' ? s.won : s.returned === 0;
  });
  if (candidates.length === 0) return random();
  const pick =
    candidates[
      Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
    ]!;
  return {
    number: pick,
    source: step === 'win' ? 'script-win' : 'script-lose',
  };
}
