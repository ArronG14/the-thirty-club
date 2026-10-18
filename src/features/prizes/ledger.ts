/**
 * The prize ledger: counters reported by experiences and the rewards those
 * counters have earned. Pure functions only; persistence is separate.
 *
 * Two guarantees hold everywhere in here:
 *  - A reward is awarded at most once, ever (`grants` is keyed by reward id).
 *  - A claimed reward stays claimed. Nothing in this module removes or
 *    downgrades a grant, and counters only ever grow.
 */
import type {
  RewardCondition,
  RewardDefinition,
  RewardGrant,
  RewardView,
} from './rewards';

export interface PrizeLedger {
  counters: Readonly<Record<string, number>>;
  grants: Readonly<Record<string, RewardGrant>>;
}

export const emptyLedger: PrizeLedger = { counters: {}, grants: {} };

/** Adds to a counter. Zero and negative amounts change nothing. */
export function bump(
  ledger: PrizeLedger,
  counter: string,
  by = 1,
): PrizeLedger {
  if (!(by > 0) || !Number.isFinite(by)) return ledger;
  return {
    ...ledger,
    counters: {
      ...ledger.counters,
      [counter]: (ledger.counters[counter] ?? 0) + by,
    },
  };
}

function holds(condition: RewardCondition, ledger: PrizeLedger): boolean {
  switch (condition.kind) {
    case 'counter':
      return (ledger.counters[condition.counter] ?? 0) >= condition.atLeast;
    case 'awarded':
      return condition.rewardId in ledger.grants;
    case 'claimed':
      return ledger.grants[condition.rewardId]?.status === 'claimed';
  }
}

export function isEligible(
  reward: RewardDefinition,
  ledger: PrizeLedger,
): boolean {
  return (
    reward.eligibility.length > 0 &&
    reward.eligibility.every((c) => holds(c, ledger))
  );
}

export interface AwardOutcome {
  ledger: PrizeLedger;
  /** Rewards newly awarded by this call, in award order. */
  awarded: readonly RewardDefinition[];
}

/**
 * Awards every reward that has become eligible and has not been awarded
 * before. Repeats so that a reward depending on another's award can follow
 * it in the same call; the catalogue is validated acyclic, and the loop is
 * bounded regardless.
 */
export function awardEligible(
  ledger: PrizeLedger,
  catalog: readonly RewardDefinition[],
  nowIso: string,
): AwardOutcome {
  let current = ledger;
  const awarded: RewardDefinition[] = [];
  for (let pass = 0; pass <= catalog.length; pass += 1) {
    const next = catalog.filter(
      (reward) => !(reward.id in current.grants) && isEligible(reward, current),
    );
    if (next.length === 0) break;
    const grants = { ...current.grants };
    for (const reward of next) {
      grants[reward.id] = {
        rewardId: reward.id,
        awardedAt: nowIso,
        status: 'unclaimed',
      };
      awarded.push(reward);
    }
    current = { ...current, grants };
  }
  return { ledger: current, awarded };
}

/**
 * Awards one reward directly (development tools and tests). Already
 * awarded rewards are left exactly as they are.
 */
export function awardDirect(
  ledger: PrizeLedger,
  rewardId: string,
  nowIso: string,
): PrizeLedger {
  if (rewardId in ledger.grants) return ledger;
  return {
    ...ledger,
    grants: {
      ...ledger.grants,
      [rewardId]: { rewardId, awardedAt: nowIso, status: 'unclaimed' },
    },
  };
}

/**
 * Marks an awarded reward as claimed. Idempotent: a second claim keeps the
 * first timestamp. Claiming something never awarded changes nothing.
 */
export function claim(
  ledger: PrizeLedger,
  rewardId: string,
  nowIso: string,
): PrizeLedger {
  const grant = ledger.grants[rewardId];
  if (!grant || grant.status === 'claimed') return ledger;
  return {
    ...ledger,
    grants: {
      ...ledger.grants,
      [rewardId]: { ...grant, status: 'claimed', claimedAt: nowIso },
    },
  };
}

export function rewardViews(
  ledger: PrizeLedger,
  catalog: readonly RewardDefinition[],
): RewardView[] {
  return catalog.map((definition) => {
    const grant = ledger.grants[definition.id];
    if (!grant) return { definition, status: 'locked' };
    const view: RewardView = {
      definition,
      status: grant.status,
      awardedAt: grant.awardedAt,
    };
    if (grant.claimedAt) view.claimedAt = grant.claimedAt;
    return view;
  });
}

/** Awarded but not yet claimed, oldest first: the reveal queue. */
export function unclaimed(
  ledger: PrizeLedger,
  catalog: readonly RewardDefinition[],
): RewardDefinition[] {
  const order = new Map(catalog.map((r, i) => [r.id, i]));
  return catalog
    .filter((r) => ledger.grants[r.id]?.status === 'unclaimed')
    .sort((a, b) => {
      const at = ledger.grants[a.id]!.awardedAt.localeCompare(
        ledger.grants[b.id]!.awardedAt,
      );
      return at !== 0 ? at : order.get(a.id)! - order.get(b.id)!;
    });
}

export function isClaimed(ledger: PrizeLedger, rewardId: string): boolean {
  return ledger.grants[rewardId]?.status === 'claimed';
}
