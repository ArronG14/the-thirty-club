/**
 * The club's prize vocabulary. Nothing here knows about any game: games
 * report counters (`roulette.wins`), rewards declare eligibility against
 * those counters, and the ledger decides what is awarded. The Gift Vault and
 * every future experience consume the same types.
 */

export type RewardKind =
  /** Unlocks a future Gift Vault drawer or compartment. */
  | 'vault-code'
  /** Points at a physical gift or an NFC tag. */
  | 'clue'
  /** A birthday privilege or experience. */
  | 'privilege'
  /** A digital token, emblem or achievement. */
  | 'collectible'
  /** A surprise message or a future unlock. */
  | 'mystery';

export const REWARD_KINDS: readonly RewardKind[] = [
  'vault-code',
  'clue',
  'privilege',
  'collectible',
  'mystery',
];

/** The experience that earns a reward. Extend as experiences are built. */
export type RewardSource = 'roulette' | 'slots' | 'casino';

export type RewardCondition =
  /** A named counter has reached a value (e.g. `roulette.wins` ≥ 3). */
  | { kind: 'counter'; counter: string; atLeast: number }
  /** Another reward has been awarded. */
  | { kind: 'awarded'; rewardId: string }
  /** Another reward has been claimed by Alise. */
  | { kind: 'claimed'; rewardId: string };

export interface RewardDefinition {
  /** Stable, unique and never reused: it is the persisted key. */
  id: string;
  name: string;
  description: string;
  kind: RewardKind;
  source: RewardSource;
  /** Every condition must hold; an empty list is never eligible. */
  eligibility: readonly RewardCondition[];
  /** Spoken or shown when the reward is revealed. */
  revealMessage: string;
  /** Key into the casino asset registry for display artwork. */
  artwork?: string;
  /** The Gift Vault compartment this reward opens (vault-code only). */
  vaultId?: string;
  /** The code that opens it. PLACEHOLDER values are flagged below. */
  unlockCode?: string;
  /** True while the text or code is stand-in content awaiting the owner. */
  placeholder?: boolean;
}

export type ClaimStatus = 'unclaimed' | 'claimed';

/** A reward Alise has earned. Presence in the ledger means "awarded". */
export interface RewardGrant {
  rewardId: string;
  awardedAt: string;
  status: ClaimStatus;
  claimedAt?: string;
}

/** Definition plus what has happened to it: what the UI and vault read. */
export interface RewardView {
  definition: RewardDefinition;
  status: 'locked' | ClaimStatus;
  awardedAt?: string;
  claimedAt?: string;
}

/** Everything wrong with a catalogue; empty when it is sound. */
export function validateCatalog(
  catalog: readonly RewardDefinition[],
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const reward of catalog) {
    if (!reward.id.trim()) problems.push('A reward has an empty id.');
    if (ids.has(reward.id)) problems.push(`Duplicate reward id: ${reward.id}`);
    ids.add(reward.id);
    if (!reward.name.trim()) problems.push(`${reward.id}: missing name.`);
    if (!reward.description.trim())
      problems.push(`${reward.id}: missing description.`);
    if (!reward.revealMessage.trim())
      problems.push(`${reward.id}: missing reveal message.`);
    if (!REWARD_KINDS.includes(reward.kind))
      problems.push(`${reward.id}: unknown kind ${String(reward.kind)}.`);
    if (reward.eligibility.length === 0)
      problems.push(`${reward.id}: no eligibility conditions.`);
    if (reward.kind === 'vault-code' && (!reward.vaultId || !reward.unlockCode))
      problems.push(`${reward.id}: a vault code needs a vaultId and a code.`);
    if (reward.kind !== 'vault-code' && (reward.vaultId || reward.unlockCode))
      problems.push(`${reward.id}: only vault codes carry a vault or code.`);
  }
  for (const reward of catalog) {
    for (const condition of reward.eligibility) {
      if (condition.kind === 'counter') {
        if (!condition.counter.trim() || !(condition.atLeast > 0))
          problems.push(`${reward.id}: a counter condition is malformed.`);
        continue;
      }
      if (condition.rewardId === reward.id)
        problems.push(`${reward.id}: depends on itself.`);
      else if (!ids.has(condition.rewardId))
        problems.push(
          `${reward.id}: depends on unknown reward ${condition.rewardId}.`,
        );
    }
  }
  if (problems.length === 0) {
    const cycle = findCycle(catalog);
    if (cycle) problems.push(`Circular reward dependency: ${cycle}`);
  }
  return problems;
}

function findCycle(catalog: readonly RewardDefinition[]): string | null {
  const edges = new Map<string, string[]>();
  for (const reward of catalog) {
    edges.set(
      reward.id,
      reward.eligibility.flatMap((c) =>
        c.kind === 'counter' ? [] : [c.rewardId],
      ),
    );
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, trail: string[]): string | null => {
    if (state.get(id) === 'done') return null;
    if (state.get(id) === 'visiting') return [...trail, id].join(' → ');
    state.set(id, 'visiting');
    for (const next of edges.get(id) ?? []) {
      const found = visit(next, [...trail, id]);
      if (found) return found;
    }
    state.set(id, 'done');
    return null;
  };
  for (const id of edges.keys()) {
    const found = visit(id, []);
    if (found) return found;
  }
  return null;
}
