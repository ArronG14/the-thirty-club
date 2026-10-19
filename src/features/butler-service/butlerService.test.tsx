import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUTLER_LINES,
  lineAt,
  nextLine,
  type ButlerMoment,
} from './domain/dialogue';
import {
  clearRehearsal,
  rehearsalCounts,
  rehearsalDesk,
  rehearseLetters,
  REHEARSAL_KEY,
} from './client/desk';
import { OWNER_PREFIX } from '../owner/session';
import { cancellable, retryable, smsStage } from '../butlers-office/serviceApi';

describe('the Butler’s repertoire', () => {
  const moments = Object.keys(BUTLER_LINES) as ButlerMoment[];

  it('has at least five distinct, addressed lines for every recurring moment', () => {
    expect(moments.sort()).toEqual(
      [
        'correspondence',
        'departure',
        'request-received',
        'ring',
        'thanks',
        'unread-greeting',
      ].sort(),
    );
    for (const moment of moments) {
      const lines = BUTLER_LINES[moment];
      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(new Set(lines).size).toBe(lines.length);
      for (const line of lines) expect(line).not.toMatch(/Mrs|Khera/);
    }
  });

  it('never says the same line twice in a row', () => {
    for (const moment of moments) {
      let last = '';
      // A worst case: the random source always lands on the same index.
      for (let n = 0; n < 20; n++) {
        const line = nextLine(moment, () => 0);
        expect(line).not.toBe(last);
        last = line;
      }
    }
  });

  it('never claims a request has been fulfilled', () => {
    for (const line of BUTLER_LINES['request-received'])
      expect(line).not.toMatch(
        /\b(done|arranged|fulfilled|taken care of|on its way to you)\b/i,
      );
  });

  it('greets as the brief asks, and thanks as the brief asks', () => {
    expect(lineAt('unread-greeting', 0)).toBe(
      'Ah, welcome back, Madam. I do hope I am not interrupting, but a little correspondence has arrived in your absence.',
    );
    expect(lineAt('thanks', 0)).toBe(
      'You are most gracious, Madam. Though I must insist, the pleasure is entirely mine.',
    );
    expect(lineAt('departure', 0)).toMatch(/Shall I escort you\?$/);
  });
});

describe('Dev Mode rehearsal desk', () => {
  afterEach(() => {
    clearRehearsal();
    vi.restoreAllMocks();
  });

  it('keeps simulated letters in owner session storage and never calls the network', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    rehearseLetters(3);
    expect(REHEARSAL_KEY.startsWith(`${OWNER_PREFIX}thirty-club:`)).toBe(true);
    expect(sessionStorage.getItem(REHEARSAL_KEY)).toContain('Rehearsal');
    expect(localStorage.length).toBe(0);
    expect(rehearsalCounts()).toEqual({ letters: 3, unread: 3, requests: 0 });

    const listed = await rehearsalDesk.letters();
    if (!listed.ok) throw new Error('rehearsal list failed');
    const [newest] = listed.data.letters;
    // Newest first.
    expect(listed.data.letters.map((l) => l.deliveredAt)).toEqual(
      [...listed.data.letters.map((l) => l.deliveredAt)].sort().reverse(),
    );

    const opened = await rehearsalDesk.open(newest!.id);
    expect(opened.ok && opened.data.letter.openedAt).toBeTruthy();
    const thanked = await rehearsalDesk.thank(newest!.id);
    expect(thanked.ok && thanked.data.duplicate).toBe(false);
    const again = await rehearsalDesk.thank(newest!.id);
    expect(again.ok && again.data.duplicate).toBe(true);
    const asked = await rehearsalDesk.request('A cocktail, please.', 'k');
    expect(asked.ok && asked.data.request.body).toBe('A cocktail, please.');
    expect(rehearsalCounts()).toEqual({ letters: 3, unread: 2, requests: 1 });
    expect(network).not.toHaveBeenCalled();
    expect(await rehearsalDesk.standing()).toEqual({ kind: 'member' });
  });
});

describe('owner SMS states', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  it('distinguishes scheduled, queued, sent, delivered, failed and uncertain', () => {
    const at = (state: string, sendAt = '2026-10-20T11:00:00Z') =>
      smsStage({ state: state as never, sendAt }, now);
    expect(at('approved', '2026-10-20T15:00:00Z')).toBe('scheduled');
    expect(at('approved')).toBe('queued');
    expect(at('sending')).toBe('sending');
    expect(at('accepted')).toBe('sent');
    expect(at('delivered')).toBe('delivered');
    expect(at('failed')).toBe('failed');
    expect(at('uncertain')).toBe('uncertain');
    expect(at('cancelled')).toBe('cancelled');
  });
  it('offers cancel only before the worker claims it, and retry only after a definite failure', () => {
    expect(cancellable({ state: 'approved' })).toBe(true);
    expect(cancellable({ state: 'sending' })).toBe(false);
    expect(retryable({ state: 'failed' })).toBe(true);
    expect(retryable({ state: 'cancelled' })).toBe(true);
    expect(retryable({ state: 'uncertain' })).toBe(false);
    expect(retryable({ state: 'accepted' })).toBe(false);
  });
});
