/**
 * Table rules, limits and scripted outcomes. No real money, no purchases:
 * chips are a birthday token with no value outside the club.
 *
 * Scripts are addressed by how many spins have been played, persisted, so a
 * refresh can never replay or skip a step. After a script ends, spins fall
 * back to fair random numbers (roulette) or the filler weights (slots).
 */
import type { ScriptStep } from '../domain/roulette.ts';
import type { SlotScriptConfig } from '../domain/slots.ts';

export const CHIPS = {
  /** Chips held on a first visit. */
  starting: 1000,
  /** When a player drops below the table minimum the house tops up to this. */
  topUpTo: 500,
  denominations: [10, 50, 100, 500] as const,
} as const;

export const ROULETTE_RULES = {
  minTotal: 10,
  maxTotal: 1000,
  /** Spins allowed in total on this device; null for unlimited. */
  maxSpins: 80 as number | null,
  /**
   * win → a number that makes this slip win · lose → one that loses it ·
   * free → fair random. Five spins: win, lose, win, lose, win, so by the
   * fifth spin Alise has won three times without it feeling fixed.
   */
  script: ['win', 'lose', 'win', 'lose', 'win'] as readonly ScriptStep[],
} as const;

export const SLOT_RULES = {
  stake: 10,
  maxSpins: 80 as number | null,
  config: {
    // pair, miss, miss, triple, miss, miss, then the Thirty Club jackpot.
    script: ['pair', 'miss', 'miss', 'triple', 'miss', 'miss', 'jackpot'],
    filler: { miss: 62, pair: 28, triple: 10, jackpot: 0 },
  } satisfies SlotScriptConfig,
} as const;

/** Pause after the final reel or ball settles before the result is shown. */
export const RESULT_BEAT_MS = 450;
