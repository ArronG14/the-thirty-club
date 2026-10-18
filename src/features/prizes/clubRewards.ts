/**
 * Every reward in the club. Experiences add their definitions here; the
 * Gift Vault and the Privileges Collection read the aggregate through the
 * prize reader (see prizes/vaultContract.ts).
 */
import { validateCatalog, type RewardDefinition } from './rewards';
import { CASINO_REWARDS } from '../casino/config/casinoRewards';

export const CLUB_REWARDS: readonly RewardDefinition[] = [...CASINO_REWARDS];

export const CLUB_REWARD_IDS: ReadonlySet<string> = new Set(
  CLUB_REWARDS.map((r) => r.id),
);

if (import.meta.env.DEV) {
  const problems = validateCatalog(CLUB_REWARDS);
  if (problems.length > 0)
    console.error('[prizes] reward catalogue problems:', problems);
}
