// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  MemberVaultList,
  OwnerVault,
  OwnerVaultList,
  VaultInput,
  VaultOpenResult,
  VaultPreview,
} from '../../src/shared/concierge/types.ts';
import { CASINO_REWARD_IDS } from '../../src/features/casino/config/casinoRewards.ts';
import { signSession } from '../concierge/auth.ts';
import { createBackendApi } from './api.ts';
import { hashToken, newToken } from './auth.ts';
import { BackendError, rpcFor, type Database } from './database.ts';
import {
  CASINO_VAULT_RELEASES,
  newBackupCode,
  normaliseBackupCode,
} from './vault.ts';

const SECRET = 'vault-test-secret-vault-test-secret';
const BEFORE_BIRTHDAY = new Date('2026-10-23T12:00:00Z');
const BIRTHDAY = new Date('2026-10-24T15:00:00Z');
let pg: PGlite;
let member: string;
const ownerToken = newToken();
const memberToken = newToken();
const db: Database = {
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
      throw new BackendError(
        (error as Error).message as ConstructorParameters<
          typeof BackendError
        >[0],
      );
    }
  },
};
const api = createBackendApi({
  db,
  env: {
    CONCIERGE_SESSION_SECRET: SECRET,
    CONCIERGE_SITE_URL: 'https://30.ag14.co',
  },
});

