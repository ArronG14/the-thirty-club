import { describe, expect, it } from 'vitest';
import { CLUB_REWARDS } from './clubRewards';
import {
  awardDirect,
  awardEligible,
  bump,
  claim,
  emptyLedger,
  isEligible,
  rewardViews,
  unclaimed,
} from './ledger';
import {
  MIGRATIONS,
  migrate,
  parseLedger,
  PRIZE_SCHEMA_VERSION,
  serialiseLedger,
  memoryPrizeStorage,
} from './ledgerStorage';
import { validateCatalog, type RewardDefinition } from './rewards';
import { createPrizeReader } from './vaultContract';

const NOW = '2026-10-24T20:00:00.000Z';
const LATER = '2026-10-24T20:05:00.000Z';

const base = {
  description: 'd',
  revealMessage: 'r',
  source: 'roulette' as const,
};
const catalog: RewardDefinition[] = [
  {
    ...base,
    id: 'a',
    name: 'A',
    kind: 'collectible',
    eligibility: [{ kind: 'counter', counter: 'wins', atLeast: 2 }],
  },
  {
    ...base,
    id: 'b',
    name: 'B',
    kind: 'vault-code',
    vaultId: 'v1',
    unlockCode: 'X',
    eligibility: [{ kind: 'claimed', rewardId: 'a' }],
  },
];

describe('reward catalogue validation', () => {
  it('accepts the shipped catalogue', () => {
    expect(validateCatalog(CLUB_REWARDS)).toEqual([]);
  });

  it('reports duplicates, unknown and circular dependencies, and bad vault codes', () => {
    const dup = validateCatalog([catalog[0]!, catalog[0]!]);
    expect(dup.join()).toMatch(/Duplicate reward id: a/);
    const unknown = validateCatalog([
      { ...catalog[0]!, eligibility: [{ kind: 'awarded', rewardId: 'zzz' }] },
    ]);
    expect(unknown.join()).toMatch(/unknown reward zzz/);
    const circular = validateCatalog([
      { ...catalog[0]!, eligibility: [{ kind: 'awarded', rewardId: 'b' }] },
      { ...catalog[1]!, eligibility: [{ kind: 'awarded', rewardId: 'a' }] },
    ]);
    expect(circular.join()).toMatch(/Circular/);
    const noCode = validateCatalog([
      {
        ...catalog[1]!,
        eligibility: [{ kind: 'counter', counter: 'x', atLeast: 1 }],
        unlockCode: '',
      },
    ]);
    expect(noCode.join()).toMatch(/needs a vaultId and a code/);
    const stray = validateCatalog([{ ...catalog[0]!, vaultId: 'v' }]);
    expect(stray.join()).toMatch(/only vault codes/);
  });

  it('never lets a reward with no conditions be eligible', () => {
    const open: RewardDefinition = { ...catalog[0]!, eligibility: [] };
    expect(isEligible(open, emptyLedger)).toBe(false);
    expect(validateCatalog([open]).join()).toMatch(/no eligibility/);
  });

  it('flags every placeholder so none ships unnoticed', () => {
    const flagged = CLUB_REWARDS.filter((r) => r.placeholder).map((r) => r.id);
    expect(flagged).toContain('casino.vault-key-one');
  });
});

describe('prize ledger', () => {
  it('awards a reward once its counter threshold is met, and not before', () => {
    let ledger = bump(emptyLedger, 'wins');
    expect(awardEligible(ledger, catalog, NOW).awarded).toEqual([]);
    ledger = bump(ledger, 'wins');
    const result = awardEligible(ledger, catalog, NOW);
    expect(result.awarded.map((r) => r.id)).toEqual(['a']);
    expect(result.ledger.grants.a).toEqual({
      rewardId: 'a',
      awardedAt: NOW,
      status: 'unclaimed',
    });
  });

  it('never awards the same reward twice', () => {
    const once = awardEligible(bump(emptyLedger, 'wins', 5), catalog, NOW);
    const again = awardEligible(once.ledger, catalog, LATER);
    expect(again.awarded).toEqual([]);
    expect(again.ledger.grants.a!.awardedAt).toBe(NOW);
    expect(awardDirect(once.ledger, 'a', LATER)).toBe(once.ledger);
  });

  it('keeps a claimed reward claimed, with its first timestamp', () => {
    const awarded = awardEligible(bump(emptyLedger, 'wins', 2), catalog, NOW);
    const claimed = claim(awarded.ledger, 'a', LATER);
    expect(claimed.grants.a).toMatchObject({
      status: 'claimed',
      claimedAt: LATER,
    });
    expect(claim(claimed, 'a', '2027-01-01T00:00:00Z')).toBe(claimed);
    // More wins and a re-evaluation change nothing about it.
    const more = awardEligible(bump(claimed, 'wins', 10), catalog, NOW);
    expect(more.ledger.grants.a).toEqual(claimed.grants.a);
  });

  it('cannot claim a reward that was never awarded', () => {
    expect(claim(emptyLedger, 'a', NOW)).toBe(emptyLedger);
  });

  it('chains a reward that depends on another being claimed', () => {
    let ledger = awardEligible(
      bump(emptyLedger, 'wins', 2),
      catalog,
      NOW,
    ).ledger;
    expect(ledger.grants.b).toBeUndefined();
    ledger = claim(ledger, 'a', LATER);
    const result = awardEligible(ledger, catalog, LATER);
    expect(result.awarded.map((r) => r.id)).toEqual(['b']);
  });

  it('ignores bumps that are zero, negative or not finite', () => {
    expect(bump(emptyLedger, 'x', 0)).toBe(emptyLedger);
    expect(bump(emptyLedger, 'x', -3)).toBe(emptyLedger);
    expect(bump(emptyLedger, 'x', Number.NaN)).toBe(emptyLedger);
  });

  it('lists locked, unclaimed and claimed views, and the reveal queue', () => {
    let ledger = awardEligible(
      bump(emptyLedger, 'wins', 2),
      catalog,
      NOW,
    ).ledger;
    expect(rewardViews(ledger, catalog).map((v) => v.status)).toEqual([
      'unclaimed',
      'locked',
    ]);
    expect(unclaimed(ledger, catalog).map((r) => r.id)).toEqual(['a']);
    ledger = claim(ledger, 'a', LATER);
    expect(unclaimed(ledger, catalog)).toEqual([]);
    expect(rewardViews(ledger, catalog)[0]).toMatchObject({
      status: 'claimed',
      claimedAt: LATER,
    });
  });
});

