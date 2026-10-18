import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  memoryMembershipStorage,
  type MembershipRecord,
  type MembershipStorage,
} from '../../club/domain/membershipRecord';
import { ceremonyTimeline } from '../domain/entranceMachine';
import {
  memoryEntranceStorage,
  type EntranceRecord,
  type EntranceStorage,
} from '../domain/entranceRecord';
import {
  absentCard,
  presentedCard,
  systemClock,
  type MembershipCard,
} from '../domain/environment';
import { Entrance } from './Entrance';

// The birthday is midnight in Jamaica (UTC−5), whatever the host zone.
const MIDNIGHT = new Date('2026-10-24T05:00:00Z');
const before = (ms: number) => new Date(MIDNIGHT.getTime() - ms);
const after = (ms: number) => new Date(MIDNIGHT.getTime() + ms);

let storage: EntranceStorage;
let membership: MembershipStorage;

function open(
  record?: EntranceRecord,
  member?: MembershipRecord,
  card: MembershipCard = presentedCard,
) {
  storage = memoryEntranceStorage(record);
  membership = memoryMembershipStorage(member);
  const view = render(
    <MemoryRouter>
      <Entrance
        environment={{
          clock: systemClock,
          storage,
          membership,
          card,
          preview: null,
        }}
      />
    </MemoryRouter>,
  );
  return view.container.querySelector<HTMLElement>('.club')!;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function timerText() {
  return screen.getByRole('timer').textContent;
}

function preferReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduce,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  preferReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('locked entrance', () => {
  it('shows the club, the countdown and the personal line', () => {
    vi.setSystemTime(before(((6 * 24 + 3) * 60 + 4) * 60_000 + 5_000));
    const club = open(undefined, undefined, absentCard);
    expect(club.dataset.stage).toBe('locked');
    expect(
      screen.getByRole('heading', { name: 'The Thirty Club' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Est. MMXXVI')).toBeInTheDocument();
    expect(screen.getByText('Private membership')).toBeInTheDocument();
    expect(screen.getByText('By invitation only')).toBeInTheDocument();
    expect(timerText()).toContain('6 days, 3 hours, 4 minutes, 5 seconds');
    expect(
      screen.getByText('Alise, your table is being prepared.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Enter the club' }),
    ).not.toBeInTheDocument();
  });

  it('recalculates from the clock every second', () => {
    vi.setSystemTime(before(10_000));
    open();
    expect(timerText()).toContain('10 seconds');
    advance(3_100);
    expect(timerText()).toContain('7 seconds');
  });

  it('catches up immediately when a backgrounded page becomes visible', () => {
    vi.setSystemTime(before(3 * 24 * 3_600_000));
    open();
    expect(timerText()).toContain('3 days, 0 hours');
    // The device slept: the wall clock moved but no timers fired.
    vi.setSystemTime(before(5 * 3_600_000));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(timerText()).toContain('0 days, 5 hours, 0 minutes, 0 seconds');
  });

  it('summons the butler with scripted lines', () => {
    vi.setSystemTime(new Date(2026, 9, 20, 21, 0, 0));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Ring for service' }));
    expect(
      screen.getByText(
        /^Good evening, Alise\. Your membership has been approved\./,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ring for service' }));
    expect(
      screen.queryByText(/Your membership has been approved/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('The Butler')).toBeInTheDocument();
  });
});

describe('presentation', () => {
  it('shows the SVG facade when WebGL is unavailable', () => {
    vi.setSystemTime(before(3_600_000));
    const club = open();
    expect(club.querySelector('.facade')).toHaveAttribute(
      'data-render',
      'poster',
    );
    expect(club.querySelector('canvas')).toBeNull();
  });

  it('lets the butler withdraw after a comfortable reading time', () => {
    vi.setSystemTime(new Date(2026, 9, 20, 21, 0, 0));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Ring for service' }));
    const words = /Your membership has been approved/;
    expect(screen.getByText(words)).toBeInTheDocument();
    advance(7_000);
    expect(screen.getByText(words)).toBeInTheDocument();
    advance(4_000);
    expect(screen.queryByText(words)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ring for service' }),
    ).toBeEnabled();
  });
});

describe('the final minute and midnight', () => {
  it('warms the scene during the final minute', () => {
    vi.setSystemTime(before(90_000));
    const club = open();
    expect(club.style.getPropertyValue('--anticipation')).toBe('0.000');
    advance(60_000);
    expect(club.dataset.stage).toBe('final-minute');
    expect(Number(club.style.getPropertyValue('--anticipation'))).toBeCloseTo(
      0.5,
      1,
    );
  });

  it('unlocks, opens and welcomes Alise at midnight, then remembers', () => {
    const timeline = ceremonyTimeline(false);
    vi.setSystemTime(before(2_000));
    const club = open();
    expect(club.dataset.stage).toBe('final-minute');

    advance(2_100);
    expect(club.dataset.stage).toBe('unlocking');
    expect(timerText()).toContain('0 days, 0 hours, 0 minutes, 0 seconds');
    expect(screen.getByText('Alise, your table is ready.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ring for service' }),
    ).toBeDisabled();
    expect(storage.load().unlockedAt).not.toBeNull();
    expect(storage.load().ceremonySeenAt).toBeNull();

    advance(timeline.unlockingMs);
    expect(club.dataset.stage).toBe('opening');

    advance(timeline.openingMs);
    expect(club.dataset.stage).toBe('foyer');
    // The doors give onto the Members' Lounge and the membership ceremony.
    expect(
      screen.getByRole('heading', { name: 'The Members’ Lounge' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ah, Alise. There you are.').closest('.butler'),
    ).toHaveFocus();
    expect(
      screen.getByText('We’ve been expecting you for thirty years.'),
    ).toBeInTheDocument();
    expect(storage.load().ceremonySeenAt).not.toBeNull();
  });

  it('keeps the same beats but a brief timeline under reduced motion', () => {
    preferReducedMotion(true);
    const reduced = ceremonyTimeline(true);
    vi.setSystemTime(before(500));
    const club = open();
    expect(club.dataset.motion).toBe('reduced');
    advance(600);
    expect(club.dataset.stage).toBe('unlocking');
    advance(reduced.unlockingMs);
    expect(club.dataset.stage).toBe('opening');
    advance(reduced.openingMs);
    expect(club.dataset.stage).toBe('foyer');
    expect(reduced.unlockingMs + reduced.openingMs).toBeLessThan(
      ceremonyTimeline(false).unlockingMs,
    );
  });

  it('does not roll the timepiece drums under reduced motion', () => {
    preferReducedMotion(true);
    vi.setSystemTime(before(10_000));
    const club = open();
    advance(1_100);
    expect(timerText()).toContain('9 seconds');
    expect(club.querySelector('.drum__strip--rolling')).toBeNull();
  });

  it('rolls the drums with full motion', () => {
    vi.setSystemTime(before(10_000));
    const club = open();
    advance(1_100);
    expect(club.querySelector('.drum__strip--rolling')).not.toBeNull();
  });
});

describe('the membership card (ADR-012)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('keeps the doors closed at midnight until the card is presented', () => {
    vi.setSystemTime(before(2_000));
    const club = open(undefined, undefined, absentCard);
    advance(2_100);
    expect(club.dataset.stage).toBe('awaiting-credential');
    expect(timerText()).toContain('0 days, 0 hours, 0 minutes, 0 seconds');
    expect(
      screen.getByText(
        'Happy birthday, Alise. Your membership card, if you please.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Enter the club' }),
    ).not.toBeInTheDocument();
    // Hours later, the doors are still waiting; nothing was recorded.
    advance(3 * 3_600_000);
    expect(club.dataset.stage).toBe('awaiting-credential');
    expect(storage.load().unlockedAt).toBeNull();
  });

  it('a late arrival without the card is asked for it too', () => {
    vi.setSystemTime(after(9 * 3_600_000));
    const club = open(undefined, undefined, absentCard);
    expect(club.dataset.stage).toBe('awaiting-credential');
  });

  it('opens the ceremony when the number on the card is presented by hand', async () => {
    vi.setSystemTime(after(3_600_000));
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          // A real session is opaque; the payload says realm and scopes.
          session: `${btoa(JSON.stringify({ v: 1, realm: 'live', scopes: ['membership'], iat: 1 }))}.sig`,
          credential: 'membership',
          activatedAt: after(3_600_000).toISOString(),
          state: {},
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const club = open(undefined, undefined, absentCard);
    fireEvent.click(
      screen.getByRole('button', { name: 'Present the card by hand' }),
    );
    fireEvent.change(
      screen.getByLabelText('The number on your membership card'),
      {
        target: { value: 'tc 3010 2410' },
      },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Present membership' }),
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/concierge/activate',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(club.dataset.stage).toBe('unlocking');
    advance(ceremonyTimeline(false).unlockingMs);
    advance(ceremonyTimeline(false).openingMs);
    expect(club.dataset.stage).toBe('foyer');
  });

  it('tells Alise when the number is not recognised', async () => {
    vi.setSystemTime(after(3_600_000));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'unrecognised', message: 'no' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const club = open(undefined, undefined, absentCard);
    fireEvent.click(
      screen.getByRole('button', { name: 'Present the card by hand' }),
    );
    fireEvent.change(
      screen.getByLabelText('The number on your membership card'),
      {
        target: { value: 'WRONG-0000' },
      },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Present membership' }),
      );
    });
    expect(
      screen.getByText(/I do not recognise that number/),
    ).toBeInTheDocument();
    expect(club.dataset.stage).toBe('awaiting-credential');
  });

  it('a card presented early opens the doors automatically at midnight', () => {
    vi.setSystemTime(before(2_000));
    const club = open();
    expect(
      screen.getByText(
        'Alise, your card is in order. Your table is being prepared.',
      ),
    ).toBeInTheDocument();
    advance(2_100);
    expect(club.dataset.stage).toBe('unlocking');
  });
});

describe('the letter on the step (Phase One)', () => {
  const THURSDAY_2PM_UK = Date.parse('2026-10-22T13:00:00Z');

  it('announces the Departure Lounge before Thursday', () => {
    vi.setSystemTime(new Date(THURSDAY_2PM_UK - 2 * 24 * 3_600_000));
    open(undefined, undefined, absentCard);
    fireEvent.click(
      screen.getByRole('button', { name: 'A letter has been left for you' }),
    );
    const letter = screen.getByRole('dialog');
    expect(letter).toHaveTextContent('Your membership has been approved.');
    expect(letter).toHaveTextContent(/Thursday 22 October, 2\spm UK time/);
    expect(letter).toHaveTextContent('In 2 days, 0 hours');
    expect(screen.queryByRole('link', { name: /Departure Lounge/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('counts down live in the open letter to 14:00 UK, whatever the device zone', () => {
    // 13:00 UTC is 14:00 BST: 1 day, 2 hours, 3 minutes, 4 seconds before.
    vi.setSystemTime(
      new Date(THURSDAY_2PM_UK - (26 * 3600 + 3 * 60 + 4) * 1000),
    );
    open(undefined, undefined, absentCard);
    fireEvent.click(
      screen.getByRole('button', { name: 'A letter has been left for you' }),
    );
    const clock = screen.getByRole('timer', { name: 'Time until opening' });
    expect(clock).toHaveTextContent('1 day, 2 hours, 3 minutes, 4 seconds');
    advance(1_000);
    expect(clock).toHaveTextContent('1 day, 2 hours, 3 minutes, 3 seconds');
  });

  it('turns the open letter into the unlocked state at zero', () => {
    vi.setSystemTime(new Date(THURSDAY_2PM_UK - 2_000));
    open(undefined, undefined, absentCard);
    fireEvent.click(
      screen.getByRole('button', { name: 'A letter has been left for you' }),
    );
    expect(
      screen.getByRole('timer', { name: 'Time until opening' }),
    ).toHaveTextContent('0 days, 0 hours, 0 minutes, 2 seconds');
    advance(2_100);
    expect(
      screen.queryByRole('timer', { name: 'Time until opening' }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Proceed to the Departure Lounge' }),
    ).toHaveAttribute('href', '/departure');
  });

  it('leads to the Departure Lounge from Thursday at two, UK time', () => {
    vi.setSystemTime(new Date(THURSDAY_2PM_UK + 60_000));
    open(undefined, undefined, absentCard);
    fireEvent.click(
      screen.getByRole('button', { name: 'Your Departure Lounge is ready' }),
    );
    expect(
      screen.getByRole('link', { name: 'Proceed to the Departure Lounge' }),
    ).toHaveAttribute('href', '/departure');
  });

  it('is withdrawn in the final minute and after midnight', () => {
    vi.setSystemTime(before(30_000));
    open(undefined, undefined, absentCard);
    expect(
      screen.queryByRole('button', { name: /letter|Departure Lounge/ }),
    ).toBeNull();
  });
});

describe('after the birthday has passed', () => {
  it('presents unlocked doors and lets Alise enter', () => {
    vi.setSystemTime(after(9 * 3_600_000));
    const club = open();
    expect(club.dataset.stage).toBe('awaiting-entry');
    expect(timerText()).toContain('0 days, 0 hours, 0 minutes, 0 seconds');
    fireEvent.click(screen.getByRole('button', { name: 'Enter the club' }));
    expect(club.dataset.stage).toBe('opening');
    advance(ceremonyTimeline(false).openingMs);
    expect(club.dataset.stage).toBe('foyer');
  });

  it('returns a member who has entered straight to the lounge', () => {
    vi.setSystemTime(after(3 * 24 * 3_600_000));
    const seen = after(1_000).toISOString();
    const club = open(
      { unlockedAt: seen, ceremonySeenAt: seen },
      { inductedAt: seen, rooms: {} },
    );
    expect(club.dataset.stage).toBe('foyer');
    expect(screen.getByText(/Alise\. Welcome back\./)).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('never relocks after unlocking, even if the clock is set back', () => {
    vi.setSystemTime(before(5 * 24 * 3_600_000));
    const club = open({
      unlockedAt: after(0).toISOString(),
      ceremonySeenAt: null,
    });
    expect(club.dataset.stage).toBe('awaiting-entry');
  });

  it('replays the entrance from the foyer on request', () => {
    vi.setSystemTime(after(3_600_000));
    const seen = after(1_000).toISOString();
    const club = open(
      { unlockedAt: seen, ceremonySeenAt: seen },
      { inductedAt: seen, rooms: {} },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Members’ Directory' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Revisit: The Grand Entrance' }),
    );
    expect(club.dataset.stage).toBe('unlocking');
    const timeline = ceremonyTimeline(false);
    advance(timeline.unlockingMs);
    advance(timeline.openingMs);
    expect(club.dataset.stage).toBe('foyer');
    // A member walking back in is greeted, not re-inducted.
    expect(screen.getByText('Ah, Alise. There you are.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Accept your membership' }),
    ).not.toBeInTheDocument();
  });

  it('offers only working controls in the lounge', () => {
    vi.setSystemTime(after(3_600_000));
    const seen = after(1_000).toISOString();
    open(
      { unlockedAt: seen, ceremonySeenAt: seen },
      { inductedAt: seen, rooms: {} },
    );
    const names = screen
      .getAllByRole('button')
      .map((button) => button.textContent);
    // The built Screening Room is now offered alongside the lounge controls.
    expect(names).toEqual([
      'Continue your evening',
      'Members’ Directory',
      'Membership card',
      'Ring for service',
    ]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