type Role = 'owner' | 'member' | 'none';
async function request(
  path: string,
  body?: unknown,
  role: Role = 'member',
  method?: string,
  headers: Record<string, string> = {},
  ip = 'test-ip',
) {
  return api(
    new Request(`https://30.ag14.co/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
        origin: 'https://30.ag14.co',
        ...(role !== 'none'
          ? {
              cookie: `__Host-thirty-session=${role === 'owner' ? ownerToken : memberToken}`,
            }
          : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    ip,
  );
}
async function json<T>(response: Response | Promise<Response>): Promise<T> {
  return (await (await response).json()) as T;
}

const draft = (overrides: Partial<VaultInput> = {}): VaultInput => ({
  displayNumber: 1,
  clue: 'A place where dreams begin and mornings are reluctant to arrive.',
  giftLocation: 'Inside the black suitcase, beneath the folded clothes.',
  trigger: 'manual',
  availableAt: null,
  casinoRewardId: null,
  ...overrides,
});
async function create(overrides: Partial<VaultInput> = {}) {
  const response = await request('/owner/vaults', draft(overrides), 'owner');
  expect(response.status).toBe(201);
  return ((await response.json()) as { vault: OwnerVault }).vault;
}
const ready = (id: string) => request(`/owner/vaults/${id}/ready`, {}, 'owner');
const open = (body: unknown, role: Role = 'member', ip?: string) =>
  request('/vaults/open', body, role, undefined, {}, ip);
const memberList = () => json<MemberVaultList>(request('/vaults'));
const ownerList = () =>
  json<OwnerVaultList>(request('/owner/vaults', undefined, 'owner'));

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(
    'create role anon; create role authenticated; create role service_role bypassrls;',
  );
  for (const filename of readdirSync(resolve('supabase/migrations')).sort())
    await pg.exec(
      readFileSync(resolve('supabase/migrations', filename), 'utf8'),
    );
  // These tests exercise delivery; the communication hold (ADR-021) has
  // its own tests in hold.test.ts.
  await pg.exec(
    "update public.ttc_communication_hold set active = false, released_at = now(), release_note = 'test harness'; update public.ttc_sms_operations set mode = 'live', live_since = '2026-01-01T00:00:00Z'",
  );
  member = (
    await pg.query<{ id: string }>(
      "select id from public.ttc_members where slug='alise'",
    )
  ).rows[0]!.id;
}, 30000);
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BIRTHDAY);
  await pg.exec(
    'truncate public.ttc_vaults,public.ttc_sessions,public.ttc_rate_limits,public.ttc_activity_events cascade;',
  );
  await pg.query(
    "insert into public.ttc_sessions(token_hash,role,member_id,expires_at) values($1,'member',$2,now()+interval '1 day'),($3,'owner',null,now()+interval '1 day')",
    [hashToken(memberToken), member, hashToken(ownerToken)],
  );
});
afterAll(async () => {
  vi.useRealTimers();
  await pg?.close();
});

describe('vault state', () => {
  it('creates a LOCKED vault with unguessable credentials and a stable id', async () => {
    const vault = await create({ displayNumber: 3 });
    expect(vault.state).toBe('locked');
    expect(vault.slug).toBe('vault-003');
    expect(vault.nfcToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(vault.nfcUrl).toBe(`https://30.ag14.co/v/${vault.nfcToken}`);
    expect(vault.backupCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const other = await create({ displayNumber: 4 });
    expect(other.nfcToken).not.toBe(vault.nfcToken);
    expect(other.backupCode).not.toBe(vault.backupCode);
  });

  it('moves LOCKED → READY → OPENED and reveals the location only at the end', async () => {
    const vault = await create();
    let list = await memberList();
    expect(list.open).toBe(true);
    expect(list.vaults[0]).toMatchObject({
      id: 'vault-001',
      number: 1,
      state: 'locked',
      clue: null,
      giftLocation: null,
    });
    expect((await ready(vault.id)).status).toBe(200);
    list = await memberList();
    expect(list.vaults[0]!.state).toBe('ready');
    expect(list.vaults[0]!.clue).toContain('dreams begin');
    expect(list.vaults[0]!.giftLocation).toBeNull();

    const response = await open({ credential: vault.nfcToken });
    expect(response.status).toBe(200);
    const result = (await response.json()) as VaultOpenResult;
    expect(result.alreadyOpened).toBe(false);
    expect(result.vault.state).toBe('opened');
    expect(result.vault.giftLocation).toBe(
      'Inside the black suitcase, beneath the folded clothes.',
    );
    list = await memberList();
    expect(list.vaults[0]!.giftLocation).toContain('black suitcase');
    const owner = (await ownerList()).vaults[0]!;
    expect(owner.openedVia).toBe('nfc');
    expect(owner.openedAt).not.toBeNull();
  });

  it('refuses to open a LOCKED vault, even with its genuine credential', async () => {
    const vault = await create();
    const response = await open({ credential: vault.nfcToken });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('vault-locked');
    expect((await ownerList()).vaults[0]!.state).toBe('locked');
  });

  it('keeps an OPENED vault opened and answers repeat scans idempotently', async () => {
    const vault = await create();
    await ready(vault.id);
    await open({ credential: vault.nfcToken });
    const again = await json<VaultOpenResult>(
      open({ credential: vault.nfcToken }),
    );
    expect(again.alreadyOpened).toBe(true);
    expect(again.vault.state).toBe('opened');
    expect(again.vault.giftLocation).toContain('black suitcase');
    // The backup code also answers with the standing record.
    const byCode = await json<VaultOpenResult>(
      open({ code: vault.backupCode }),
    );
    expect(byCode.alreadyOpened).toBe(true);
    // Neither LOCK nor READY can undo an opening.
    expect(
      (await request(`/owner/vaults/${vault.id}/lock`, {}, 'owner')).status,
    ).toBe(409);
    await ready(vault.id);
    expect((await ownerList()).vaults[0]!.state).toBe('opened');
    const events = await pg.query<{ n: number }>(
      "select count(*)::int as n from public.ttc_activity_events where type='vault.opened'",
    );
    expect(events.rows[0]!.n).toBe(1);
  });

  it('opens once under concurrent scans', async () => {
    const vault = await create();
    await ready(vault.id);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => open({ credential: vault.nfcToken })),
    );
    const bodies = await Promise.all(
      results.map((r) => r.json() as Promise<VaultOpenResult>),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(bodies.filter((b) => !b.alreadyOpened)).toHaveLength(1);
    const events = await pg.query<{ n: number }>(
      "select count(*)::int as n from public.ttc_activity_events where type='vault.opened'",
    );
    expect(events.rows[0]!.n).toBe(1);
  });

  it('opens with the backup code in any case or spacing', async () => {
    const vault = await create();
    await ready(vault.id);
    const typed = vault.backupCode.toLowerCase().replace(/-/g, ' ');
    const result = await json<VaultOpenResult>(open({ code: typed }));
    expect(result.vault.state).toBe('opened');
    expect((await ownerList()).vaults[0]!.openedVia).toBe('code');
  });
});

