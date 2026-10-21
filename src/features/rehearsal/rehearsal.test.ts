import { createHash as nodeHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isLiveOwnerPath, isTestCentrePath, worldFor } from './mode';
import { createHash, sha256 } from './sim/nodeCrypto';
import { rewriteClock } from './sim/v1';
import { mentionedRooms } from '../correspondence/domain/roomMentions';
import { stepLetters } from '../concierge/client/stepLetters';
import { nextEvent, SCENARIOS, TIMELINE, BIRTHDAY } from './engine';

describe('documents belong to one world (ADR-018)', () => {
  it('keeps LIVE owner paths real, even in a Dev Mode tab', () => {
    for (const path of [
      '/owner',
      '/owner/vault-preview/x',
      '/concierge/owner',
      '/concierge/owner/',
    ]) {
      expect(isLiveOwnerPath(path)).toBe(true);
      expect(worldFor(path, true)).toBe('live');
    }
  });
  it('simulates the TEST centre always, and member pages only in Dev Mode', () => {
    expect(isTestCentrePath('/concierge/owner/test')).toBe(true);
    expect(isLiveOwnerPath('/concierge/owner/test')).toBe(false);
    expect(worldFor('/concierge/owner/test', false)).toBe('rehearsal');
    expect(worldFor('/', false)).toBe('live');
    expect(worldFor('/', true)).toBe('rehearsal');
    expect(worldFor('/rooms/casino', true)).toBe('rehearsal');
  });
});

describe('the rehearsal crypto stand-in', () => {
  it('hashes exactly as node:crypto does', () => {
    for (const text of ['', 'abc', 'x'.repeat(1000), 'K7QM-3XRA-WP4N', '✉️ é'])
      expect(createHash('sha256').update(text).digest('hex')).toBe(
        nodeHash('sha256').update(text).digest('hex'),
      );
    expect(sha256(new Uint8Array(64)).length).toBe(32);
  });
});

describe('the simulated database clock', () => {
  it('rewrites every now() in the migrations, and nothing else', () => {
    expect(
      rewriteClock(
        "select now(), pg_catalog.now(), x.now(), snow() from t where at < now() + interval '1 hour'",
      ),
    ).toBe(
      "select public.ttc_sim_now(), pg_catalog.now(), x.now(), snow() from t where at < public.ttc_sim_now() + interval '1 hour'",
    );
  });
});

describe('room mentions in letters', () => {
  it('finds the rooms a letter names', () => {
    expect(
      mentionedRooms('Do look in at the Grand Casino this afternoon.'),
    ).toEqual(['casino']);
    expect(mentionedRooms('Your Departure Lounge and the Gift Vault')).toEqual([
      'gift-vault',
      'departure-lounge',
    ]);
    expect(mentionedRooms('Nothing to see here.')).toEqual([]);
  });
});

describe('concierge letters on the step', () => {
  it('delivers the Departure letter at Thursday 14:00 UK, newest first', () => {
    expect(
      stepLetters(Date.parse('2026-10-21T12:00:00Z')).map((l) => l.id),
    ).toEqual(['phase-one']);
    expect(
      stepLetters(Date.parse('2026-10-22T13:00:00Z')).map((l) => l.id),
    ).toEqual(['departure-ready', 'phase-one']);
  });
});

describe('the rehearsal timeline', () => {
  it('is ordered and the presets exist in the requested order', () => {
    const times = TIMELINE.map((e) => e.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'early-admission-teaser',
      'early-admission-awaiting-card',
      'early-admission-card-scan',
      'early-admission-doors',
      'early-admission-late',
      'before-departure',
      'departure-opening',
      'casino-opening',
      'birthday-eve',
      'just-entered',
      'casino-jackpot',
      'vault-unlock',
      'all-open',
    ]);
    expect(nextEvent(BIRTHDAY - 60_000)?.id).toBe('birthday-midnight');
    expect(BIRTHDAY).toBe(Date.parse('2026-10-24T05:00:00Z'));
  });
});
