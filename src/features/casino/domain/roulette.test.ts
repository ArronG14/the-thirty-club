import { describe, expect, it } from 'vitest';
import { ROULETTE_RULES } from '../config/casinoRules';
import {
  addStake,
  betWins,
  chooseNumber,
  colourOf,
  isValidBet,
  payoutOdds,
  pocketIndex,
  POCKETS,
  settle,
  totalStake,
  validateSlip,
  WHEEL_ORDER,
  type PlacedBet,
  type RouletteBet,
} from './roulette';

const seeded = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('the european wheel', () => {
  it('has the 37 pockets in the correct clockwise order', () => {
    expect(WHEEL_ORDER).toHaveLength(37);
    expect(WHEEL_ORDER.slice(0, 12)).toEqual([
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27,
    ]);
    expect(WHEEL_ORDER.slice(-6)).toEqual([7, 28, 12, 35, 3, 26]);
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 37 }, (_, i) => i),
    );
    expect(POCKETS).toBe(37);
  });

  it('alternates red and black all the way round, with a single green zero', () => {
    const colours = WHEEL_ORDER.map(colourOf);
    expect(colours.filter((c) => c === 'green')).toHaveLength(1);
    expect(colours[0]).toBe('green');
    expect(colours.filter((c) => c === 'red')).toHaveLength(18);
    expect(colours.filter((c) => c === 'black')).toHaveLength(18);
    // The neighbours of every number are the opposite colour, bar zero's.
    for (let i = 1; i < 36; i += 1) {
      expect(colours[i]).not.toBe(colours[i + 1]);
    }
    // 26 is next to 0; 32 follows it; the wrap is the only same-colour seam.
    expect(colours[36]).toBe('black');
    expect(colours[1]).toBe('red');
  });

  it('colours the numbers like a real layout', () => {
    expect(colourOf(1)).toBe('red');
    expect(colourOf(2)).toBe('black');
    expect(colourOf(17)).toBe('black');
    expect(colourOf(18)).toBe('red');
    expect(colourOf(19)).toBe('red');
    expect(colourOf(36)).toBe('red');
    expect(colourOf(0)).toBe('green');
  });

  it('finds each number at its pocket', () => {
    for (const [i, n] of WHEEL_ORDER.entries()) expect(pocketIndex(n)).toBe(i);
    expect(pocketIndex(99)).toBe(-1);
  });
});

describe('bet evaluation', () => {
  const cases: [RouletteBet, number[]][] = [
    [{ kind: 'red' }, [1, 3, 36]],
    [{ kind: 'black' }, [2, 4, 35]],
    [{ kind: 'odd' }, [1, 35]],
    [{ kind: 'even' }, [2, 36]],
    [{ kind: 'low' }, [1, 18]],
    [{ kind: 'high' }, [19, 36]],
    [{ kind: 'dozen', index: 1 }, [1, 12]],
    [{ kind: 'dozen', index: 2 }, [13, 24]],
    [{ kind: 'dozen', index: 3 }, [25, 36]],
    [{ kind: 'straight', number: 17 }, [17]],
  ];
  it.each(cases)('%j pays on the numbers it covers', (bet, winners) => {
    for (const n of winners) expect(betWins(bet, n)).toBe(true);
  });

  it('loses every outside bet on zero, and wins the straight-up', () => {
    for (const kind of ['red', 'black', 'odd', 'even', 'low', 'high'] as const)
      expect(betWins({ kind }, 0)).toBe(false);
    for (const index of [1, 2, 3] as const)
      expect(betWins({ kind: 'dozen', index }, 0)).toBe(false);
    expect(betWins({ kind: 'straight', number: 0 }, 0)).toBe(true);
  });

  it('covers each outside bet by exactly its expected share of numbers', () => {
    const count = (bet: RouletteBet) =>
      WHEEL_ORDER.filter((n) => betWins(bet, n)).length;
    expect(count({ kind: 'red' })).toBe(18);
    expect(count({ kind: 'odd' })).toBe(18);
    expect(count({ kind: 'low' })).toBe(18);
    expect(count({ kind: 'dozen', index: 2 })).toBe(12);
  });

  it('pays the standard odds', () => {
    expect(payoutOdds({ kind: 'straight', number: 5 })).toBe(35);
    expect(payoutOdds({ kind: 'dozen', index: 1 })).toBe(2);
    expect(payoutOdds({ kind: 'red' })).toBe(1);
  });

  it('settles a slip: winning stakes are returned with their winnings', () => {
    const bets: PlacedBet[] = [
      { bet: { kind: 'red' }, stake: 100 },
      { bet: { kind: 'straight', number: 7 }, stake: 10 },
      { bet: { kind: 'even' }, stake: 50 },
    ];
    const win = settle(bets, 7); // red, odd, straight
    expect(win.colour).toBe('red');
    expect(win.staked).toBe(160);
    expect(win.returned).toBe(100 * 2 + 10 * 36);
    expect(win.net).toBe(560 - 160);
    expect(win.won).toBe(true);
    const lose = settle(bets, 0);
    expect(lose.returned).toBe(0);
    expect(lose.net).toBe(-160);
    expect(lose.won).toBe(false);
  });

  it('does not call a break-even spin a win', () => {
    const bets: PlacedBet[] = [
      { bet: { kind: 'red' }, stake: 100 },
      { bet: { kind: 'black' }, stake: 100 },
    ];
    const s = settle(bets, 1);
    expect(s.net).toBe(0);
    expect(s.won).toBe(false);
  });

  it('rejects bets that are not on the table', () => {
    expect(isValidBet({ kind: 'straight', number: 37 })).toBe(false);
    expect(isValidBet({ kind: 'straight', number: -1 })).toBe(false);
    expect(isValidBet({ kind: 'straight', number: 1.5 })).toBe(false);
    expect(isValidBet({ kind: 'dozen', index: 4 as 1 })).toBe(false);
    expect(isValidBet({ kind: 'split' } as unknown as RouletteBet)).toBe(false);
  });
});