describe('security', () => {
  it('rejects invalid, malformed and missing credentials understandably', async () => {
    const vault = await create();
    await ready(vault.id);
    for (const body of [
      { credential: newToken() },
      { credential: 'short' },
      { code: 'AAAA-BBBB-CCCC' },
      { code: '12' },
    ]) {
      const response = await open(body);
      expect(response.status).toBe(404);
      const error = (await response.json()) as {
        error: string;
        message: string;
      };
      expect(error.error).toBe('credential-invalid');
      expect(error.message).toBe('This key is not recognised by the vault.');
    }
    expect((await open({})).status).toBe(400);
    expect(
      (await open({ credential: vault.nfcToken, code: vault.backupCode }))
        .status,
    ).toBe(400);
    expect((await ownerList()).vaults[0]!.state).toBe('ready');
  });

  it('opens only the vault the credential belongs to', async () => {
    const first = await create({ displayNumber: 1 });
    const second = await create({ displayNumber: 2 });
    await ready(first.id);
    await ready(second.id);
    const result = await json<VaultOpenResult>(
      open({ credential: second.nfcToken }),
    );
    expect(result.vault.id).toBe('vault-002');
    const states = (await ownerList()).vaults.map((v) => v.state);
    expect(states).toEqual(['ready', 'opened']);
  });

  it('requires an authenticated member session; owner and anonymous cannot redeem', async () => {
    const vault = await create();
    await ready(vault.id);
    expect((await open({ credential: vault.nfcToken }, 'none')).status).toBe(
      401,
    );
    expect((await open({ credential: vault.nfcToken }, 'owner')).status).toBe(
      403,
    );
    expect((await request('/vaults', undefined, 'none')).status).toBe(401);
    // A ceremonial bearer token is not a session.
    const legacy = await signSession(
      { v: 1, realm: 'live', scopes: ['membership'], iat: Date.now() },
      SECRET,
    );
    expect(
      (
        await request(
          '/vaults/open',
          { credential: vault.nfcToken },
          'none',
          undefined,
          { authorization: `Bearer ${legacy}` },
        )
      ).status,
    ).toBe(401);
    expect((await ownerList()).vaults[0]!.state).toBe('ready');
  });

  it('cannot bypass the birthday time-lock with a genuine credential or code', async () => {
    const vault = await create();
    await ready(vault.id);
    vi.setSystemTime(BEFORE_BIRTHDAY);
    for (const body of [
      { credential: vault.nfcToken },
      { code: vault.backupCode },
    ]) {
      const response = await open(body);
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe('not-open');
    }
    const list = await memberList();
    expect(list.open).toBe(false);
    expect(list.vaults[0]).toMatchObject({ state: 'locked', clue: null });
    vi.setSystemTime(BIRTHDAY);
    expect((await open({ credential: vault.nfcToken })).status).toBe(200);
  });

  it('never exposes an unopened location, credential or code to the member', async () => {
    const vault = await create();
    await ready(vault.id);
    const raw = await (await request('/vaults')).text();
    expect(raw).not.toContain('black suitcase');
    expect(raw).not.toContain(vault.nfcToken);
    expect(raw).not.toContain(vault.backupCode);
    const locked = await (
      await open({ credential: (await create({ displayNumber: 2 })).nfcToken })
    ).text();
    expect(locked).not.toContain('black suitcase');
  });

  it('keeps owner configuration from members and anonymous visitors', async () => {
    const vault = await create();
    for (const role of ['member', 'none'] as const) {
      expect((await request('/owner/vaults', undefined, role)).status).toBe(
        role === 'none' ? 401 : 403,
      );
      expect((await request('/owner/vaults', draft(), role)).status).toBe(
        role === 'none' ? 401 : 403,
      );
      expect(
        (await request(`/owner/vaults/${vault.id}/ready`, {}, role)).status,
      ).toBe(role === 'none' ? 401 : 403);
      expect(
        (await request(`/owner/vaults/${vault.id}/preview`, undefined, role))
          .status,
      ).toBe(role === 'none' ? 401 : 403);
    }
    // The browser can never call the vault RPC as an owner directly.
    await expect(
      db.action(member, 'member', 'owner-vault-list'),
    ).rejects.toThrow('forbidden');
  });

  it('rate-limits repeated wrong guesses without punishing a genuine key', async () => {
    const vault = await create();
    await ready(vault.id);
    for (let i = 0; i < 20; i += 1)
      expect(
        (await open({ code: 'WRNG-WRNG-WRNG' }, 'member', 'guesser')).status,
      ).toBe(404);
    expect(
      (await open({ code: vault.backupCode }, 'member', 'guesser')).status,
    ).toBe(429);
    // Correct scans from another address are unaffected, and repeat
    // successful scans never count against anyone.
    for (let i = 0; i < 25; i += 1)
      expect(
        (await open({ credential: vault.nfcToken }, 'member', 'alise')).status,
      ).toBe(200);
  });

  it('rejects cross-site mutations', async () => {
    const vault = await create();
    await ready(vault.id);
    const response = await request(
      '/vaults/open',
      { credential: vault.nfcToken },
      'member',
      undefined,
      { origin: 'https://evil.example' },
    );
    expect(response.status).toBe(403);
  });
});

