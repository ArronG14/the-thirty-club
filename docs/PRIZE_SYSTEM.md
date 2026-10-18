# The prize system

The club's prize engine lives in `src/features/prizes/` and knows no game. The
Grand Casino is its first client; the Gift Vault and the Privileges Collection
are meant to be the next. Rationale and decisions: ARCHITECTURE.md, ADR-010.

## Vocabulary

| Concept     | Where                     | Meaning                                                                                             |
| ----------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| Counter     | `ledger.counters`         | A named, only-growing number a game reports (`roulette.wins`).                                      |
| Reward      | `rewards.ts`              | A definition: id, name, description, kind, source, eligibility, reveal message, optional vault/art. |
| Eligibility | `RewardCondition[]`       | All must hold: a counter threshold, another reward `awarded`, or another reward `claimed`.          |
| Grant       | `ledger.grants[rewardId]` | Proof a reward was awarded: `awardedAt`, `status` (`unclaimed`/`claimed`), `claimedAt`.             |
| Reward view | `rewardViews()`           | Definition plus status (`locked` / `unclaimed` / `claimed`), for any UI.                            |

Reward kinds: `vault-code`, `clue`, `privilege`, `collectible`, `mystery`.

Winning a game and receiving a prize are separate. A game only bumps counters;
`awardEligible()` decides, once, whether a reward is now earned. Awarding the
same reward twice, or un-claiming a claimed reward, is impossible by
construction (`grants` is keyed by reward id; nothing removes or downgrades).

## Adding a reward

Add a definition to a catalogue (today `src/features/casino/config/casinoRewards.ts`),
and make sure the catalogue is included in `src/features/prizes/clubRewards.ts`.
`validateCatalog()` (run in development and in tests) rejects duplicate ids,
unknown or circular dependencies, empty conditions and malformed vault codes.

```ts
{
  id: 'casino.vault-key-one',          // stable forever: it is the persisted key
  name: 'Vault Key I',
  description: 'A code that opens the first compartment of the Gift Vault.',
  kind: 'vault-code',
  source: 'slots',
  eligibility: [{ kind: 'counter', counter: 'slots.jackpots', atLeast: 1 }],
  revealMessage: 'Three Thirties, aligned…',
  vaultId: 'vault-compartment-1',      // vault-code rewards only
  unlockCode: 'TC-0000',               // PLACEHOLDER, see below
  placeholder: true,                   // flags stand-in content for the owner
}
```

## Persistence

Two versioned `localStorage` records. The vault reads only the first.

- `thirty-club:prizes`: `{ version: 1, counters, grants }`
- `thirty-club:casino`: `{ version: 1, chips, spins, visits, soundOn }` (game-local)

Both survive refreshes and restarts, repair or drop bad fields, and degrade to a
fresh record when unreadable. `migrate()` upgrades one schema version at a time;
a record from a newer build is not guessed at.

## What the Gift Vault consumes

```ts
import { createPrizeReader } from '../prizes/vaultContract';
import { browserPrizeStorage } from '../prizes/ledgerStorage';
import { CLUB_REWARDS, CLUB_REWARD_IDS } from '../prizes/clubRewards';

const prizes = createPrizeReader(
  browserPrizeStorage(CLUB_REWARD_IDS),
  CLUB_REWARDS,
);

prizes.vaultGrants(); // claimed vault codes: { rewardId, vaultId, unlockCode, source, claimedAt }[]
prizes.isVaultUnlocked('vault-compartment-1');
prizes.matchCode('vault-compartment-1', typedByAlise); // case-insensitive
prizes.claimed('clue'); // claimed rewards of a kind
prizes.rewards(); // everything, with status
```

A compartment opens for a CLAIMED vault code; awarded-but-unclaimed is not yet
hers to use. The vault must not import any game.

## Limits and placeholders

- Unlock codes are in the client bundle, so they are discoverable. That is fine
  for a ceremonial surprise and not for anything of real value; ADR-003 still
  requires the deferred backend before valuable redemptions.
- Everything flagged `placeholder: true` is stand-in content (the clue text, the
  vault code and id, the House Favour privilege) and must be replaced by the
  owner before the birthday.