describe('bet slips', () => {
  const rules = { minTotal: 10, maxTotal: 200 };
  it('merges chips on the same bet', () => {
    let bets = addStake([], { kind: 'red' }, 10);
    bets = addStake(bets, { kind: 'straight', number: 3 }, 10);
    bets = addStake(bets, { kind: 'red' }, 50);
    expect(bets).toHaveLength(2);
    expect(bets[0]!.stake).toBe(60);
    expect(totalStake(bets)).toBe(70);
  });

  it('validates against the table limits and the player’s chips', () => {
    const red = (stake: number): PlacedBet[] => [
      { bet: { kind: 'red' }, stake },
    ];
    expect(validateSlip([], rules, 500)).toMatch(/Place a chip/);
    expect(validateSlip(red(5), rules, 500)).toMatch(/minimum/);
    expect(validateSlip(red(300), rules, 500)).toMatch(/limit/);
    expect(validateSlip(red(100), rules, 50)).toMatch(/enough chips/);
    expect(validateSlip(red(10.5), rules, 500)).toMatch(/whole number/);
    expect(validateSlip(red(100), rules, 500)).toBeNull();
    expect(
      validateSlip(
        [{ bet: { kind: 'straight', number: 99 }, stake: 10 }],
        rules,
        500,
      ),
    ).toMatch(/not on the table/);
  });
});

describe('outcome generation', () => {
  const redBet: PlacedBet[] = [{ bet: { kind: 'red' }, stake: 10 }];
  const script = ROULETTE_RULES.script;

  it('honours a scripted win with a number that wins the slip', () => {
    for (let r = 0; r < 1; r += 0.07) {
      const out = chooseNumber({
        bets: redBet,
        spinsPlayed: 0,
        script,
        rng: () => r,
      });
      expect(out.source).toBe('script-win');
      expect(colourOf(out.number)).toBe('red');
    }
  });

  it('honours a scripted loss with a number that loses everything', () => {
    const bets: PlacedBet[] = [
      { bet: { kind: 'red' }, stake: 10 },
      { bet: { kind: 'straight', number: 8 }, stake: 10 },
    ];
    for (let r = 0; r < 1; r += 0.05) {
      const out = chooseNumber({ bets, spinsPlayed: 1, script, rng: () => r });
      expect(out.source).toBe('script-lose');
      expect(settle(bets, out.number).returned).toBe(0);
    }
  });

  it('plays the whole script in order: win, lose, win, lose, win', () => {
    const results = [0, 1, 2, 3, 4].map((n) => {
      const out = chooseNumber({
        bets: redBet,
        spinsPlayed: n,
        script,
        rng: seeded([0.31, 0.77]),
      });
      return settle(redBet, out.number).won;
    });
    expect(results).toEqual([true, false, true, false, true]);
  });

  it('is fair random once the script is exhausted', () => {
    const out = chooseNumber({
      bets: redBet,
      spinsPlayed: 5,
      script,
      rng: () => 0.5,
    });
    expect(out.source).toBe('random');
    expect(out.number).toBe(18);
    // Every number is reachable.
    const seen = new Set<number>();
    for (let i = 0; i < POCKETS; i += 1)
      seen.add(
        chooseNumber({
          bets: redBet,
          spinsPlayed: 99,
          script,
          rng: () => (i + 0.5) / POCKETS,
        }).number,
      );
    expect(seen.size).toBe(POCKETS);
  });

  it('falls back to random when a scripted step cannot be honoured', () => {
    // Nothing loses a slip that covers every number.
    const everything: PlacedBet[] = Array.from({ length: 37 }, (_, n) => ({
      bet: { kind: 'straight', number: n } as RouletteBet,
      stake: 10,
    }));
    const out = chooseNumber({
      bets: everything,
      spinsPlayed: 1,
      script,
      rng: () => 0.4,
    });
    expect(out.source).toBe('random');
  });

  it('lets a developer override force a number, and never an invalid one', () => {
    expect(
      chooseNumber({
        bets: redBet,
        spinsPlayed: 0,
        script,
        rng: () => 0,
        override: 0,
      }),
    ).toEqual({ number: 0, source: 'override' });
    expect(
      chooseNumber({
        bets: redBet,
        spinsPlayed: 0,
        script,
        rng: () => 0,
        override: 99,
      }).source,
    ).not.toBe('override');
  });
});
