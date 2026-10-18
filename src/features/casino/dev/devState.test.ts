import { describe, expect, it } from 'vitest';
import { CLUB_REWARDS } from '../../prizes/clubRewards';
import { isClaimed } from '../../prizes/ledger';
import { CASINO_REWARD_IDS } from '../config/casinoRewards';
import { isCasinoComplete, playSlots } from '../domain/casinoState';
import {
  completedState,
  jackpotNextState,
  seedPreview,
  withAward,
  withChips,
} from './devState';

const ctx = {
  rng: () => 0.42,
  nowIso: '2026-10-24T21:00:00.000Z',
  catalog: CLUB_REWARDS,
};

describe('development seeds', () => {
  it('builds a completed state with every reward claimed', () => {
    const state = completedState();
    for (const reward of CLUB_REWARDS)
      expect(isClaimed(state.ledger, reward.id)).toBe(true);
    expect(isCasinoComplete(state.ledger, CLUB_REWARDS)).toBe(true);
  });

  it('puts the jackpot exactly one spin away, with the first slot prize already won', () => {
    const state = jackpotNextState();
    expect(state.ledger.grants[CASINO_REWARD_IDS.gildedReel]).toBeDefined();
    expect(state.ledger.grants[CASINO_REWARD_IDS.vaultKeyOne]).toBeUndefined();
    const play = playSlots(state, ctx);
    if (!play.ok) throw new Error(play.message);
    expect(play.outcome.evaluation.class).toBe('jackpot');
    expect(play.awarded.map((r) => r.id)).toEqual([
      CASINO_REWARD_IDS.vaultKeyOne,
    ]);
  });

  it('seeds each preview mode, defaulting to fresh progress', () => {
    expect(seedPreview('casino-completed').ledger).toEqual(
      completedState().ledger,
    );
    expect(seedPreview('casino-jackpot').casino.spins.slots).toBe(6);
    expect(seedPreview('casino-lobby').casino.chips).toBe(1000);
    expect(seedPreview(null).ledger.grants).toEqual({});
  });

  it('awards and tops up on request without disturbing anything else', () => {
    const base = jackpotNextState();
    const awarded = withAward(base, CASINO_REWARD_IDS.croupiersClue);
    expect(awarded.ledger.grants[CASINO_REWARD_IDS.croupiersClue]!.status).toBe(
      'unclaimed',
    );
    expect(awarded.ledger.grants[CASINO_REWARD_IDS.gildedReel]).toEqual(
      base.ledger.grants[CASINO_REWARD_IDS.gildedReel],
    );
    expect(withChips(base, 77).casino.chips).toBe(77);
  });
});
