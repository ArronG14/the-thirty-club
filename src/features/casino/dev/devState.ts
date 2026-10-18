/**
 * DEVELOPMENT ONLY. Seeds and manipulations of the casino state for the
 * development preview and the dev tools panel. Reached only through
 * `import.meta.env.DEV` branches, so Vite removes it from production.
 */
import { CLUB_REWARDS } from '../../prizes/clubRewards';
import {
  awardDirect,
  bump,
  claim,
  emptyLedger,
  type PrizeLedger,
} from '../../prizes/ledger';
import { CASINO_REWARD_IDS, COUNTERS } from '../config/casinoRewards';
import { freshCasino, type CasinoRecord } from '../domain/casinoRecord';
import type { CasinoState } from '../domain/casinoState';

const STAMP = '2026-10-24T20:00:00.000Z';

/** Every casino reward claimed, every counter high enough to match. */
export function completedState(): CasinoState {
  let ledger: PrizeLedger = emptyLedger;
  ledger = bump(ledger, COUNTERS.rouletteSpins, 12);
  ledger = bump(ledger, COUNTERS.rouletteWins, 6);
  ledger = bump(ledger, COUNTERS.rouletteStraightWins, 1);
  ledger = bump(ledger, COUNTERS.slotsSpins, 9);
  ledger = bump(ledger, COUNTERS.slotsWins, 4);
  ledger = bump(ledger, COUNTERS.slotsJackpots, 1);
  for (const reward of CLUB_REWARDS) {
    ledger = claim(awardDirect(ledger, reward.id, STAMP), reward.id, STAMP);
  }
  return {
    ledger,
    casino: {
      ...freshCasino,
      chips: 2310,
      visits: 3,
      spins: { roulette: 12, slots: 9 },
    },
  };
}

export function freshState(): CasinoState {
  return { casino: freshCasino, ledger: emptyLedger };
}

/** One spin from the slot jackpot (the seventh). */
export function jackpotNextState(): CasinoState {
  let ledger = bump(emptyLedger, COUNTERS.slotsSpins, 6);
  ledger = bump(ledger, COUNTERS.slotsWins, 2);
  ledger = awardDirect(ledger, CASINO_REWARD_IDS.gildedReel, STAMP);
  return {
    ledger,
    casino: { ...freshCasino, spins: { roulette: 0, slots: 6 }, visits: 1 },
  };
}

/** The casino state a development preview mode starts from. */
export function seedPreview(mode: string | null): {
  casino: CasinoRecord;
  ledger: PrizeLedger;
} {
  const state =
    mode === 'casino-completed'
      ? completedState()
      : mode === 'casino-jackpot'
        ? jackpotNextState()
        : freshState();
  return { casino: state.casino, ledger: state.ledger };
}

export function withChips(state: CasinoState, chips: number): CasinoState {
  return { ...state, casino: { ...state.casino, chips } };
}

export function withAward(state: CasinoState, rewardId: string): CasinoState {
  return { ...state, ledger: awardDirect(state.ledger, rewardId, STAMP) };
}
