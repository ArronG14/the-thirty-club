import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  Clock,
  EntranceEnvironment,
} from '../entrance/domain/environment';
import { CLUB_REWARD_IDS, CLUB_REWARDS } from '../prizes/clubRewards';
import type { RewardDefinition } from '../prizes/rewards';
import { rewardViews, unclaimed } from '../prizes/ledger';
import {
  browserPrizeStorage,
  memoryPrizeStorage,
  type PrizeStorage,
} from '../prizes/ledgerStorage';
import {
  browserCasinoStorage,
  memoryCasinoStorage,
  type CasinoStorage,
} from './domain/casinoRecord';
import {
  claimReward,
  enterCasino,
  isCasinoComplete,
  playRoulette,
  playSlots,
  type CasinoState,
  type PlayContext,
} from './domain/casinoState';
import type { PlacedBet } from './domain/roulette';
import type { SlotClass } from './domain/slots';
import { seedPreview } from './dev/devState';

export interface CasinoStores {
  casino: CasinoStorage;
  prizes: PrizeStorage;
  clock: Clock;
}

/**
 * The real stores in production. In a development preview (`?preview=`) the
 * stores are in memory, so previews never touch the real record, exactly
 * like the other rooms.
 */
export function createCasinoStores(
  environment: EntranceEnvironment,
): CasinoStores {
  if (import.meta.env.DEV && environment.preview) {
    const seeded = seedPreview(environment.preview);
    return {
      casino: memoryCasinoStorage(seeded.casino),
      prizes: memoryPrizeStorage(seeded.ledger),
      clock: environment.clock,
    };
  }
  return {
    casino: browserCasinoStorage(),
    prizes: browserPrizeStorage(CLUB_REWARD_IDS),
    clock: environment.clock,
  };
}

/** One-shot outcome overrides, set only by the development tools. */
export interface Overrides {
  roulette: number | null;
  slots: SlotClass | null;
}

/**
 * The casino's state: the casino record and the prize ledger together.
 * Every play is resolved and SAVED before this returns, so the interface
 * can animate it knowing a refresh at any moment lands in a finished state.
 */
export function useCasino(
  stores: CasinoStores,
  /**
   * What local play can award. Production passes none: prizes there are the
   * server's alone (ADR-024), and roulette's house tokens win only tokens.
   */
  awards: readonly RewardDefinition[] = CLUB_REWARDS,
) {
  const { casino: casinoStore, prizes, clock } = stores;
  const [state, setState] = useState<CasinoState>(() => ({
    casino: casinoStore.load(),
    ledger: prizes.load(),
  }));
  const latest = useRef(state);
  const overrides = useRef<Overrides>({ roulette: null, slots: null });
  /** Arms a one-shot outcome (development tools only). */
  const setOverride = useCallback(
    <K extends keyof Overrides>(game: K, value: Overrides[K]) => {
      overrides.current[game] = value;
    },
    [],
  );

  const commit = useCallback(
    (next: CasinoState) => {
      latest.current = next;
      // Ledger first: prizes are the data that must never be lost.
      prizes.save(next.ledger);
      casinoStore.save(next.casino);
      setState(next);
    },
    [casinoStore, prizes],
  );

  const context = useCallback(
    (): PlayContext => ({
      rng: Math.random,
      nowIso: new Date(clock.now()).toISOString(),
      catalog: awards,
    }),
    [clock, awards],
  );

  const enter = useCallback(() => {
    commit(enterCasino(latest.current));
  }, [commit]);

  const spinRoulette = useCallback(
    (bets: readonly PlacedBet[]) => {
      const override = overrides.current.roulette;
      const play = playRoulette(latest.current, bets, context(), override);
      if (play.ok) {
        overrides.current.roulette = null;
        commit(play.state);
      }
      return play;
    },
    [commit, context],
  );

  const spinSlots = useCallback(() => {
    const override = overrides.current.slots;
    const play = playSlots(latest.current, context(), override);
    if (play.ok) {
      overrides.current.slots = null;
      commit(play.state);
    }
    return play;
  }, [commit, context]);

  const claim = useCallback(
    (rewardId: string) => {
      const result = claimReward(latest.current, rewardId, context());
      if (result.state !== latest.current) commit(result.state);
      return result.awarded;
    },
    [commit, context],
  );

  const setSound = useCallback(
    (soundOn: boolean) => {
      commit({
        ...latest.current,
        casino: { ...latest.current.casino, soundOn },
      });
    },
    [commit],
  );

  const views = useMemo(
    () => rewardViews(state.ledger, CLUB_REWARDS),
    [state.ledger],
  );
  const pending = useMemo(
    () => unclaimed(state.ledger, CLUB_REWARDS),
    [state.ledger],
  );
  const complete = useMemo(
    () => isCasinoComplete(state.ledger, CLUB_REWARDS),
    [state.ledger],
  );

  return {
    state,
    chips: state.casino.chips,
    views,
    pending,
    complete,
    enter,
    spinRoulette,
    spinSlots,
    claim,
    setSound,
    /** Replaces the whole state (development tools and tests only). */
    replace: commit,
    setOverride,
    clock,
  };
}

export type CasinoModel = ReturnType<typeof useCasino>;
