/**
 * THE GIFT VAULT CONTRACT. The vault (not built yet) reads prizes through
 * this module and nothing else: it never imports a game. A drawer opens for
 * a vault code that Alise has CLAIMED; an awarded-but-unclaimed code is not
 * yet hers to use.
 *
 * Example consumer:
 *
 *   const prizes = createPrizeReader(browserPrizeStorage(ids), CLUB_REWARDS);
 *   prizes.vaultGrants();            // every claimed vault code
 *   prizes.isVaultUnlocked('drawer-one');
 *   prizes.matchCode('drawer-one', typed); // checks a typed code
 *
 * Caveat, recorded in ARCHITECTURE.md: the unlock codes ship inside the
 * client bundle, so this is a convenience for the surprise, not security.
 * Anything that must resist a determined reader needs the deferred backend.
 */
import { rewardViews } from './ledger';
import type { PrizeStorage } from './ledgerStorage';
import type { RewardDefinition, RewardSource, RewardView } from './rewards';

export interface VaultGrant {
  rewardId: string;
  vaultId: string;
  unlockCode: string;
  source: RewardSource;
  claimedAt: string;
}

export interface PrizeReader {
  /** Every reward with its current status. */
  rewards(): RewardView[];
  /** Claimed rewards of one kind or all. */
  claimed(kind?: RewardDefinition['kind']): RewardView[];
  /** Claimed vault codes, ready to open compartments. */
  vaultGrants(): VaultGrant[];
  isVaultUnlocked(vaultId: string): boolean;
  /** True when `code` is the claimed code for `vaultId`. */
  matchCode(vaultId: string, code: string): boolean;
}

export function createPrizeReader(
  storage: PrizeStorage,
  catalog: readonly RewardDefinition[],
): PrizeReader {
  const views = () => rewardViews(storage.load(), catalog);
  const vaultGrants = (): VaultGrant[] =>
    views().flatMap(({ definition, status, claimedAt }) =>
      definition.kind === 'vault-code' &&
      status === 'claimed' &&
      definition.vaultId &&
      definition.unlockCode &&
      claimedAt
        ? [
            {
              rewardId: definition.id,
              vaultId: definition.vaultId,
              unlockCode: definition.unlockCode,
              source: definition.source,
              claimedAt,
            },
          ]
        : [],
    );
  return {
    rewards: views,
    claimed: (kind) =>
      views().filter(
        (v) => v.status === 'claimed' && (!kind || v.definition.kind === kind),
      ),
    vaultGrants,
    isVaultUnlocked: (vaultId) =>
      vaultGrants().some((g) => g.vaultId === vaultId),
    matchCode: (vaultId, code) =>
      vaultGrants().some(
        (g) =>
          g.vaultId === vaultId &&
          g.unlockCode.toLowerCase() === code.trim().toLowerCase(),
      ),
  };
}
