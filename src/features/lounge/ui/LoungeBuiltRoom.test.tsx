import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  browserMembershipStorage,
  MEMBERSHIP_RECORD_KEY,
  serialiseMembership,
} from '../../club/domain/membershipRecord';
import { RoomGate } from '../../club/ui/RoomGate';
import { memoryEntranceStorage } from '../../entrance/domain/entranceRecord';
import { systemClock } from '../../entrance/domain/environment';
import { Entrance } from '../../entrance/ui/Entrance';

const SEEN = '2026-10-24T05:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T01:00:00-05:00'));
  window.localStorage.clear();
  window.localStorage.setItem(
    MEMBERSHIP_RECORD_KEY,
    serialiseMembership({ inductedAt: SEEN, rooms: {} }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('once a room is built', () => {
  it('offers one clear way to continue the evening, and records the visit', async () => {
    render(
      <MemoryRouter>
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
                  membership: browserMembershipStorage(),
                  preview: null,
                }}
              />
            }
          />
          <Route path="/rooms/:roomId" element={<RoomGate />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue your evening' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'The Private Screening Room',
      }),
    ).toBeInTheDocument();
    expect(
      browserMembershipStorage().load().rooms['screening-room']?.visitedAt,
    ).toBeDefined();
  });
});
