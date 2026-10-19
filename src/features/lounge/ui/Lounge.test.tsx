import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  memoryMembershipStorage,
  type MembershipRecord,
  type MembershipStorage,
} from '../../club/domain/membershipRecord';
import { CONCIERGE_LINES } from '../../club/domain/loungeScript';
import { memoryEntranceStorage } from '../../entrance/domain/entranceRecord';
import { presentedCard, systemClock } from '../../entrance/domain/environment';
import { Entrance } from '../../entrance/ui/Entrance';

// 1 am in Kingston on the birthday: after midnight, before any scheduled room.
const NIGHT_ONE = new Date('2026-10-24T01:00:00-05:00');
const SEEN = '2026-10-24T05:00:00.000Z';

let membership: MembershipStorage;

function enterLounge(record?: MembershipRecord) {
  membership ??= memoryMembershipStorage(record);
  return render(
    <MemoryRouter>
      <Entrance
        environment={{
          clock: systemClock,
          storage: memoryEntranceStorage({
            unlockedAt: SEEN,
            ceremonySeenAt: SEEN,
          }),
          membership,
          card: presentedCard,
          preview: null,
        }}
      />
    </MemoryRouter>,
  );
}

const inducted: MembershipRecord = {
  inductedAt: SEEN,
  rooms: { 'screening-room': { unlockedAt: SEEN, announcedAt: SEEN } },
};

function press(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NIGHT_ONE);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  membership = undefined as unknown as MembershipStorage;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('first arrival', () => {
  it('presents the membership in a short ceremony and remembers it', () => {
    enterLounge();
    expect(
      screen.getByRole('heading', { name: 'The Members’ Lounge' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ah, Alise. There you are.')).toBeInTheDocument();

    press('Continue');
    expect(
      screen.getByText(/Welcome to The Thirty Club\./),
    ).toBeInTheDocument();
    press('Continue');
    expect(screen.getByText(/You are its sole member/)).toBeInTheDocument();
    press('Continue');
    expect(screen.getByText(/Your membership card\./)).toBeInTheDocument();
    expect(screen.getByText('No. 1 of 1')).toBeInTheDocument();
    expect(membership.load().inductedAt).toBeNull();

    press('Accept your membership');
    expect(membership.load().inductedAt).not.toBeNull();
    expect(
      membership.load().rooms['screening-room']?.announcedAt,
    ).toBeDefined();
    expect(
      screen.getByText(/a number of rather important people/),
    ).toBeInTheDocument();
    const guide = screen.getByText('Your evening continues').parentElement!;
    expect(
      within(guide).getByText('The Private Screening Room'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue your evening' }),
    ).toBeInTheDocument();
  });

  it('lets Alise skip straight to her card', () => {
    enterLounge();
    press('Skip to your card');
    expect(
      screen.getByRole('button', { name: 'Accept your membership' }),
    ).toBeInTheDocument();
  });

  it('does not replay the ceremony after a reload', () => {
    const first = enterLounge();
    press('Skip to your card');
    press('Accept your membership');
    first.unmount();

    enterLounge();
    expect(screen.getByText(/Alise\. Welcome back\./)).toBeInTheDocument();
    expect(
      screen.getByText(/still waiting in the Private Screening Room/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();
  });

  it('restarts an unfinished ceremony rather than losing it', () => {
    const first = enterLounge();
    press('Continue');
    first.unmount();
    enterLounge();
    expect(screen.getByText('Ah, Alise. There you are.')).toBeInTheDocument();
    expect(membership.load().inductedAt).toBeNull();
  });
});

describe('the lounge as the club’s hub', () => {
  it('lets the butler withdraw after a comfortable reading time', () => {
    const { container } = enterLounge(inducted);
    const butler = container.querySelector<HTMLElement>('.butler')!;
    expect(butler.dataset.speaking).toBe('true');
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(butler.dataset.speaking).toBe('false');
    // The guidance stays: where she is and where to go next.
    expect(screen.getByText('The Private Screening Room')).toBeVisible();
  });

  it('answers the bell with his concierge lines in order', () => {
    enterLounge(inducted);
    press('Ring for service');
    expect(screen.getByText(CONCIERGE_LINES[0]!)).toBeInTheDocument();
    press('Ring for service');
    expect(screen.getByText(CONCIERGE_LINES[1]!)).toBeInTheDocument();
  });

  it('shows the membership card again on request', () => {
    enterLounge(inducted);
    press('Membership card');
    const dialog = screen.getByRole('dialog', { name: 'Your membership' });
    expect(within(dialog).getByText('Alise')).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Turn the card over' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Show the front' }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every room in the directory, with a way in only where one exists', () => {
    enterLounge(inducted);
    const opener = screen.getByRole('button', { name: 'Members’ Directory' });
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Members’ Directory' });
    const rows = within(dialog).getAllByRole('listitem');
    expect(
      rows.map((row) => row.querySelector('.directory__name')!.textContent),
    ).toEqual([
      'The Grand Entrance',
      'The Members’ Lounge',
      'The Private Screening RoomNext',
      'The Grand Casino',
      'The Gift Vault',
      'The Privileges Collection',
      'The Departure Lounge',
    ]);
    const status = (i: number) =>
      rows[i]!.querySelector('.directory__status')!.textContent;
    expect(status(1)).toBe('You are here');
    expect(status(2)).toBe('Open');
    expect(status(3)).toBe('Opens at 2 pm');
    // The Gift Vault opens with the membership, all day.
    expect(status(4)).toBe('Open');
    expect(within(rows[4]!).getByRole('button')).toBeInTheDocument();
    expect(status(5)).toBe('Opens at 10 am');
    // Locked and unbuilt rooms offer nothing to press.
    for (const i of [1, 3, 5]) {
      expect(within(rows[i]!).queryByRole('button')).toBeNull();
    }
    expect(
      within(rows[0]!).getByRole('button', {
        name: 'Revisit: The Grand Entrance',
      }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('announces a room the moment it opens while Alise is in the lounge', () => {
    vi.setSystemTime(new Date('2026-10-24T13:59:50-05:00'));
    enterLounge(inducted);
    expect(
      screen.queryByText(/Grand Casino has opened its doors/),
    ).not.toBeInTheDocument();
    act(() => {
      vi.setSystemTime(new Date('2026-10-24T14:00:30-05:00'));
      vi.advanceTimersByTime(30_000);
    });
    expect(
      screen.getByText(/Grand Casino has opened its doors/),
    ).toBeInTheDocument();
    expect(membership.load().rooms.casino?.unlockedAt).toBeDefined();
    expect(membership.load().rooms.casino?.announcedAt).toBeDefined();
  });

  it('makes the room behind an open overlay inert', () => {
    const { container } = enterLounge(inducted);
    press('Members’ Directory');
    expect(container.querySelector('.lounge__frame')).toHaveAttribute('inert');
  });
});
