/**
 * Codex P1-B (`f7eff13`): "Accept your membership" proceeded locally when
 * `/journey/enter` failed, and nothing reconciled it later, so membership
 * could stay on one device. The provider now keeps the acceptance until the
 * server records it, presenting the card this device holds when the server
 * has no session or has not seen the card. A fake `/api` stands in for the
 * server; the server-side rules are tested in netlify/backend.
 */
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeClaims } from '../concierge/domain/session';
import { SESSION_KEYS } from '../concierge/client/sessionStore';
import { JourneyProvider } from './JourneyProvider';
import { useJourney } from './journeyContext';

interface FakeClub {
  online: boolean;
  /** This browser has a member session cookie. */
  cookie: boolean;
  /** The server has recorded the card. */
  card: boolean;
  admitted: boolean;
  calls: string[];
}
let club: FakeClub;

const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input).replace(/^.*\/api\/v1/, '');
  const method = init?.method ?? 'GET';
  club.calls.push(`${method} ${path}`);
  if (!club.online) throw new TypeError('Load failed');
  const auth = new Headers(init?.headers).get('authorization') ?? '';
  if (path === '/auth/member/card') {
    if (!auth.startsWith('Bearer '))
      return reply(401, { error: 'unauthorised' });
    club.card = true;
    club.cookie = true;
    return reply(200, { session: { role: 'member' }, card: {} });
  }
  if (path === '/auth/member/concierge') {
    if (!auth.startsWith('Bearer '))
      return reply(401, { error: 'unauthorised' });
    club.cookie = true;
    return reply(200, { session: { role: 'member' } });
  }
  if (!club.cookie) return reply(401, { error: 'unauthorised' });
  if (path === '/auth/session')
    return reply(200, { session: { role: 'member' } });
  if (path === '/journey')
    return reply(200, {
      now: new Date().toISOString(),
      admissions: club.admitted
        ? [
            {
              roomId: 'lounge',
              state: 'admitted',
              invitedAt: null,
              admittedAt: new Date().toISOString(),
              letter: null,
            },
          ]
        : [],
    });
  if (path === '/journey/enter') {
    if (!club.card) return reply(403, { error: 'card-required' });
    const duplicate = club.admitted;
    club.admitted = true;
    return reply(duplicate ? 200 : 201, { duplicate });
  }
  return reply(404, { error: 'not-found' });
}

let accept: (() => Promise<void>) | null = null;
function Consumer() {
  const journey = useJourney()!;
  useEffect(() => {
    accept = journey.enter;
    journey.want();
  }, [journey]);
  return <p data-testid="lounge">{journey.stateOf('lounge')}</p>;
}

function holdCard() {
  const claims = encodeClaims({
    v: 1,
    realm: 'live',
    scopes: ['membership'],
    iat: Date.now(),
  });
  localStorage.setItem(SESSION_KEYS.live, `${claims}.signature`);
}

async function flush() {
  for (let i = 0; i < 8; i += 1)
    await act(async () => {
      await Promise.resolve();
    });
}

async function focusPage() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  club = {
    online: true,
    cookie: false,
    card: false,
    admitted: false,
    calls: [],
  };
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  accept = null;
});

describe('membership accepted before the server could record it (Codex P1-B)', () => {
  it('the exact order: accepted with no session, recorded once a session exists', async () => {
    const view = render(
      <JourneyProvider>
        <Consumer />
      </JourneyProvider>,
    );
    await flush();
    // No session and no card on this device: the server refuses.
    await act(async () => {
      await accept!();
    });
    expect(club.admitted).toBe(false);
    expect(localStorage.getItem('thirty-club:journey-enter-pending')).not.toBe(
      null,
    );
    // Later the member session arrives (the invitation link) and the server
    // has the card from the scan on her phone.
    club.cookie = true;
    club.card = true;
    await focusPage();
    expect(club.admitted).toBe(true);
    expect(view.getByTestId('lounge').textContent).toBe('admitted');
    expect(localStorage.getItem('thirty-club:journey-enter-pending')).toBe(
      null,
    );
  });

  it('offline at acceptance, then the card this device holds records it', async () => {
    holdCard();
    render(
      <JourneyProvider>
        <Consumer />
      </JourneyProvider>,
    );
    await flush();
    club.online = false;
    await act(async () => {
      await accept!();
    });
    expect(club.admitted).toBe(false);
    club.online = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(club.card).toBe(true);
    expect(club.admitted).toBe(true);
    expect(club.calls).toContain('POST /auth/member/card');
  });

  it('already admitted elsewhere: nothing is retried and nothing is doubled', async () => {
    club.cookie = true;
    club.card = true;
    club.admitted = true;
    localStorage.setItem('thirty-club:journey-enter-pending', 'x');
    const view = render(
      <JourneyProvider>
        <Consumer />
      </JourneyProvider>,
    );
    await flush();
    expect(view.getByTestId('lounge').textContent).toBe('admitted');
    expect(localStorage.getItem('thirty-club:journey-enter-pending')).toBe(
      null,
    );
    expect(club.calls).not.toContain('POST /journey/enter');
  });
});
