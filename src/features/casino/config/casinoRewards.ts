/**
 * The casino's prizes and the progression that earns them. This file is the
 * ONE place to change what Alise can win and when; no prize logic lives in
 * any component.
 *
 * Eligibility reads counters reported by the games:
 *   roulette.spins · roulette.wins · roulette.straightWins
 *   slots.spins · slots.wins · slots.jackpots
 *
 * PLACEHOLDERS: every `placeholder: true` entry is stand-in copy or a stand-in
 * code. They must be replaced by the owner before the birthday. They are
 * deliberately generic so nothing false or private is shown in the meantime.
 */
import type { RewardDefinition } from '../../prizes/rewards';

export const COUNTERS = {
  rouletteSpins: 'roulette.spins',
  rouletteWins: 'roulette.wins',
  rouletteStraightWins: 'roulette.straightWins',
  slotsSpins: 'slots.spins',
  slotsWins: 'slots.wins',
  slotsJackpots: 'slots.jackpots',
} as const;

/** Reward ids, exported so tests and the dev tools name them safely. */
export const CASINO_REWARD_IDS = {
  firstFortune: 'casino.first-fortune',
  croupiersClue: 'casino.croupiers-clue',
  luckyNumber: 'casino.lucky-number',
  gildedReel: 'casino.gilded-reel',
  vaultKeyOne: 'casino.vault-key-one',
  houseFavour: 'casino.house-favour',
} as const;

export const CASINO_REWARDS: readonly RewardDefinition[] = [
  {
    id: CASINO_REWARD_IDS.firstFortune,
    name: 'The First Fortune',
    description:
      'A gilt token struck for your first win at the roulette table.',
    kind: 'collectible',
    source: 'roulette',
    eligibility: [
      { kind: 'counter', counter: COUNTERS.rouletteWins, atLeast: 1 },
    ],
    revealMessage: 'Your first win at the tables, struck in gold.',
    artwork: 'rewardFirstFortune',
  },
  {
    id: CASINO_REWARD_IDS.croupiersClue,
    name: 'The Croupier’s Clue',
    description:
      'A card slipped across the felt, pointing towards a real gift.',
    kind: 'clue',
    source: 'roulette',
    eligibility: [
      { kind: 'counter', counter: COUNTERS.rouletteWins, atLeast: 3 },
    ],
    revealMessage:
      'The croupier slides a card across the felt. It says only: “Ask the butler where to look.” (Stand-in clue: replace with the real one.)',
    artwork: 'rewardClue',
    placeholder: true,
  },
  {
    id: CASINO_REWARD_IDS.luckyNumber,
    name: 'The Lucky Number',
    description: 'A single number, called correctly. The house is impressed.',
    kind: 'mystery',
    source: 'roulette',
    eligibility: [
      { kind: 'counter', counter: COUNTERS.rouletteStraightWins, atLeast: 1 },
    ],
    revealMessage:
      'Thirty-five to one. The house will remember this, and so, one suspects, will you.',
    artwork: 'rewardMystery',
  },
  {
    id: CASINO_REWARD_IDS.gildedReel,
    name: 'The Gilded Reel',
    description: 'A miniature brass reel for your first win on the machine.',
    kind: 'collectible',
    source: 'slots',
    eligibility: [{ kind: 'counter', counter: COUNTERS.slotsWins, atLeast: 1 }],
    revealMessage: 'Your first win on the machine, cast in brass.',
    artwork: 'rewardGildedReel',
  },
  {
    id: CASINO_REWARD_IDS.vaultKeyOne,
    name: 'Vault Key I',
    description: 'A code that opens the first compartment of the Gift Vault.',
    kind: 'vault-code',
    source: 'slots',
    eligibility: [
      { kind: 'counter', counter: COUNTERS.slotsJackpots, atLeast: 1 },
    ],
    revealMessage:
      'Three Thirties, aligned. The machine releases a key to something rather special.',
    vaultId: 'vault-compartment-1',
    // PLACEHOLDER: not a real code. Ships in the client bundle (see ADR).
    unlockCode: 'TC-0000',
    artwork: 'rewardVaultKey',
    placeholder: true,
  },
  {
    id: CASINO_REWARD_IDS.houseFavour,
    name: 'The House Favour',
    description: 'A birthday privilege, granted once both games have been won.',
    kind: 'privilege',
    source: 'casino',
    eligibility: [
      { kind: 'claimed', rewardId: CASINO_REWARD_IDS.croupiersClue },
      { kind: 'claimed', rewardId: CASINO_REWARD_IDS.vaultKeyOne },
    ],
    revealMessage:
      'The house grants you one small indulgence of your choosing. (Stand-in privilege: replace with the real one.)',
    artwork: 'rewardPrivilege',
    placeholder: true,
  },
];

/**
 * Casino completion: every reward above claimed. Used to mark the room as
 * completed in the membership record and to word the butler's farewell.
 */
export const CASINO_COMPLETION_REWARDS: readonly string[] = CASINO_REWARDS.map(
  (r) => r.id,
);
