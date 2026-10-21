/**
 * Early admission at the entrance (ADR-022/023), driven by a fake server:
 * the countdown to 19:00 UK on 21 October, the hold at ten seconds, the
 * final ten seconds only when the server agrees, the membership card has
 * been presented and she is looking, the doors opening by themselves,
 * reloads, looking away, the card arriving from another tab and a wrong
 * device clock.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryMembershipStorage } from '../../club/domain/membershipRecord';
import {
  earlyView,
  parseEntrance,
  resumableStart,
  shouldStartFinal,
} from '../domain/earlyAdmission';
import { memoryEntranceStorage } from '../domain/entranceRecord';
import {
  systemClock,
  type EarlyAdmissionSource,
  type MembershipCard,
} from '../domain/environment';
import { Entrance } from './Entrance';
import { createEntranceEnvironment } from '../entranceEnvironment';
import { saveSession } from '../../concierge/client/sessionStore';
import { encodeClaims } from '../../concierge/domain/session';
import { recordMembership } from '../../concierge/client/membership';

/** 19:00 in London on Wednesday 21 October 2026 (BST) = 13:00 Jamaica. */
const OPENS = Date.parse('2026-10-21T18:00:00Z');

interface FakeServer {
  /** Server clock minus device clock (a wrong phone clock). */
  skewMs: number;
  authorised: boolean;
  reachable: boolean;
  finalStart: number | null;
}
let server: FakeServer;
/** Whether this browser holds the card (its /c/ link was opened). */
let carded: boolean;
const card: MembershipCard = { isPresented: () => carded };
const CLUE = 'Your card is beneath the second cushion.';

const source = (): EarlyAdmissionSource => ({
  async read() {
    if (!server.reachable) return null;
    const now = Date.now() + server.skewMs;
    return {
      now: new Date(now).toISOString(),
      opensAt: server.authorised ? new Date(OPENS).toISOString() : null,
      // The server fires the milestone lazily when it is due.
      eligible: server.authorised && now >= OPENS,
      ...(server.authorised && now >= OPENS
        ? { letter: { title: 'Your early admission', body: CLUE } }
        : {}),
    };
  },
  loadFinalStart: () => server.finalStart,
  saveFinalStart: (at) => {
    server.finalStart = at;
  },
});

function open() {
  const view = render(
    <MemoryRouter>
      <Entrance
        environment={{
          clock: systemClock,
          storage: memoryEntranceStorage(),
          membership: memoryMembershipStorage(),
          card,
          preview: null,
          admission: source(),
        }}
      />
    </MemoryRouter>,
  );
  return view.container.querySelector<HTMLElement>('.club')!;
}

