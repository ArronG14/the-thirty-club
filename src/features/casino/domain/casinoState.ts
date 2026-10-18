/**
 * Playing the casino: pure state transitions over the casino record and the
 * prize ledger. Winning a game and RECEIVING a unique prize are separate
 * steps: a game result bumps counters, and only the ledger decides whether
 * those counters earn a reward that has not been awarded before.
 *
 * Every play resolves completely (chips, counters, rewards) BEFORE the UI
 * animates it, so a refresh mid-spin lands in a consistent, finished state.
 */
import { CHIPS, ROULETTE_RULES, SLOT_RULES } from '../config/casinoRules';
import { COUNTERS } from '../config/casinoRewards';
import {
  awardEligible,
  bump,
  claim as claimInLedger,
  type PrizeLedger,
} from '../../prizes/ledger';
import type { RewardDefinition } from '../../prizes/rewards';
import type { CasinoRecord } from './casinoRecord';
import {
  chooseNumber,
  settle,
  validateSlip,
  type PlacedBet,
  type RouletteOutcome,
  type Settlement,
} from './roulette';
import { chooseSlotOutcome, type SlotClass, type SlotOutcome } from './slots';

export interface CasinoState {
  casino: CasinoRecord;
  ledger: PrizeLedger;
}

export interface PlayContext {
  rng: () => number;
  nowIso: string;
  catalog: readonly RewardDefinition[];
}

export type Refusal =
  | { ok: false; reason: 'closed'; message: string }
  | { ok: false; reason: 'invalid'; message: string };

export interface RoulettePlay {
  ok: true;
  state: CasinoState;
  outcome: RouletteOutcome;
  settlement: Settlement;
  awarded: readonly RewardDefinition[];
  toppedUp: boolean;
  /** Spins played including this one. */
  spinNumber: number;
}

export interface SlotsPlay {
  ok: true;
  state: CasinoState;
  outcome: SlotOutcome;
  staked: number;
  returned: number;
  awarded: readonly RewardDefinition[];
  toppedUp: boolean;
  spinNumber: number;
}

const CLOSED: Refusal = {
  ok: false,
  reason: 'closed',
  message: 'The tables are closed for the evening.',
};

function withTopUp(chips: number): { chips: number; toppedUp: boolean } {
  const floor = Math.min(ROULETTE_RULES.minTotal, SLOT_RULES.stake);
  return chips < floor
    ? { chips: Math.max(chips, CHIPS.topUpTo), toppedUp: true }
    : { chips, toppedUp: false };
}

export function enterCasino(state: CasinoState): CasinoState {
  return {
    ...state,
    casino: { ...state.casino, visits: state.casino.visits + 1 },
  };
}

export function playRoulette(
  state: CasinoState,
  bets: readonly PlacedBet[],
  ctx: PlayContext,
  override?: number | null,
): RoulettePlay | Refusal {
  const { casino, ledger } = state;
  if (
    ROULETTE_RULES.maxSpins !== null &&
    casino.spins.roulette >= ROULETTE_RULES.maxSpins
  )
    return CLOSED;
  const problem = validateSlip(bets, ROULETTE_RULES, casino.chips);
  if (problem) return { ok: false, reason: 'invalid', message: problem };

  const outcome = chooseNumber({
    bets,
    spinsPlayed: casino.spins.roulette,
    script: ROULETTE_RULES.script,
    rng: ctx.rng,
    override: override ?? null,
  });
  const settlement = settle(bets, outcome.number);

  let next = bump(ledger, COUNTERS.rouletteSpins);
  if (settlement.won) next = bump(next, COUNTERS.rouletteWins);
  if (settlement.bets.some((b) => b.won && b.placed.bet.kind === 'straight'))
    next = bump(next, COUNTERS.rouletteStraightWins);
  const { ledger: awardedLedger, awarded } = awardEligible(
    next,
    ctx.catalog,
    ctx.nowIso,
  );

  const topUp = withTopUp(casino.chips + settlement.net);
  return {
    ok: true,
    state: {
      ledger: awardedLedger,
      casino: {
        ...casino,
        chips: topUp.chips,
        spins: { ...casino.spins, roulette: casino.spins.roulette + 1 },
      },
    },
    outcome,
    settlement,
    awarded,
    toppedUp: topUp.toppedUp,
    spinNumber: casino.spins.roulette + 1,
  };
}

export function playSlots(
  state: CasinoState,
  ctx: PlayContext,
  override?: SlotClass | null,
): SlotsPlay | Refusal {
  const { casino, ledger } = state;
  if (SLOT_RULES.maxSpins !== null && casino.spins.slots >= SLOT_RULES.maxSpins)
    return CLOSED;
  const stake = SLOT_RULES.stake;
  if (casino.chips < stake)
    return {
      ok: false,
      reason: 'invalid',
      message: 'You do not hold enough chips for that.',
    };

  const outcome = chooseSlotOutcome({
    spinsPlayed: casino.spins.slots,
    config: SLOT_RULES.config,
    rng: ctx.rng,
    override: override ?? null,
    jackpotPaid: (ledger.counters[COUNTERS.slotsJackpots] ?? 0) > 0,
  });
  const { evaluation } = outcome;
  const returned =
    evaluation.multiplier > 0 ? stake * (evaluation.multiplier + 1) : 0;

  let next = bump(ledger, COUNTERS.slotsSpins);
  if (evaluation.class !== 'miss') next = bump(next, COUNTERS.slotsWins);
  if (evaluation.class === 'jackpot') next = bump(next, COUNTERS.slotsJackpots);
  const { ledger: awardedLedger, awarded } = awardEligible(
    next,
    ctx.catalog,
    ctx.nowIso,
  );

  const topUp = withTopUp(casino.chips - stake + returned);
  return {
    ok: true,
    state: {
      ledger: awardedLedger,
      casino: {
        ...casino,
        chips: topUp.chips,
        spins: { ...casino.spins, slots: casino.spins.slots + 1 },
      },
    },
    outcome,
    staked: stake,
    returned,
    awarded,
    toppedUp: topUp.toppedUp,
    spinNumber: casino.spins.slots + 1,
  };
}

/**
 * Claims a reward, then awards anything that claim unlocks (the House
 * Favour follows two claims). Returns the newly awarded rewards too.
 */
export function claimReward(
  state: CasinoState,
  rewardId: string,
  ctx: PlayContext,
): { state: CasinoState; awarded: readonly RewardDefinition[] } {
  const claimed = claimInLedger(state.ledger, rewardId, ctx.nowIso);
  if (claimed === state.ledger) return { state, awarded: [] };
  const { ledger, awarded } = awardEligible(claimed, ctx.catalog, ctx.nowIso);
  return { state: { ...state, ledger }, awarded };
}

export function spinsRemaining(
  casino: CasinoRecord,
  game: 'roulette' | 'slots',
): number | null {
  const max =
    game === 'roulette' ? ROULETTE_RULES.maxSpins : SLOT_RULES.maxSpins;
  return max === null ? null : Math.max(0, max - casino.spins[game]);
}

/** Every casino reward claimed: the room is complete. */
export function isCasinoComplete(
  ledger: PrizeLedger,
  catalog: readonly RewardDefinition[],
): boolean {
  const mine = catalog.filter((r) => r.id.startsWith('casino.'));
  return (
    mine.length > 0 &&
    mine.every((r) => ledger.grants[r.id]?.status === 'claimed')
  );
}
