import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBERSHIP_RECORD_KEY,
  serialiseMembership,
} from '../domain/membershipRecord';
import { RoomGate } from './RoomGate';

function visit(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rooms/:roomId" element={<RoomGate />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T01:00:00-05:00'));
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('room gate', () => {
  it('turns a member away from a room that has not opened, saying when', () => {
    window.localStorage.setItem(
      MEMBERSHIP_RECORD_KEY,
      serialiseMembership({ inductedAt: '2026-10-24T05:00:00Z', rooms: {} }),
    );
    visit('/rooms/casino');
    expect(
      screen.getByRole('heading', { name: 'The Grand Casino' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not open yet\. It opens at 2\spm, Jamaica time\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Return to the club' }),
    ).toHaveAttribute('href', '/');
  });

  it('keeps the screening room closed until the membership is presented', () => {
    visit('/rooms/screening-room');
    expect(
      screen.getByText(/opens once your membership has been presented/),
    ).toBeInTheDocument();
  });

  it('says plainly when an open room is still being prepared', () => {
    window.localStorage.setItem(
      MEMBERSHIP_RECORD_KEY,
      serialiseMembership({ inductedAt: '2026-10-24T05:00:00Z', rooms: {} }),
    );
    vi.setSystemTime(new Date('2026-10-25T06:00:00Z'));
    visit('/rooms/privileges');
    expect(
      screen.getByText(/not ready yet\. It is still being prepared/),
    ).toBeInTheDocument();
  });

  it('admits an inducted member to the screening room', async () => {
    window.localStorage.setItem(
      MEMBERSHIP_RECORD_KEY,
      serialiseMembership({ inductedAt: '2026-10-24T05:00:00Z', rooms: {} }),
    );
    visit('/rooms/screening-room');
    // LIVE, before the birthday film is configured: honest, no Watch Movie.
    expect(
      await screen.findByText('Your screening is being prepared.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Watch Movie' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Return to the Members’ Lounge' }),
    ).toHaveAttribute('href', '/');
  });

  it('does not invent rooms', () => {
    visit('/rooms/secret-chamber');
    expect(
      screen.getByRole('heading', { name: 'This room does not exist.' }),
    ).toBeInTheDocument();
    visit('/rooms/lounge');
    expect(
      screen.getAllByRole('heading', { name: 'This room does not exist.' }),
    ).toHaveLength(2);
  });
});
