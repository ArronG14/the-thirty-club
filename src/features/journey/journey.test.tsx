/**
 * Room admission on the device (ADR-020): the Directory, the room gate,
 * the Lounge's Letter of Admission and the letter buttons, driven by a
 * fixed journey value in place of the server.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdmissionRoomId,
  AdmissionState,
  MemberAdmission,
} from '../../shared/journey/contract';
import { roomViews } from '../club/domain/clubState';
import {
  MEMBERSHIP_RECORD_KEY,
  memoryMembershipStorage,
  serialiseMembership,
} from '../club/domain/membershipRecord';
import { ROOMS } from '../club/domain/rooms';
import { RoomGate } from '../club/ui/RoomGate';
import { memoryEntranceStorage } from '../entrance/domain/entranceRecord';
import { presentedCard, systemClock } from '../entrance/domain/environment';
import { Entrance } from '../entrance/ui/Entrance';
import {
  deserialise,
  EMPTY_SNAPSHOT,
  LOCKED_EVERYWHERE,
  serialise,
  snapshotOf,
  type JourneySnapshot,
} from './domain/access';
import { JourneyContext, type JourneyValue } from './journeyContext';
import { LetterActionButton } from './ui/LetterActionButton';

const SEEN = '2026-10-24T05:00:00.000Z';

function letterFor(room: AdmissionRoomId): MemberAdmission {
  return {
    roomId: room,
    state: 'invited',
    invitedAt: '2026-10-23T14:00:00Z',
    admittedAt: null,
    letter: { title: `Letter of Admission — ${room}`, body: 'Madam, do.' },
  };
}

function journeyWith(
  rooms: Partial<Record<AdmissionRoomId, AdmissionState>>,
  accept: JourneyValue['accept'] = vi.fn(async () => ({ ok: true as const })),
): JourneyValue {
  const all = { ...LOCKED_EVERYWHERE, ...rooms };
  const snapshot: JourneySnapshot = {
    rooms: all,
    pending: (Object.keys(all) as AdmissionRoomId[])
      .filter((room) => all[room] === 'invited')
      .map(letterFor),
  };
  return {
    status: 'ready',
    snapshot,
    stateOf: (room) => all[room],
    accept,
    refresh: vi.fn(),
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function withJourney(journey: JourneyValue, path: string, element: ReactNode) {
  return render(
    <JourneyContext.Provider value={journey}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/rooms/:roomId" element={element} />
          <Route path="/lounge" element={<Where />} />
          <Route path="*" element={element} />
        </Routes>
      </MemoryRouter>
    </JourneyContext.Provider>,
  );
}

const inductedRecord = { inductedAt: SEEN, rooms: {} };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 3 pm in Kingston on the birthday: every room is open by the schedule,
  // so anything still closed is closed by the journey.
  vi.setSystemTime(new Date('2026-10-24T15:00:00-05:00'));
  window.localStorage.clear();
  window.localStorage.setItem(
    MEMBERSHIP_RECORD_KEY,
    serialiseMembership(inductedRecord),
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('room views decided by the journey', () => {
  const at = Date.parse('2026-10-24T20:00:00Z');
  const view = (id: string, access: JourneyValue['snapshot']['rooms']) =>
    roomViews(at, inductedRecord, ROOMS, access).find((v) => v.room.id === id)!;

  it('hides and closes a locked room, even though the schedule has opened it', () => {
    expect(
      roomViews(at, inductedRecord).find((v) => v.room.id === 'casino')!.open,
    ).toBe(true);
    expect(view('casino', LOCKED_EVERYWHERE)).toMatchObject({
      open: false,
      enterable: false,
      hidden: true,
      opensAt: null,
    });
  });

  it('keeps an invited room hidden', () => {
    expect(
      view('casino', { ...LOCKED_EVERYWHERE, casino: 'invited' }),
    ).toMatchObject({
      open: false,
      hidden: true,
    });
  });

  it('shows and opens an admitted room', () => {
    expect(
      view('casino', { ...LOCKED_EVERYWHERE, casino: 'admitted' }),
    ).toMatchObject({
      open: true,
      enterable: true,
      hidden: false,
    });
  });

  it('ignores a device record that latched a room open before the journey', () => {
    const record = {
      inductedAt: SEEN,
      rooms: { casino: { unlockedAt: SEEN } },
    };
    expect(
      roomViews(at, record, ROOMS, LOCKED_EVERYWHERE).find(
        (v) => v.room.id === 'casino',
      )!.open,
    ).toBe(false);
  });

  it('never gates the Lounge, the Entrance or the Departure Lounge', () => {
    for (const id of ['lounge', 'entrance', 'departure-lounge'])
      expect(view(id, LOCKED_EVERYWHERE).hidden).toBe(false);
  });
});

describe('the room gate', () => {
  it('a locked room rejects a direct link and names nothing', () => {
    withJourney(journeyWith({}), '/rooms/casino', <RoomGate />);
    expect(
      screen.getByRole('heading', { name: 'Not this way, Madam.' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Casino/)).toBeNull();
  });

  it('an invited room escorts her to the Lounge for her letter', () => {
    withJourney(
      journeyWith({ casino: 'invited' }),
      '/rooms/casino',
      <RoomGate />,
    );
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/lounge?admission=casino',
    );
  });

  it('an admitted room opens from a direct link', async () => {
    withJourney(
      journeyWith({ 'screening-room': 'admitted' }),
      '/rooms/screening-room',
      <RoomGate />,
    );
    expect(
      await screen.findByText('Your screening is being prepared.'),
    ).toBeInTheDocument();
  });

  it('while the office has not answered, an unknown room waits rather than opening', () => {
    const journey = { ...journeyWith({}), status: 'loading' as const };
    withJourney(journey, '/rooms/casino', <RoomGate />);
    expect(screen.getByRole('status')).toHaveTextContent('One moment…');
  });

  it('offline, a room admitted earlier stays open from the device’s memory', async () => {
    const remembered = deserialise(
      serialise({
        ...EMPTY_SNAPSHOT,
        rooms: { ...LOCKED_EVERYWHERE, 'screening-room': 'admitted' },
      }),
    )!;
    const journey: JourneyValue = {
      ...journeyWith({}),
      status: 'offline',
      snapshot: remembered,
      stateOf: (room) => remembered.rooms[room],
    };
    withJourney(journey, '/rooms/screening-room', <RoomGate />);
    expect(
      await screen.findByText('Your screening is being prepared.'),
    ).toBeInTheDocument();
  });
});

describe('the Directory and the Letter of Admission in the Lounge', () => {
  function lounge(journey: JourneyValue) {
    return render(
      <JourneyContext.Provider value={journey}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <Entrance
                  environment={{
                    clock: systemClock,
                    storage: memoryEntranceStorage({
                      unlockedAt: SEEN,
                      ceremonySeenAt: SEEN,
                    }),
                    membership: memoryMembershipStorage(inductedRecord),
                    card: presentedCard,
                    preview: null,
                  }}
                />
              }
            />
            <Route path="/rooms/:roomId" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </JourneyContext.Provider>,
    );
  }

  const directory = () => {
    fireEvent.click(screen.getByRole('button', { name: /Members’ Directory/ }));
    return screen.getByRole('dialog', { name: 'Members’ Directory' });
  };

  it('lists only rooms she has been admitted to', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T15:00:00-05:00'));
    lounge(journeyWith({ 'screening-room': 'admitted', casino: 'invited' }));
    act(() => void vi.advanceTimersByTime(100));
    // The letter is presented first; keep it for later to reach the dock.
    act(() => void vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it for later' }));
    const panel = directory();
    expect(panel).toHaveTextContent('The Private Screening Room');
    expect(panel).not.toHaveTextContent('Grand Casino');
    expect(panel).not.toHaveTextContent('Gift Vault');
    expect(panel).not.toHaveTextContent('Privileges');
  });

  it('presents the waiting letter; accepting admits her and the Butler escorts her in', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T15:00:00-05:00'));
    const accept = vi.fn(async () => ({ ok: true as const }));
    lounge(journeyWith({ casino: 'invited' }, accept));
    act(() => void vi.advanceTimersByTime(1500));
    const letter = screen.getByRole('dialog', { name: 'The Grand Casino' });
    expect(letter).toHaveTextContent('Letter of Admission');
    fireEvent.click(
      screen.getByRole('button', { name: 'ENTER THE GRAND CASINO' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(accept).toHaveBeenCalledWith('casino');
    expect(accept).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('dialog', { name: 'The Grand Casino' }),
    ).toBeNull();
    act(() => void vi.advanceTimersByTime(2500));
    expect(screen.getByTestId('where')).toHaveTextContent('/rooms/casino');
  });

  it('keeps the letter when she declines for now, and offers it again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T15:00:00-05:00'));
    lounge(journeyWith({ casino: 'invited' }));
    act(() => void vi.advanceTimersByTime(1500));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it for later' }));
    expect(
      screen.queryByRole('dialog', { name: 'The Grand Casino' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read your letter' }));
    expect(
      screen.getByRole('dialog', { name: 'The Grand Casino' }),
    ).toBeInTheDocument();
  });

  it('shows the server’s refusal and stays put if acceptance fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T15:00:00-05:00'));
    const accept = vi.fn(async () => ({
      ok: false as const,
      message: 'The club’s office did not answer.',
    }));
    lounge(journeyWith({ casino: 'invited' }, accept));
    act(() => void vi.advanceTimersByTime(1500));
    fireEvent.click(
      screen.getByRole('button', { name: 'ENTER THE GRAND CASINO' }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('did not answer');
    expect(
      screen.getByRole('dialog', { name: 'The Grand Casino' }),
    ).toBeInTheDocument();
  });
});

describe('letter buttons', () => {
  const action = (kind: 'admission' | 'return', roomId: AdmissionRoomId) => ({
    kind,
    roomId,
    label:
      kind === 'return'
        ? 'RETURN TO THE GRAND CASINO'
        : 'ENTER THE MEMBERS’ LOUNGE',
  });
  const show = (journey: JourneyValue, a: ReturnType<typeof action>) =>
    render(
      <JourneyContext.Provider value={journey}>
        <LetterActionButton action={a} />
      </JourneyContext.Provider>,
    );

  it('a return invitation opens the Casino directly once admitted', () => {
    show(journeyWith({ casino: 'admitted' }), action('return', 'casino'));
    expect(
      screen.getByRole('link', { name: 'RETURN TO THE GRAND CASINO' }),
    ).toHaveAttribute('href', '/rooms/casino');
  });

  it('an admission summons leads to the Lounge while invited, straight in once admitted', () => {
    const { unmount } = show(
      journeyWith({ casino: 'invited' }),
      action('admission', 'casino'),
    );
    expect(
      screen.getByRole('link', { name: 'ENTER THE MEMBERS’ LOUNGE' }),
    ).toHaveAttribute('href', '/lounge?admission=casino');
    unmount();
    show(journeyWith({ casino: 'admitted' }), action('admission', 'casino'));
    expect(
      screen.getByRole('link', { name: 'ENTER THE GRAND CASINO' }),
    ).toHaveAttribute('href', '/rooms/casino');
  });

  it('never offers a room that is locked (for example a withdrawn invitation)', () => {
    const { container } = show(journeyWith({}), action('return', 'casino'));
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the device cache', () => {
  it('remembers only what the server confirmed, and survives corruption', () => {
    const snapshot = snapshotOf({
      now: SEEN,
      admissions: [
        {
          roomId: 'casino',
          state: 'admitted',
          invitedAt: SEEN,
          admittedAt: SEEN,
          letter: null,
        },
        letterFor('gift-vault'),
      ],
    });
    const back = deserialise(serialise(snapshot))!;
    expect(back.rooms.casino).toBe('admitted');
    expect(back.rooms['gift-vault']).toBe('invited');
    expect(back.pending.map((p) => p.roomId)).toEqual(['gift-vault']);
    expect(deserialise('{not json')).toBeNull();
    expect(
      deserialise(JSON.stringify({ version: 9, admitted: ['casino'] })),
    ).toBeNull();
    expect(
      deserialise(
        JSON.stringify({ version: 1, admitted: ['kitchen', 'casino'] }),
      )!.rooms,
    ).toEqual({ ...LOCKED_EVERYWHERE, casino: 'admitted' });
  });
});
