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
import { systemClock } from '../domain/environment';
import { Entrance } from './Entrance';

// Local-time constructors keep these tests independent of the host zone.
const MIDNIGHT = new Date(2026, 9, 24, 0, 0, 0);
const before = (ms: number) => new Date(MIDNIGHT.getTime() - ms);
const after = (ms: number) => new Date(MIDNIGHT.getTime() + ms);

let storage: EntranceStorage;
let membership: MembershipStorage;

function open(record?: EntranceRecord, member?: MembershipRecord) {
  storage = memoryEntranceStorage(record);
  membership = memoryMembershipStorage(member);
  const view = render(
    <MemoryRouter>
      <Entrance
        environment={{ clock: systemClock, storage, membership, preview: null }}
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
    const club = open();
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