describe('membership bridge', () => {
  const bridge = (token: string | null) =>
    request(
      '/auth/member/concierge',
      {},
      'none',
      undefined,
      token ? { authorization: `Bearer ${token}` } : {},
    );

  it('exchanges a verified live membership session for an HttpOnly member cookie', async () => {
    const legacy = await signSession(
      { v: 1, realm: 'live', scopes: ['membership'], iat: Date.now() },
      SECRET,
    );
    const response = await bridge(legacy);
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly; SameSite=Strict');
    expect(cookie).toContain('Secure');
    const token = /__Host-thirty-session=([^;]+)/.exec(cookie)![1]!;
    const session = await request(
      '/auth/session',
      undefined,
      'none',
      undefined,
      { cookie: `__Host-thirty-session=${token}` },
    );
    expect((await session.json()).session.role).toBe('member');
  });

  it('refuses forged, rehearsal and scope-less sessions', async () => {
    const forged = await signSession(
      { v: 1, realm: 'live', scopes: ['membership'], iat: Date.now() },
      'some-other-secret-some-other-secret',
    );
    expect((await bridge(forged)).status).toBe(401);
    expect((await bridge(null)).status).toBe(401);
    const rehearsal = await signSession(
      { v: 1, realm: 'rehearsal', scopes: ['membership'], iat: Date.now() },
      SECRET,
    );
    expect((await bridge(rehearsal)).status).toBe(403);
    const display = await signSession(
      { v: 1, realm: 'live', scopes: ['display'], iat: Date.now() },
      SECRET,
    );
    expect((await bridge(display)).status).toBe(401);
  });
});

