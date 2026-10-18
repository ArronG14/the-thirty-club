import { describe, expect, it } from 'vitest';
import { CLUB_REWARDS } from '../../prizes/clubRewards';
import { emptyLedger, unclaimed } from '../../prizes/ledger';
import { CASINO_REWARD_IDS as IDS, COUNTERS } from '../config/casinoRewards';
import { CHIPS, ROULETTE_RULES, SLOT_RULES } from '../config/casinoRules';
import {
  CASINO_RECORD_KEY,
  CASINO_SCHEMA_VERSION,
  freshCasino,
  parseCasino,
  serialiseCasino,
} from './casinoRecord';
import {
  claimReward,
  enterCasino,
  isCasinoComplete,
  playRoulette,
  playSlots,
  spinsRemaining,
  type CasinoState,
  type PlayContext,
} from './casinoState';
import type { PlacedBet } from './roulette';
import { nextLine, CASINO_LINES } from './butler';

const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const ctx = (seed = 1, nowIso = '2026-10-24T20:00:00.000Z'): PlayContext => ({
  rng: lcg(seed),
  nowIso,
  catalog: CLUB_REWARDS,
});
const start = (): CasinoState => ({ casino: freshCasino, ledger: emptyLedger });
const red: PlacedBet[] = [{ bet: { kind: 'red' }, stake: 10 }];

function spinRoulette(state: CasinoState, n = 1, override?: number) {
  let current = state;
  const awarded: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const play = playRoulette(current, red, ctx(i + 1), override);
    if (!play.ok) throw new Error(play.message);
    current = play.state;
    awarded.push(...play.awarded.map((r) => r.id));
  }
  return { state: current, awarded };
}

describe('roulette play', () => {
  it('resolves chips, counters and rewards in one step', () => {
    const play = playRoulette(start(), red, ctx());
    if (!play.ok) throw new Error('expected a play');
    // Spin one is scripted as a win.
    expect(play.settlement.won).toBe(true);
    expect(play.state.casino.chips).toBe(CHIPS.starting + 10);
    expect(play.state.casino.spins.roulette).toBe(1);
    expect(play.state.ledger.counters[COUNTERS.rouletteSpins]).toBe(1);
    expect(play.state.ledger.counters[COUNTERS.rouletteWins]).toBe(1);
    expect(play.awarded.map((r) => r.id)).toEqual([IDS.firstFortune]);
    expect(play.state.ledger.grants[IDS.firstFortune]!.status).toBe(
      'unclaimed',
    );
  });

  it('follows the script: the third win earns the clue, exactly once', () => {
    const { state, awarded } = spinRoulette(start(), 5);
    expect(state.ledger.counters[COUNTERS.rouletteWins]).toBe(3);
    expect(awarded).toEqual([IDS.firstFortune, IDS.croupiersClue]);
    const more = spinRoulette(state, 30);
    expect(more.awarded.filter((id) => id === IDS.croupiersClue)).toEqual([]);
    expect(more.awarded.filter((id) => id === IDS.firstFortune)).toEqual([]);
  });

  it('awards the lucky number only for a straight-up win', () => {
    const straight: PlacedBet[] = [
      { bet: { kind: 'straight', number: 17 }, stake: 10 },
    ];
    const miss = playRoulette({ ...start() }, straight, ctx(), 3);
    if (!miss.ok) throw new Error('expected a play');
    expect(miss.awarded.map((r) => r.id)).not.toContain(IDS.luckyNumber);
    const hit = playRoulette(start(), straight, ctx(), 17);
    if (!hit.ok) throw new Error('expected a play');
    expect(hit.settlement.net).toBe(350);
    expect(hit.awarded.map((r) => r.id)).toContain(IDS.luckyNumber);
  });

  it('refuses a bad slip without changing anything', () => {
    const state = start();
    const none = playRoulette(state, [], ctx());
    expect(none).toMatchObject({ ok: false, reason: 'invalid' });
    const tooMuch = playRoulette(
      state,
      [{ bet: { kind: 'red' }, stake: 5000 }],
      ctx(),
    );
    expect(tooMuch).toMatchObject({ ok: false });
    expect(state).toEqual(start());
  });

  it('tops the house up when the player cannot cover the minimum', () => {
    const broke: CasinoState = {
      ledger: emptyLedger,
      casino: { ...freshCasino, chips: 10, spins: { roulette: 1, slots: 0 } },
    };
    // Spin two is a scripted loss, so the last 10 chips go.
    const play = playRoulette(broke, red, ctx());
    if (!play.ok) throw new Error('expected a play');
    expect(play.settlement.net).toBe(-10);
    expect(play.toppedUp).toBe(true);
    expect(play.state.casino.chips).toBe(CHIPS.topUpTo);
  });

  it('closes the table at the spin limit', () => {
    const max = ROULETTE_RULES.maxSpins!;
    const done: CasinoState = {
      ledger: emptyLedger,
      casino: { ...freshCasino, spins: { roulette: max, slots: 0 } },
    };
    expect(playRoulette(done, red, ctx())).toMatchObject({
      ok: false,
      reason: 'closed',
    });
    expect(spinsRemaining(done.casino, 'roulette')).toBe(0);
    expect(spinsRemaining(freshCasino, 'roulette')).toBe(max);
  });

  it('keeps the shown number, colour and outcome in agreement with the engine', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const play = playRoulette(start(), red, ctx(seed), seed % 37);
      if (!play.ok) throw new Error('expected a play');
      expect(play.settlement.number).toBe(play.outcome.number);
      expect(play.settlement.won).toBe(
        (play.settlement.colour === 'red') === true,
      );
    }
  });
});

