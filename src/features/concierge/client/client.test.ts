import { afterEach, describe, expect, it } from 'vitest';
import { browserMembershipStorage } from '../../club/domain/membershipRecord';
import { createEntranceEnvironment } from '../../entrance/entranceEnvironment';
import { encodeClaims, type SessionClaims } from '../domain/session';
import {
  browserConciergeStorage,
  emptyConciergeRecord,
  parseConciergeRecord,
} from './localRecord';
import { hasMembership, recordMembership } from './membership';
import {
  matchesOfflineMembership,
  membershipDigest,
} from './offlineMembership';
import {
  activeSession,
  endRehearsal,
  isRehearsing,
  realmKey,
  saveSession,
  SESSION_KEYS,
} from './sessionStore';

const token = (claims: Omit<SessionClaims, 'v' | 'iat'>) =>
  `${encodeClaims({ v: 1, iat: 1, ...claims })}.signature`;

afterEach(() => localStorage.clear());

describe('device sessions', () => {
  it('keeps live and rehearsal sessions apart; a rehearsal takes precedence', () => {
    saveSession(token({ realm: 'live', scopes: ['departure'] }));
    expect(activeSession()?.claims.realm).toBe('live');
    expect(isRehearsing()).toBe(false);
    saveSession(token({ realm: 'rehearsal', scopes: [], offsetMs: 1000 }));
    expect(activeSession()?.claims.realm).toBe('rehearsal');
    expect(realmKey('concierge')).toBe('thirty-club:rehearsal:concierge');
    endRehearsal();
    expect(activeSession()?.claims).toMatchObject({
      realm: 'live',
      scopes: ['departure'],
    });
    expect(realmKey('concierge')).toBe('thirty-club:concierge');
  });

  it('ending a rehearsal removes only what the rehearsal wrote', () => {
    localStorage.setItem('thirty-club:entrance', 'live entrance');
    saveSession(token({ realm: 'rehearsal', scopes: [] }));
    localStorage.setItem(
      'thirty-club:rehearsal:entrance',
      'rehearsal entrance',
    );
    endRehearsal();
    expect(localStorage.getItem('thirty-club:entrance')).toBe('live entrance');
    expect(localStorage.getItem('thirty-club:rehearsal:entrance')).toBeNull();
    expect(localStorage.getItem(SESSION_KEYS.rehearsal)).toBeNull();
  });

  it('ignores a corrupt stored session', () => {
    localStorage.setItem(SESSION_KEYS.live, 'garbage');
    expect(activeSession()).toBeNull();
  });
});

describe('the rehearsal entrance (owner-mode isolation)', () => {
  it('runs at the rehearsal moment and writes to separate records', () => {
    const offset = 3 * 24 * 3_600_000;
    saveSession(
      token({ realm: 'rehearsal', scopes: ['membership'], offsetMs: offset }),
    );
    const env = createEntranceEnvironment();
    expect(env.clock.now() - Date.now()).toBeGreaterThan(offset - 1000);
    expect(env.card.isPresented()).toBe(true);
    env.membership.save({ inductedAt: '2026-10-24T05:00:00.000Z', rooms: {} });
    expect(
      localStorage.getItem('thirty-club:rehearsal:membership'),
    ).not.toBeNull();
    expect(browserMembershipStorage().load().inductedAt).toBeNull();
    endRehearsal();
    const live = createEntranceEnvironment();
    expect(Math.abs(live.clock.now() - Date.now())).toBeLessThan(1000);
    expect(live.card.isPresented()).toBe(false);
  });
});

describe('membership on this device', () => {
  it('comes from a session scope or a recorded recognition', () => {
    expect(hasMembership()).toBe(false);
    saveSession(token({ realm: 'live', scopes: ['departure'] }));
    expect(hasMembership()).toBe(false);
    recordMembership('2026-10-24T13:00:00.000Z');
    expect(hasMembership()).toBe(true);
    localStorage.clear();
    saveSession(token({ realm: 'live', scopes: ['membership'] }));
    expect(hasMembership()).toBe(true);
  });
});

describe('the local concierge record', () => {
  it('survives a round trip and degrades corrupt data to empty', () => {
    const storage = browserConciergeStorage();
    storage.save({
      ...emptyConciergeRecord,
      opened: ['duty-free'],
      pending: {
        'in-flight': {
          idempotencyKey: 'abc12345',
          choice: 'wine',
          createdAt: '2026-10-22T18:00:00.000Z',
        },
      },
      boardedAt: '2026-10-22T13:06:00.000Z',
    });
    expect(storage.load()).toMatchObject({
      opened: ['duty-free'],
      pending: { 'in-flight': { choice: 'wine' } },
    });
    expect(parseConciergeRecord('{oops')).toEqual(emptyConciergeRecord);
    expect(parseConciergeRecord(JSON.stringify({ version: 99 }))).toEqual(
      emptyConciergeRecord,
    );
    expect(
      parseConciergeRecord(
        JSON.stringify({
          version: 1,
          opened: ['yacht', 'duty-free'],
          pending: { yacht: {} },
        }),
      ),
    ).toMatchObject({ opened: ['duty-free'], pending: {} });
  });
});

describe('offline membership recognition', () => {
  it('matches only the configured digest, and is off when unconfigured', async () => {
    const digest = await membershipDigest('code', 'TC-3010-2410');
    const digests = { code: digest, token: undefined };
    expect(
      await matchesOfflineMembership('tc 3010 2410', 'code', digests),
    ).toBe(true);
    expect(
      await matchesOfflineMembership('TC-0000-0000', 'code', digests),
    ).toBe(false);
    expect(await matchesOfflineMembership('anything', 'token', digests)).toBe(
      false,
    );
    expect(
      await matchesOfflineMembership('TC-3010-2410', 'code', {
        code: undefined,
        token: undefined,
      }),
    ).toBe(false);
  });
});
