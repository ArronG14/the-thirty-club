import { afterEach, describe, expect, it } from 'vitest';
import { findPrivilege, PRIVILEGES } from './catalogue';
import { checkRedemption, cleanNote, NOTE_MAX } from './contract';
import {
  credentialUrl,
  destinationFor,
  isPlausibleToken,
  normaliseCode,
} from './credentials';
import { loungePhase, nextChange, privilegeViews } from './lounge';
import { composeMessage, findMessage, MESSAGES } from './messages';
import { effectiveSchedule, parseOverrides } from './schedule';
import { decodeSessionClaims, encodeClaims, hasScope } from './session';
import {
  boardTime,
  clockTime,
  countdown,
  describeCountdown,
  describeInstant,
  greetingIn,
  instantOf,
  JAMAICA_ZONE,
  UK_ZONE,
} from './time';

const OPENS = Date.parse('2026-10-22T13:00:00Z');
const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe('explicit time zones', () => {
  it.each(['Europe/London', 'America/Jamaica', 'Asia/Tokyo', 'UTC'])(
    'places Thursday 14:00 UK at 13:00 UTC whatever the device zone (%s)',
    (zone) => {
      process.env.TZ = zone;
      expect(
        instantOf({ date: '2026-10-22', time: '14:00', zone: UK_ZONE }),
      ).toBe(OPENS);
      expect(effectiveSchedule().departureOpensAt).toBe(OPENS);
    },
  );

  it('respects British Summer Time and its end on 25 October', () => {
    // BST (UTC+1) on the 22nd; GMT (UTC+0) from the 25th.
    expect(
      instantOf({ date: '2026-10-22', time: '12:00', zone: UK_ZONE }),
    ).toBe(Date.parse('2026-10-22T11:00:00Z'));
    expect(
      instantOf({ date: '2026-10-26', time: '12:00', zone: UK_ZONE }),
    ).toBe(Date.parse('2026-10-26T12:00:00Z'));
  });

  it('keeps Jamaica at UTC−5 (no daylight saving)', () => {
    expect(
      instantOf({ date: '2026-10-23', time: '09:00', zone: JAMAICA_ZONE }),
    ).toBe(Date.parse('2026-10-23T14:00:00Z'));
  });

  it('describes instants in the zone that matters, not the device zone', () => {
    process.env.TZ = 'America/Jamaica';
    expect(describeInstant(OPENS, UK_ZONE)).toBe(
      'Thursday 22 October, 2 pm UK time',
    );
    expect(clockTime(OPENS, JAMAICA_ZONE)).toBe('8 am');
    expect(boardTime(OPENS, UK_ZONE)).toBe('THU 14:00');
    expect(greetingIn(OPENS, UK_ZONE)).toBe('Good afternoon');
    expect(greetingIn(OPENS, JAMAICA_ZONE)).toBe('Good morning');
  });

  it('counts down in whole minutes, rounding up', () => {
    expect(countdown(OPENS - 61_000, OPENS)).toEqual({
      days: 0,
      hours: 0,
      minutes: 2,
    });
    expect(describeCountdown(OPENS - (3 * 1440 + 125) * 60_000, OPENS)).toBe(
      '3 days, 2 hours',
    );
    expect(describeCountdown(OPENS - 30_000, OPENS)).toBe('under a minute');
    expect(describeCountdown(OPENS + 1, OPENS)).toBe('now');
  });
});