describe('slot play', () => {
  function spinSlots(state: CasinoState, n: number) {
    let current = state;
    const awarded: string[] = [];
    const classes: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const play = playSlots(current, ctx(i + 9));
      if (!play.ok) throw new Error(play.message);
      current = play.state;
      awarded.push(...play.awarded.map((r) => r.id));
      classes.push(play.outcome.evaluation.class);
    }
    return { state: current, awarded, classes };
  }

  it('plays the script and pays the vault code on the seventh spin only', () => {
    const { awarded, classes, state } = spinSlots(start(), 7);
    expect(classes).toEqual([
      'pair',
      'miss',
      'miss',
      'triple',
      'miss',
      'miss',
      'jackpot',
    ]);
    expect(awarded).toEqual([IDS.gildedReel, IDS.vaultKeyOne]);
    expect(state.ledger.counters[COUNTERS.slotsJackpots]).toBe(1);
    const later = spinSlots(state, 60);
    expect(later.classes).not.toContain('jackpot');
    expect(later.awarded).toEqual([]);
  });

  it('charges the stake and pays winnings from the evaluation', () => {
    const play = playSlots(start(), ctx(), 'jackpot');
    if (!play.ok) throw new Error('expected a play');
    expect(play.staked).toBe(SLOT_RULES.stake);
    expect(play.returned).toBe(SLOT_RULES.stake * 101);
    expect(play.state.casino.chips).toBe(CHIPS.starting - 10 + 1010);
    const miss = playSlots(start(), ctx(), 'miss');
    if (!miss.ok) throw new Error('expected a play');
    expect(miss.returned).toBe(0);
    expect(miss.state.casino.chips).toBe(CHIPS.starting - 10);
  });

  it('refuses a spin the player cannot afford', () => {
    const state: CasinoState = {
      ledger: emptyLedger,
      casino: { ...freshCasino, chips: 5 },
    };
    expect(playSlots(state, ctx())).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });

  it('closes the machine at the spin limit', () => {
    const state: CasinoState = {
      ledger: emptyLedger,
      casino: {
        ...freshCasino,
        spins: { roulette: 0, slots: SLOT_RULES.maxSpins! },
      },
    };
    expect(playSlots(state, ctx())).toMatchObject({
      ok: false,
      reason: 'closed',
    });
  });
});