/** Lets the fake server's answer arrive. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
const timer = () => screen.getByRole('timer').textContent ?? '';
function setVisible(visible: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  server = { skewMs: 0, authorised: true, reachable: true, finalStart: null };
  carded = true;
  setVisible(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('a retained authenticated session and old recognition cannot start the ceremony before the new card action', async () => {
  vi.setSystemTime(OPENS - 5_000);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (input: string) =>
        new Response(
          JSON.stringify(
            input.includes('/api/concierge/state')
              ? { activations: {} }
              : { error: 'not-configured' },
          ),
          { status: input.includes('/api/concierge/state') ? 200 : 503 },
        ),
    ),
  );
  saveSession(
    `${encodeClaims({ v: 1, realm: 'live', scopes: ['membership'], iat: OPENS - 86_400_000 })}.old-signature`,
  );
  recordMembership(new Date(OPENS - 86_400_000).toISOString());
  const env = createEntranceEnvironment();
  expect(env.card.isPresented()).toBe(false);
  const view = render(
    <MemoryRouter>
      <Entrance environment={{ ...env, admission: source() }} />
    </MemoryRouter>,
  );
  const club = view.container.querySelector('.club')!;
  await settle();
  advance(7_000);
  await settle();
  expect(
    screen.getByRole('button', { name: 'Your early admission' }),
  ).toBeVisible();
  advance(20_000);
  expect(club).toHaveAttribute('data-stage', 'final-minute');
  expect(timer()).toContain('10 seconds');
  saveSession(
    `${encodeClaims({ v: 1, realm: 'live', scopes: ['membership'], iat: Date.now(), cardPresentedAt: Date.now() })}.new-signature`,
  );
  act(() => window.dispatchEvent(new Event('storage')));
  advance(9_000);
  expect(club).toHaveAttribute('data-stage', 'final-minute');
  advance(2_000);
  expect(club).toHaveAttribute('data-stage', 'unlocking');
  advance(5_000);
  advance(20_000);
  await settle();
  expect(club).toHaveAttribute('data-stage', 'foyer');
  cleanup();
  render(
    <MemoryRouter>
      <Entrance
        environment={{ ...createEntranceEnvironment(), admission: source() }}
      />
    </MemoryRouter>,
  );
  await settle();
  expect(document.querySelector('.club')).toHaveAttribute(
    'data-stage',
    'foyer',
  );
});

describe('the rules', () => {
  const a = { opensAt: OPENS, eligible: false, offsetMs: 0, letter: null };
  it('counts truthfully, then holds at ten seconds until the server agrees', () => {
    expect(earlyView(OPENS - 3_600_000, a, null)).toEqual({
      remainingMs: 3_600_000,
      phase: 'locked',
    });
    expect(earlyView(OPENS - 5_000, a, null).remainingMs).toBe(10_000);
    expect(earlyView(OPENS + 600_000, a, null)).toEqual({
      remainingMs: 10_000,
      phase: 'final-minute',
    });
  });
  it('begins the final ten seconds only when eligible, carded and visible', () => {
    const ok = { ...a, eligible: true };
    expect(shouldStartFinal(OPENS, ok, null, true, true)).toBe(true);
    expect(shouldStartFinal(OPENS, ok, null, false, true)).toBe(false);
    expect(shouldStartFinal(OPENS, a, null, true, true)).toBe(false);
    // 19:00 alone never opens the doors (ADR-023).
    expect(shouldStartFinal(OPENS, ok, null, true, false)).toBe(false);
    expect(earlyView(OPENS + 4_000, ok, OPENS)).toEqual({
      remainingMs: 6_000,
      phase: 'final-minute',
    });
    expect(earlyView(OPENS + 10_000, ok, OPENS).phase).toBe('open');
  });
  it('resumes a reload within ten seconds, and starts again after', () => {
    expect(resumableStart(OPENS, OPENS + 4_000)).toBe(OPENS);
    expect(resumableStart(OPENS, OPENS + 60_000)).toBeNull();
  });
  it('ignores an unauthorised or malformed answer', () => {
    expect(parseEntrance({ now: 'x', opensAt: null }, 0)).toBeNull();
    expect(
      parseEntrance(
        { now: '2026-10-21T17:00:00Z', opensAt: null, eligible: true },
        0,
      ),
    ).toBeNull();
  });
  it('shows the Butler’s letter only once the server has fired 19:00', () => {
    const letter = { title: 'Your early admission', body: CLUE };
    expect(
      parseEntrance(
        {
          now: '2026-10-21T17:00:00Z',
          opensAt: '2026-10-21T18:00:00Z',
          eligible: false,
          letter,
        },
        0,
      )?.letter,
    ).toBeNull();
    expect(
      parseEntrance(
        {
          now: '2026-10-21T18:00:01Z',
          opensAt: '2026-10-21T18:00:00Z',
          eligible: true,
          letter,
        },
        0,
      )?.letter,
    ).toEqual(letter);
  });
});

describe('at the entrance', () => {
  it('after the teaser, shows the real time to 19:00 and says the admission is brought forward', async () => {
    vi.setSystemTime(Date.parse('2026-10-21T15:01:00Z'));
    const club = open();
    await settle();
    expect(club.dataset.stage).toBe('locked');
    expect(timer()).toContain('0 days, 2 hours, 59 minutes, 0 seconds');
    expect(
      screen.getByText('Alise, your admission has been brought forward.'),
    ).toBeInTheDocument();
  });

  it('without the owner’s authorisation, keeps the birthday countdown', async () => {
    server.authorised = false;
    vi.setSystemTime(Date.parse('2026-10-21T18:30:00Z'));
    const club = open();
    await settle();
    expect(club.dataset.stage).toBe('locked');
    expect(timer()).toContain('2 days');
  });

  it('watching at 19:00: holds at ten seconds, then the final ten and the doors open by themselves', async () => {
    vi.setSystemTime(OPENS - 20_000);
    const club = open();
    await settle();
    advance(12_000); // 18:59:52 → the clock holds at 00:00:10
    expect(timer()).toContain('0 minutes, 10 seconds');
    advance(6_000);
    expect(timer()).toContain('0 minutes, 10 seconds');
    advance(2_900); // 19:00:00.9 → the server is asked at the due time
    await settle();
    advance(4_000);
    expect(timer()).toMatch(/0 minutes, [5-7] seconds/);
    advance(7_000);
    expect(club.dataset.stage).toBe('unlocking');
    advance(3_000);
    advance(5_000);
    expect(club.dataset.stage).toBe('foyer');
    expect(
      screen.getByRole('heading', { name: 'The Members’ Lounge' }),
    ).toBeInTheDocument();
  });

  it('arriving later: the final ten seconds begin when she opens the app', async () => {
    vi.setSystemTime(Date.parse('2026-10-21T19:45:00Z'));
    const club = open();
    await settle();
    expect(timer()).toContain('0 minutes, 10 seconds');
    advance(5_000);
    expect(timer()).toMatch(/0 minutes, [5-6] seconds/);
    advance(6_000);
    expect(club.dataset.stage).toBe('unlocking');
  });

  it('a reload during the final ten seconds continues where it was', async () => {
    vi.setSystemTime(OPENS + 600_000);
    server.finalStart = OPENS + 600_000 - 4_000;
    open();
    await settle();
    expect(timer()).toMatch(/0 minutes, [5-6] seconds/);
  });

  it('looking away during the final ten seconds starts them again on return', async () => {
    vi.setSystemTime(OPENS + 60_000);
    const club = open();
    await settle();
    advance(6_000);
    setVisible(false);
    advance(30_000);
    expect(club.dataset.stage).not.toBe('unlocking');
    setVisible(true);
    await settle();
    advance(1_500);
    expect(timer()).toMatch(/0 minutes, (8|9) seconds/);
  });

  it('a phone clock set to the future opens nothing: the server’s clock rules', async () => {
    // The phone believes it is 20:00 UK; the server says it is 17:00 UK.
    vi.setSystemTime(Date.parse('2026-10-21T19:00:00Z'));
    server.skewMs = -3 * 3_600_000;
    const club = open();
    await settle();
    advance(15_000);
    expect(club.dataset.stage).toBe('locked');
    // 16:00:15 UTC on the server: 1 h 59 min 45 s to 18:00 UTC.
    expect(timer()).toMatch(/0 days, 1 hour, 59 minutes, 4[56] seconds/);
  });

  it('19:00 without the card: the clock holds at ten seconds, the letter and the card prompt wait', async () => {
    carded = false;
    vi.setSystemTime(OPENS + 60_000);
    const club = open();
    await settle();
    advance(30_000);
    expect(club.dataset.stage).toBe('final-minute');
    expect(timer()).toContain('0 minutes, 10 seconds');
    expect(
      screen.getByText(
        'Alise, the club is ready to receive you. Your membership card, if you please.',
      ),
    ).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: 'Your early admission' }).click();
    });
    expect(screen.getByText(CLUE)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Present the card by hand' }),
    ).toBeInTheDocument();
  });

  it('the card scanned in a new tab: this tab begins the final ten and opens the doors', async () => {
    carded = false;
    vi.setSystemTime(OPENS + 60_000);
    const club = open();
    await settle();
    advance(5_000);
    expect(timer()).toContain('0 minutes, 10 seconds');
    // The NFC link opened another Safari tab, which stored the card.
    carded = true;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage'));
    });
    advance(4_000);
    expect(timer()).toMatch(/0 minutes, [5-7] seconds/);
    advance(7_000);
    expect(club.dataset.stage).toBe('unlocking');
  });

  it('a phone clock running ahead never runs out the birthday countdown: the server’s clock counts', async () => {
    // The phone believes it is ten seconds before the birthday; the server
    // says it is Wednesday afternoon and early admission is not armed.
    server.authorised = false;
    vi.setSystemTime(Date.parse('2026-10-24T04:59:50Z'));
    server.skewMs = Date.parse('2026-10-21T15:00:00Z') - Date.now();
    const club = open();
    await settle();
    advance(20_000);
    expect(club.dataset.stage).toBe('locked');
    expect(timer()).toContain('2 days');
  });

  it('one entrance only: birthday midnight with the card opens nothing without the server', async () => {
    server.authorised = false;
    vi.setSystemTime(Date.parse('2026-10-24T05:00:05Z')); // 00:00:05 Jamaica
    const club = open();
    await settle();
    advance(60_000);
    expect(club.dataset.stage).not.toMatch(/unlocking|opening|foyer|awaiting/);
    expect(screen.queryByRole('button', { name: 'Enter the club' })).toBeNull();
  });

  it('the phone moving from London to Jamaica time changes neither the clock nor the membership', async () => {
    const previous = process.env.TZ;
    try {
      vi.setSystemTime(Date.parse('2026-10-21T15:01:00Z'));
      process.env.TZ = 'Europe/London';
      open();
      await settle();
      const before = timer();
      cleanup();
      process.env.TZ = 'America/Jamaica';
      open();
      await settle();
      expect(timer()).toBe(before);
    } finally {
      process.env.TZ = previous;
    }
  });

  it('a dropped connection never invents eligibility', async () => {
    server.reachable = false;
    vi.setSystemTime(OPENS + 120_000);
    const club = open();
    await settle();
    advance(20_000);
    expect(club.dataset.stage).toBe('locked');
  });
});