describe('owner functionality', () => {
  it('edits the clue, location, number and trigger, and changes persist', async () => {
    const vault = await create();
    const response = await request(
      `/owner/vaults/${vault.id}`,
      draft({
        displayNumber: 7,
        clue: 'Where the ocean is framed.',
        giftLocation: 'In the wardrobe, top shelf.',
      }),
      'owner',
      'PATCH',
    );
    expect(response.status).toBe(200);
    const saved = (await ownerList()).vaults[0]!;
    expect(saved).toMatchObject({
      number: 7,
      slug: 'vault-001',
      clue: 'Where the ocean is framed.',
      giftLocation: 'In the wardrobe, top shelf.',
      nfcToken: vault.nfcToken,
    });
  });

  it('corrects the location after opening without resetting the vault', async () => {
    const vault = await create();
    await ready(vault.id);
    await open({ credential: vault.nfcToken });
    await request(
      `/owner/vaults/${vault.id}`,
      draft({ giftLocation: 'Moved: inside the wardrobe, behind the robe.' }),
      'owner',
      'PATCH',
    );
    const seen = (await memberList()).vaults[0]!;
    expect(seen.state).toBe('opened');
    expect(seen.giftLocation).toBe(
      'Moved: inside the wardrobe, behind the robe.',
    );
  });

  it('validates owner input', async () => {
    for (const bad of [
      draft({ displayNumber: 0 }),
      draft({ displayNumber: 1000 }),
      draft({ trigger: 'scheduled', availableAt: null }),
      draft({ trigger: 'casino', casinoRewardId: null }),
      { ...draft(), giftName: 'never' },
      draft({ clue: 'x'.repeat(1001) }),
    ])
      expect((await request('/owner/vaults', bad, 'owner')).status).toBe(400);
    await create({ displayNumber: 5 });
    expect(
      (await request('/owner/vaults', draft({ displayNumber: 5 }), 'owner'))
        .status,
    ).toBe(409);
  });

  it('becomes READY on schedule (server clock, explicit instant)', async () => {
    // 18:00 in Jamaica on the birthday is 23:00 UTC.
    await create({
      trigger: 'scheduled',
      availableAt: '2026-10-24T18:00:00-05:00',
    });
    expect((await memberList()).vaults[0]!.state).toBe('locked');
    vi.setSystemTime(new Date('2026-10-24T22:59:00Z'));
    expect((await memberList()).vaults[0]!.state).toBe('locked');
    vi.setSystemTime(new Date('2026-10-24T23:00:01Z'));
    const seen = (await memberList()).vaults[0]!;
    expect(seen.state).toBe('ready');
    expect(seen.readyAt).toBe('2026-10-24T23:00:00+00:00');
  });

  it('can be made READY manually, locked again before opening, and unlocked by the owner', async () => {
    const vault = await create();
    expect(
      (await json<{ vault: OwnerVault }>(ready(vault.id))).vault.state,
    ).toBe('ready');
    const relocked = await json<{ vault: OwnerVault }>(
      request(`/owner/vaults/${vault.id}/lock`, {}, 'owner'),
    );
    expect(relocked.vault.state).toBe('locked');
    const opened = await json<{ vault: OwnerVault }>(
      request(`/owner/vaults/${vault.id}/open`, {}, 'owner'),
    );
    expect(opened.vault).toMatchObject({ state: 'opened', openedVia: 'owner' });
  });

  it('rotates a lost tag or code; the old one stops working', async () => {
    const vault = await create();
    await ready(vault.id);
    const rotated = await json<{ vault: OwnerVault }>(
      request(`/owner/vaults/${vault.id}/rotate-credential`, {}, 'owner'),
    );
    expect(rotated.vault.nfcToken).not.toBe(vault.nfcToken);
    expect(rotated.vault.backupCode).toBe(vault.backupCode);
    expect((await open({ credential: vault.nfcToken })).status).toBe(404);
    const recoded = await json<{ vault: OwnerVault }>(
      request(`/owner/vaults/${vault.id}/rotate-code`, {}, 'owner'),
    );
    expect(recoded.vault.backupCode).not.toBe(vault.backupCode);
    expect((await open({ code: vault.backupCode })).status).toBe(404);
    expect((await open({ credential: rotated.vault.nfcToken })).status).toBe(
      200,
    );
  });

  it('previews without changing anything, consuming nothing and recording nothing', async () => {
    const vault = await create();
    const before = await pg.query(
      'select * from public.ttc_vaults order by id',
    );
    const events = await pg.query('select * from public.ttc_activity_events');
    const preview = await json<VaultPreview>(
      request(`/owner/vaults/${vault.id}/preview`, undefined, 'owner'),
    );
    expect(preview.vault.state).toBe('locked');
    expect(preview.ready).toMatchObject({ state: 'ready', giftLocation: null });
    expect(preview.opened.giftLocation).toContain('black suitcase');
    const verified = await json<{ number: number; state: string }>(
      request('/owner/vaults/verify', { credential: vault.nfcToken }, 'owner'),
    );
    expect(verified).toMatchObject({ number: 1, state: 'locked' });
    expect(
      (await pg.query('select * from public.ttc_vaults order by id')).rows,
    ).toEqual(before.rows);
    expect(
      (await pg.query('select * from public.ttc_activity_events')).rows,
    ).toEqual(events.rows);
    // The credential still works for real afterwards.
    await ready(vault.id);
    expect((await open({ credential: vault.nfcToken })).status).toBe(200);
  });
});