describe('the effective schedule', () => {
  it('uses catalogue defaults', () => {
    const schedule = effectiveSchedule();
    expect(schedule.privileges['duty-free']).toBe(OPENS);
    expect(schedule.privileges['in-flight']).toBe(
      Date.parse('2026-10-22T17:30:00Z'),
    );
    expect(schedule.privileges['jamaica-arrival']).toBe(
      Date.parse('2026-10-23T14:00:00Z'),
    );
    expect(schedule.messages['departure-ready']).toBe(OPENS);
    expect(schedule.messages['in-flight']).toBe(
      schedule.privileges['in-flight'],
    );
    expect(schedule.messages.invitation).toBeNull();
    expect(schedule.messages['membership-ceremony']).toBeNull();
  });

  it('lets the environment, then the owner, move a release', () => {
    const env = { PRIVILEGE_IN_FLIGHT_OPENS_AT: '2026-10-22T19:00:00Z' };
    expect(effectiveSchedule({}, env).privileges['in-flight']).toBe(
      Date.parse('2026-10-22T19:00:00Z'),
    );
    const owner = { privileges: { 'in-flight': '2026-10-22T20:15:00Z' } };
    const both = effectiveSchedule(owner, env);
    expect(both.privileges['in-flight']).toBe(
      Date.parse('2026-10-22T20:15:00Z'),
    );
    // The in-flight message follows its privilege.
    expect(both.messages['in-flight']).toBe(Date.parse('2026-10-22T20:15:00Z'));
  });

  it('never releases a privilege before the lounge opens', () => {
    const early = effectiveSchedule({
      privileges: { 'in-flight': '2026-10-01T00:00:00Z' },
    });
    expect(early.privileges['in-flight']).toBe(OPENS);
  });

  it('can disable or move an automatic message', () => {
    const schedule = effectiveSchedule({
      messages: {
        'departure-ready': { disabled: true },
        'jamaica-welcome': { sendAt: '2026-10-23T15:30:00Z' },
      },
    });
    expect(schedule.messages['departure-ready']).toBeNull();
    expect(schedule.messages['jamaica-welcome']).toBe(
      Date.parse('2026-10-23T15:30:00Z'),
    );
  });

  it('drops invalid stored overrides field by field', () => {
    expect(
      parseOverrides({
        privileges: {
          'in-flight': 'not a date',
          yacht: '2026-10-22T19:00:00Z',
        },
        messages: { 'in-flight': { sendAt: 3, disabled: 'yes' } },
      }),
    ).toEqual({ privileges: {}, messages: { 'in-flight': {} } });
    expect(parseOverrides(null)).toEqual({});
  });
});

describe('credentials', () => {
  it('normalises manual codes forgivingly', () => {
    expect(normaliseCode(' tc-3010 2410 ')).toBe('TC30102410');
    expect(normaliseCode('brass·2210')).toBe('BRASS2210');
  });

  it('accepts only URL-safe, dot-free tokens', () => {
    expect(isPlausibleToken('departure-test-token-0001')).toBe(true);
    expect(isPlausibleToken('short')).toBe(false);
    expect(isPlausibleToken('has.dot.inside-it')).toBe(false);
    expect(isPlausibleToken('../../etc/passwd')).toBe(false);
  });

  it('builds the NFC link and the destination', () => {
    expect(credentialUrl('https://club.example/', 'abc123def456')).toBe(
      'https://club.example/c/abc123def456',
    );
    expect(destinationFor('departure')).toBe('/departure');
    expect(destinationFor('membership')).toBe('/');
  });
});

describe('session claims', () => {
  it('decodes claims without trusting unknown scopes', () => {
    const token = `${encodeClaims({ v: 1, realm: 'live', scopes: ['departure'], iat: 1 })}.sig`;
    expect(decodeSessionClaims(token)?.scopes).toEqual(['departure']);
    const odd = `${btoa(JSON.stringify({ v: 1, realm: 'live', scopes: ['owner', 'membership'], iat: 1 }))}.x`;
    expect(decodeSessionClaims(odd)?.scopes).toEqual(['membership']);
    expect(hasScope(decodeSessionClaims(odd), 'membership')).toBe(true);
  });

  it('rejects malformed tokens and ignores offsets outside rehearsal', () => {
    expect(decodeSessionClaims('')).toBeNull();
    expect(decodeSessionClaims('%%%.x')).toBeNull();
    const live = `${btoa(JSON.stringify({ v: 1, realm: 'live', scopes: [], iat: 1, offsetMs: 5 }))}.x`;
    expect(decodeSessionClaims(live)?.offsetMs).toBeUndefined();
    const rehearsal = `${btoa(JSON.stringify({ v: 1, realm: 'rehearsal', scopes: [], iat: 1, offsetMs: 5 }))}.x`;
    expect(decodeSessionClaims(rehearsal)?.offsetMs).toBe(5);
  });
});