describe('claiming and progression', () => {
  function earnBoth() {
    let state = spinRoulette(start(), 5).state;
    for (let i = 0; i < 7; i += 1) {
      const play = playSlots(state, ctx(i + 3));
      if (!play.ok) throw new Error(play.message);
      state = play.state;
    }
    return state;
  }

  it('separates winning from receiving: nothing is claimed until she claims it', () => {
    const state = earnBoth();
    expect(unclaimed(state.ledger, CLUB_REWARDS).map((r) => r.id)).toEqual([
      IDS.firstFortune,
      IDS.croupiersClue,
      IDS.gildedReel,
      IDS.vaultKeyOne,
    ]);
    expect(state.ledger.grants[IDS.houseFavour]).toBeUndefined();
  });

  it('awards the House Favour only after both games’ prizes are claimed', () => {
    let state = earnBoth();
    let r = claimReward(state, IDS.croupiersClue, ctx());
    expect(r.awarded).toEqual([]);
    r = claimReward(r.state, IDS.vaultKeyOne, ctx());
    expect(r.awarded.map((x) => x.id)).toEqual([IDS.houseFavour]);
    state = r.state;
    expect(state.ledger.grants[IDS.houseFavour]!.status).toBe('unclaimed');
  });

  it('makes a second claim a no-op that keeps the first timestamp', () => {
    const state = earnBoth();
    const first = claimReward(
      state,
      IDS.firstFortune,
      ctx(1, '2026-10-24T21:00:00.000Z'),
    );
    const second = claimReward(
      first.state,
      IDS.firstFortune,
      ctx(1, '2026-10-25T09:00:00.000Z'),
    );
    expect(second.state).toBe(first.state);
    expect(first.state.ledger.grants[IDS.firstFortune]!.claimedAt).toBe(
      '2026-10-24T21:00:00.000Z',
    );
  });

  it('completes the casino only when every reward is claimed', () => {
    let state = earnBoth();
    expect(isCasinoComplete(state.ledger, CLUB_REWARDS)).toBe(false);
    for (const id of [
      IDS.firstFortune,
      IDS.gildedReel,
      IDS.croupiersClue,
      IDS.vaultKeyOne,
    ]) {
      state = claimReward(state, id, ctx()).state;
    }
    state = claimReward(state, IDS.houseFavour, ctx()).state;
    // The lucky number needs a straight-up win.
    expect(isCasinoComplete(state.ledger, CLUB_REWARDS)).toBe(false);
    const straight = playRoulette(
      state,
      [{ bet: { kind: 'straight', number: 5 }, stake: 10 }],
      ctx(),
      5,
    );
    if (!straight.ok) throw new Error('expected a play');
    state = claimReward(straight.state, IDS.luckyNumber, ctx()).state;
    expect(isCasinoComplete(state.ledger, CLUB_REWARDS)).toBe(true);
  });

  it('never resets progress when play continues', () => {
    const before = earnBoth();
    const after = spinRoulette(before, 10).state;
    for (const [id, grant] of Object.entries(before.ledger.grants))
      expect(after.ledger.grants[id]).toEqual(grant);
    expect(after.ledger.counters[COUNTERS.rouletteSpins]).toBe(15);
  });
});

describe('visits and the casino record', () => {
  it('counts visits', () => {
    expect(enterCasino(start()).casino.visits).toBe(1);
  });

  it('round-trips', () => {
    const record = {
      ...freshCasino,
      chips: 321,
      visits: 4,
      soundOn: false,
      spins: { roulette: 9, slots: 2 },
    };
    expect(parseCasino(serialiseCasino(record))).toEqual(record);
  });

  it('degrades safely on missing, corrupt or foreign data', () => {
    for (const raw of [null, '', 'x', '[]', '{"version":2}', '{"version":0}'])
      expect(parseCasino(raw)).toEqual(freshCasino);
    expect(CASINO_RECORD_KEY).toBe('thirty-club:casino');
  });

  it('repairs individual bad fields rather than trusting them', () => {
    const parsed = parseCasino(
      JSON.stringify({
        version: CASINO_SCHEMA_VERSION,
        chips: -5,
        spins: { roulette: 'many', slots: 3.9 },
        visits: -1,
        soundOn: 'no',
      }),
    );
    expect(parsed).toEqual({
      chips: CHIPS.starting,
      spins: { roulette: 0, slots: 3 },
      visits: 0,
      soundOn: true,
    });
  });
});

describe('butler lines', () => {
  it('never says the same thing twice in a row where there is a choice', () => {
    for (const [moment, pool] of Object.entries(CASINO_LINES)) {
      let previous: string | null = null;
      for (let cursor = 0; cursor < pool.length * 3; cursor += 1) {
        const line = nextLine(
          moment as keyof typeof CASINO_LINES,
          cursor,
          previous,
        );
        if (pool.length > 1) expect(line).not.toBe(previous);
        previous = line;
      }
    }
  });

  it('carries the required tone lines', () => {
    expect(CASINO_LINES['roulette-open']).toContain(
      'A little risk is perfectly acceptable on one’s thirtieth birthday.',
    );
    expect(CASINO_LINES['reward-vault-code'][0]).toMatch(
      /something rather special/,
    );
  });
});