describe('casino integration', () => {
  it('maps the server jackpot to the casino Vault Key reward id', () => {
    expect(CASINO_VAULT_RELEASES.jackpot).toBe(CASINO_REWARD_IDS.vaultKeyOne);
  });

  it('a released casino reward makes only its LOCKED compartments READY', async () => {
    const casino = await create({
      displayNumber: 1,
      trigger: 'casino',
      casinoRewardId: CASINO_REWARD_IDS.vaultKeyOne,
    });
    await create({ displayNumber: 2 });
    await create({
      displayNumber: 3,
      trigger: 'casino',
      casinoRewardId: 'casino.some-other-reward',
    });
    const released = await db.action<{ released: number }>(
      null,
      'system',
      'system-vault-casino',
      { rewardId: CASINO_REWARD_IDS.vaultKeyOne },
    );
    expect(released.released).toBe(1);
    const states = (await ownerList()).vaults.map((v) => v.state);
    expect(states).toEqual(['ready', 'locked', 'locked']);
    // Releasing again is harmless; an opened vault stays opened.
    await open({ credential: casino.nfcToken });
    await db.action(null, 'system', 'system-vault-casino', {
      rewardId: CASINO_REWARD_IDS.vaultKeyOne,
    });
    expect((await ownerList()).vaults[0]!.state).toBe('opened');
    // Members cannot trigger a release themselves.
    await expect(
      db.action(member, 'member', 'system-vault-casino', {
        rewardId: CASINO_REWARD_IDS.vaultKeyOne,
      }),
    ).rejects.toThrow('forbidden');
  });
});

describe('casino slots release', () => {
  it('a server-recorded jackpot releases the Vault Key compartment on the next play', async () => {
    await pg.exec('truncate public.ttc_slot_plays cascade');
    await create({
      trigger: 'casino',
      casinoRewardId: CASINO_REWARD_IDS.vaultKeyOne,
    });
    await pg.query(
      "insert into public.ttc_slot_plays(member_id,idempotency_key,result,created_at) values($1,'earlier-jackpot','{\"outcome\":\"jackpot\"}'::jsonb,now()-interval '1 hour')",
      [member],
    );
    vi.setSystemTime(new Date('2026-10-24T19:01:00Z'));
    const play = await request('/casino/slots/play', {
      idempotencyKey: 'vault-release-play',
    });
    expect(play.status).toBe(201);
    expect((await ownerList()).vaults[0]!.state).toBe('ready');
    await pg.exec('truncate public.ttc_slot_plays cascade');
  });
});

describe('backup codes', () => {
  it('generates unambiguous codes and normalises what people type', () => {
    for (let i = 0; i < 50; i += 1)
      expect(newBackupCode()).toMatch(
        /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/,
      );
    expect(normaliseBackupCode(' k7qm 3xra-wp4n ')).toBe('K7QM-3XRA-WP4N');
    expect(normaliseBackupCode('K7QM3XRA')).toBeNull();
    expect(normaliseBackupCode(42)).toBeNull();
  });
});
