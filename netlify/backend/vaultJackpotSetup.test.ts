// @vitest-environment node
/**
 * The owner's Gift Vault / jackpot / Nyla configuration, exactly as
 * docs/release/CONTROLLED_CONFIGURATION_2026-10-21.json and
 * docs/release/VAULT_JACKPOT_SETUP_2026-10-21.md describe it, sent through
 * the real owner HTTP routes (request validation included) into a
 * disposable PGlite database with every migration. All names, numbers and
 * wording below are SYNTHETIC placeholders; nothing here is a real gift
 * location or approved story copy.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STORY_COPY } from '../../src/shared/story/copy.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';

const MIGRATIONS = resolve('supabase/migrations');
const ENV = { SMS_SENDING_ENABLED: 'false' };
const ownerToken = newToken();
let pg: PGlite;
let db: Database;
const TABLES = [
  'ttc_letters',
  'ttc_messages',
  'ttc_casino_batches',
  'ttc_casino_spins',
  'ttc_reward_entitlements',
];
const counts = async () =>
  Object.fromEntries(
    await Promise.all(
      TABLES.map(async (t) => [
        t,
        (
          await pg.query<{ n: number }>(
            `select count(*)::int n from public.${t}`,
          )
        ).rows[0]!.n,
      ]),
    ),
  );
let baseline: Record<string, number> = {};

async function owner<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const response = await createBackendApi({ db, env: ENV })(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        origin: 'https://30.ag14.co',
        cookie: `__Host-thirty-session=${ownerToken}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    `ip-${Math.random()}`,
  );
  return { status: response.status, data: (await response.json()) as T };
}

interface VaultResult {
  vault: {
    id: string;
    state: string;
    trigger: string;
    casinoRewardId: string | null;
    nfcUrl?: string;
    backupCode?: string;
  };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'owner',null,now()+interval '30 days')",
    [hashToken(ownerToken)],
  );
  db = {
    async action<T>(
      actor: string | null,
      role: string,
      action: string,
      input = {},
    ) {
      try {
        const result = await pg.query<{ result: T }>(
          `select public.${rpcFor(action)}($1,$2,$3,$4::jsonb) as result`,
          [actor, role, action, JSON.stringify(input)],
        );
        return result.rows[0]!.result;
      } catch (error) {
        const message = (error as Error).message;
        throw new BackendError(
          /^[a-z-]+$/.test(message)
            ? (message as ConstructorParameters<typeof BackendError>[0])
            : 'server',
        );
      }
    },
  };
  baseline = await counts();
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('the controlled configuration, through the owner routes', () => {
  const ids: { ugg?: string; airpods?: string; breakfast?: string } = {};

  it('the story reveal copy fits the Vault desk field', () => {
    expect(STORY_COPY.uggReveal.length).toBeLessThanOrEqual(1000);
  });

  it('1. UGG and AirPods drawers: manual, no Casino link, early opening, then Ready', async () => {
    for (const [name, number] of [
      ['ugg', 811],
      ['airpods', 812],
    ] as const) {
      const made = await owner<VaultResult>('POST', '/owner/vaults', {
        displayNumber: number,
        clue: `SYNTHETIC non-spoiler clue ${name}`,
        giftLocation: `SYNTHETIC reveal ${name}`,
        trigger: 'manual',
        availableAt: null,
        casinoRewardId: null,
        opensAt: '2026-10-22T00:00:00Z',
      });
      expect(made.status).toBe(201);
      expect(made.data.vault.state).toBe('locked');
      expect(made.data.vault.trigger).toBe('manual');
      expect(made.data.vault.nfcUrl).toMatch(/^https:\/\/30\.ag14\.co\/v\//);
      expect(made.data.vault.backupCode).toBeTruthy();
      ids[name] = made.data.vault.id;
    }
    for (const id of [ids.ugg!, ids.airpods!]) {
      const ready = await owner<VaultResult>(
        'POST',
        `/owner/vaults/${id}/ready`,
        {},
      );
      expect(ready.status).toBe(200);
      expect(ready.data.vault.state).toBe('ready');
    }
  });

  it('2. breakfast drawer: casino trigger linked to casino.evening-jackpot, left LOCKED', async () => {
    const made = await owner<VaultResult>('POST', '/owner/vaults', {
      displayNumber: 813,
      clue: 'SYNTHETIC riddle-compatible clue',
      giftLocation: 'SYNTHETIC breakfast reveal',
      trigger: 'casino',
      availableAt: null,
      casinoRewardId: 'casino.evening-jackpot',
      opensAt: '2026-10-24T01:30:00Z',
    });
    expect(made.status).toBe(201);
    expect(made.data.vault.state).toBe('locked');
    expect(made.data.vault.casinoRewardId).toBe('casino.evening-jackpot');
    ids.breakfast = made.data.vault.id;
  });

  it('3. a Casino prize cannot point at a manual drawer (what a wrong ID looks like)', async () => {
    const wrong = await owner('POST', '/owner/casino/prizes', {
      slug: 'evening-jackpot',
      title: 'A Most Extraordinary Victory!',
      description: '777 Mystery Jackpot',
      presentation: STORY_COPY.jackpot,
      kind: 'VAULT_GIFT',
      active: true,
      vaultId: ids.ugg,
      imageUrl: null,
      instructions: '',
      validUntil: null,
      ownerNotes: 'SYNTHETIC',
    });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const none = await pg.query(
      "select 1 from public.ttc_prize_catalogue where slug = 'evening-jackpot'",
    );
    expect(none.rows).toHaveLength(0);
  });

  it('4. evening-jackpot: VAULT_GIFT linked to the breakfast drawer', async () => {
    const made = await owner<{ prize: { id: string } }>(
      'POST',
      '/owner/casino/prizes',
      {
        slug: 'evening-jackpot',
        title: 'A Most Extraordinary Victory!',
        description: '777 Mystery Jackpot',
        presentation: STORY_COPY.jackpot,
        kind: 'VAULT_GIFT',
        active: true,
        vaultId: ids.breakfast,
        imageUrl: null,
        instructions: '',
        validUntil: null,
        ownerNotes: 'SYNTHETIC',
      },
    );
    expect(made.status).toBe(201);
    const row = await pg.query<{
      vault_id: string;
      kind: string;
      active: boolean;
    }>(
      "select vault_id, kind, active from public.ttc_prize_catalogue where slug = 'evening-jackpot'",
    );
    expect(row.rows).toEqual([
      { vault_id: ids.breakfast, kind: 'VAULT_GIFT', active: true },
    ]);
  });

  it('5. Nyla: edit the existing prize in place, keep the catalogue, add only the reference', async () => {
    const list = await owner<{ prizes: Record<string, unknown>[] }>(
      'GET',
      '/owner/casino/prizes',
    );
    const nyla = list.data.prizes.find((p) => p.slug === 'nyla-film')!;
    expect(nyla.active).toBe(false);
    expect(nyla.videoUrl ?? null).toBeNull();
    const { id, ...fields } = nyla as { id: string } & Record<string, unknown>;
    const body = Object.fromEntries(
      Object.entries(fields).filter(([k]) =>
        [
          'title',
          'description',
          'presentation',
          'kind',
          'imageUrl',
          'instructions',
          'validUntil',
          'ownerNotes',
          'vaultId',
          'slug',
          'drinksKind',
          'drinksQuantity',
        ].includes(k),
      ),
    );
    const updated = await owner<{ prize: Record<string, unknown> }>(
      'PATCH',
      `/owner/casino/prizes/${id}`,
      { ...body, active: true, videoUrl: '/api/v1/media/nyla-film' },
    );
    expect(updated.status).toBe(200);
    const after = await pg.query<{
      video_url: string;
      active: boolean;
      title: string;
      presentation: string;
      kind: string;
    }>(
      "select video_url, active, title, presentation, kind from public.ttc_prize_catalogue where slug = 'nyla-film'",
    );
    expect(after.rows[0]).toMatchObject({
      video_url: '/api/v1/media/nyla-film',
      active: true,
      title: nyla.title,
      presentation: nyla.presentation,
      kind: 'VOUCHER',
    });
  });

  it('6. bind the UGG and AirPods chapters to their own drawers; nothing is approved or sent', async () => {
    for (const [key, id] of [
      ['departure-ugg', ids.ugg],
      ['departure-airpods', ids.airpods],
    ] as const) {
      const bound = await owner('PATCH', `/owner/journey/milestones/${key}`, {
        storyVaultId: id,
      });
      expect(bound.status).toBe(200);
    }
    const state = await pg.query<{
      key: string;
      state: string;
      story_approved: boolean;
      story_vault_id: string;
    }>(
      "select key, state, story_approved, story_vault_id from public.ttc_journey_milestones where key in ('departure-ugg','departure-airpods') order by key",
    );
    expect(state.rows.map((r) => [r.key, r.state, r.story_approved])).toEqual([
      ['departure-airpods', 'held', false],
      ['departure-ugg', 'held', false],
    ]);
    expect(state.rows.map((r) => r.story_vault_id)).toEqual([
      ids.airpods,
      ids.ugg,
    ]);
  });

  it('7. nothing reached Alise: no new letters, messages, spins, entitlements or batches', async () => {
    expect(await counts()).toEqual(baseline);
  });

  it('8. the schedule is untouched: three sessions of three, prize on spin 3, Jamaica time', async () => {
    const rows = await pg.query<{
      key: string;
      fire_at: Date;
      timezone: string;
      effects: { name?: string; params?: Record<string, unknown> }[];
    }>(
      "select key, fire_at, timezone, effects from public.ttc_journey_milestones where key in ('casino-opening-spins','casino-afternoon-spins','casino-evening-spins') order by fire_at",
    );
    expect(
      rows.rows.map((r) => {
        const issue = r.effects.find((e) => e.name === 'casino.spins.issue')!;
        return [
          r.key,
          r.fire_at.toISOString(),
          r.timezone,
          issue.params?.quantity,
          issue.params?.prizePositions,
          issue.params?.prizeSlugs,
        ];
      }),
    ).toEqual([
      [
        'casino-opening-spins',
        '2026-10-23T14:00:00.000Z',
        'America/Jamaica',
        3,
        [3],
        ['jamaica-drinks'],
      ],
      [
        'casino-afternoon-spins',
        '2026-10-23T19:30:00.000Z',
        'America/Jamaica',
        3,
        [3],
        ['nyla-film'],
      ],
      [
        'casino-evening-spins',
        '2026-10-24T01:30:00.000Z',
        'America/Jamaica',
        3,
        [3],
        ['evening-jackpot'],
      ],
    ]);
  });

  it('9. the read-only release gate agrees on drawers, jackpot link, Nyla and the nine spins', async () => {
    const sql = readFileSync(
      'docs/release/configuration-readiness.sql',
      'utf8',
    );
    const rows = (await pg.query<{ check_id: string; passed: boolean }>(sql))
      .rows;
    const passed = Object.fromEntries(rows.map((r) => [r.check_id, r.passed]));
    expect(passed.CFG01).toBe(true);
    expect(passed.CFG02).toBe(true);
    expect(passed.CFG03).toBe(true);
    expect(passed.CFG08).toBe(true);
    // Not this task: card message, scene approvals and SMS review.
    expect(passed.CFG04).toBe(false);
    expect(passed.CFG05).toBe(false);
  });
});