describe('ledger persistence', () => {
  const ids = new Set(['a', 'b']);
  const sample = claim(
    awardEligible(bump(emptyLedger, 'wins', 2), catalog, NOW).ledger,
    'a',
    LATER,
  );

  it('round-trips', () => {
    expect(parseLedger(serialiseLedger(sample), ids)).toEqual(sample);
  });

  it('degrades to an empty ledger for missing, corrupt or foreign data', () => {
    for (const raw of [
      null,
      '',
      '{nope',
      '[]',
      '"x"',
      '{"version":99}',
      '{"version":0}',
      '{"version":"1"}',
    ]) {
      expect(parseLedger(raw, ids)).toEqual(emptyLedger);
    }
  });

  it('drops malformed grants and unknown rewards, and bad counters', () => {
    const parsed = parseLedger(
      JSON.stringify({
        version: PRIZE_SCHEMA_VERSION,
        counters: { wins: 3.7, bad: -1, worse: 'x' },
        grants: {
          a: { awardedAt: NOW, status: 'claimed', claimedAt: LATER },
          b: { awardedAt: 'never', status: 'claimed' },
          ghost: { awardedAt: NOW, status: 'unclaimed' },
        },
      }),
      ids,
    );
    expect(parsed.counters).toEqual({ wins: 3 });
    expect(Object.keys(parsed.grants)).toEqual(['a']);
  });

  it('reads a claim with no timestamp as unclaimed rather than trusting it', () => {
    const parsed = parseLedger(
      JSON.stringify({
        version: 1,
        counters: {},
        grants: { a: { awardedAt: NOW, status: 'claimed' } },
      }),
    );
    expect(parsed.grants.a!.status).toBe('unclaimed');
  });

  it('migrates old versions one step at a time and refuses newer ones', () => {
    const steps = {
      1: (d: Record<string, unknown>) => ({ ...d, counters: { migrated: 1 } }),
      2: (d: Record<string, unknown>) => ({ ...d, extra: true }),
    };
    const out = migrate({ version: 1, counters: {} }, 3, steps);
    expect(out).toMatchObject({
      version: 3,
      counters: { migrated: 1 },
      extra: true,
    });
    expect(migrate({ version: 4 }, 3, steps)).toBeNull();
    expect(migrate({ version: 1 }, 3, { 1: steps[1] })).toBeNull();
    expect(migrate({}, 1, MIGRATIONS)).toBeNull();
  });
});

describe('gift vault contract', () => {
  it('exposes only claimed vault codes, and matches typed codes', () => {
    const storage = memoryPrizeStorage(
      awardEligible(bump(emptyLedger, 'wins', 2), catalog, NOW).ledger,
    );
    const reader = createPrizeReader(storage, catalog);
    expect(reader.vaultGrants()).toEqual([]);
    storage.save(claim(storage.load(), 'a', LATER));
    storage.save(
      claim(awardEligible(storage.load(), catalog, LATER).ledger, 'b', LATER),
    );
    expect(reader.vaultGrants()).toEqual([
      {
        rewardId: 'b',
        vaultId: 'v1',
        unlockCode: 'X',
        source: 'roulette',
        claimedAt: LATER,
      },
    ]);
    expect(reader.isVaultUnlocked('v1')).toBe(true);
    expect(reader.isVaultUnlocked('v2')).toBe(false);
    expect(reader.matchCode('v1', ' x ')).toBe(true);
    expect(reader.matchCode('v1', 'nope')).toBe(false);
    expect(reader.claimed('vault-code')).toHaveLength(1);
  });
});