describe('redemption input', () => {
  it('cleans notes', () => {
    expect(cleanNote('  a\nb\u0007  c ')).toBe('a b c');
    expect(cleanNote('   ')).toBeUndefined();
    expect(cleanNote(42)).toBeUndefined();
    expect(cleanNote('x'.repeat(400))?.length).toBe(NOTE_MAX);
  });

  it('requires a valid choice where offered, and none elsewhere', () => {
    expect(checkRedemption({ privilegeId: 'in-flight' }).ok).toBe(false);
    expect(
      checkRedemption({ privilegeId: 'in-flight', choice: 'gin' }).ok,
    ).toBe(false);
    expect(
      checkRedemption({ privilegeId: 'in-flight', choice: 'wine' }),
    ).toMatchObject({
      ok: true,
      choice: 'wine',
    });
    expect(
      checkRedemption({ privilegeId: 'duty-free', choice: 'wine' }).ok,
    ).toBe(false);
    expect(checkRedemption({ privilegeId: 'jamaica-arrival' }).ok).toBe(false);
  });
});

describe('the catalogue and its notifications', () => {
  it('writes Arron the agreed notifications', () => {
    const dutyFree = findPrivilege('duty-free');
    const inFlight = findPrivilege('in-flight');
    if (dutyFree.kind !== 'request' || inFlight.kind !== 'request')
      throw new Error();
    expect(dutyFree.notify({ note: 'Chanel' })).toEqual({
      title: 'THE THIRTY CLUB — CONCIERGE REQUEST',
      lines: [
        'Alise has redeemed her Duty-Free Indulgence.',
        'Please accompany her to the boutique of her choosing and arrange her purchase.',
        'Her selection: “Chanel”',
      ],
    });
    expect(inFlight.notify({ choice: 'Wine' }).lines).toEqual([
      'Alise has requested her in-flight refreshment.',
      'Selection: Wine',
      'Please ensure Madam is suitably refreshed.',
    ]);
  });

  it('has unique ids and explicit zones everywhere', () => {
    const ids = PRIVILEGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const privilege of PRIVILEGES) {
      expect([UK_ZONE, JAMAICA_ZONE]).toContain(privilege.opensAt.zone);
    }
  });

  it('composes every message with its link', () => {
    for (const message of MESSAGES) {
      const text = composeMessage(message, 'https://club.example/');
      expect(text.startsWith('THE THIRTY CLUB')).toBe(true);
      expect(text.endsWith(`https://club.example${message.path}`)).toBe(true);
    }
    expect(
      composeMessage(findMessage('departure-ready'), 'https://x.example'),
    ).toContain('Your Departure Lounge is now ready.');
  });
});

describe('what the lounge shows', () => {
  const base = { state: null, hasDeparture: true, opened: [], pending: {} };

  it('moves from closed to credential to open', () => {
    expect(loungePhase({ ...base, now: OPENS - 1 })).toBe('closed');
    expect(loungePhase({ ...base, now: OPENS, hasDeparture: false })).toBe(
      'credential',
    );
    expect(loungePhase({ ...base, now: OPENS })).toBe('open');
  });

  it('derives each privilege status', () => {
    const at = (now: number, extra = {}) =>
      Object.fromEntries(
        privilegeViews({ ...base, now, ...extra }).map((v) => [
          v.privilege.id,
          v.status,
        ]),
      );
    expect(at(OPENS)).toEqual({
      'duty-free': 'sealed',
      'in-flight': 'locked',
      'jamaica-arrival': 'locked',
    });
    expect(at(OPENS, { opened: ['duty-free'] })['duty-free']).toBe('open');
    expect(
      at(OPENS, { pending: { 'duty-free': { idempotencyKey: 'k' } } })[
        'duty-free'
      ],
    ).toBe('pending');
  });

  it('knows when the screen next changes by itself', () => {
    expect(nextChange({ ...base, now: OPENS - 10 })).toBe(OPENS);
    expect(nextChange({ ...base, now: OPENS })).toBe(
      Date.parse('2026-10-22T17:30:00Z'),
    );
    expect(
      nextChange({ ...base, now: Date.parse('2026-10-24T00:00:00Z') }),
    ).toBeNull();
  });
});
