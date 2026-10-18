import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeSession } from '../client/sessionStore';
import { serverBackedApi } from '../testing/serverBackedApi';
import CredentialArrival from './CredentialArrival';

let server: ReturnType<typeof serverBackedApi>;

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where">
      {location.pathname}
      {(location.state as { presented?: string } | null)?.presented ?? ''}
    </p>
  );
}

function arrive(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/c/:token"
          element={<CredentialArrival api={server.api} />}
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  server = serverBackedApi(() => Date.parse('2026-10-22T13:30:00Z'));
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('arriving from an NFC tag', () => {
  it('recognises the travel credential, keeps the session and goes to the lounge', async () => {
    arrive('/c/departure-test-token-0001');
    expect(await screen.findByTestId('where')).toHaveTextContent('/departure');
    expect(activeSession()?.claims.scopes).toEqual(['departure']);
  });

  it('sends the membership card to the club door with the ceremony', async () => {
    arrive('/c/membership-test-token-0001');
    expect(await screen.findByTestId('where')).toHaveTextContent('/membership');
    expect(activeSession()?.claims.scopes).toEqual(['membership']);
  });

  it('says plainly when a credential is not recognised', async () => {
    arrive('/c/not-a-real-token-123');
    expect(await screen.findByText('Not quite, Madam')).toBeInTheDocument();
    expect(activeSession()).toBeNull();
    expect(
      screen.getByRole('link', { name: 'To the club’s door' }),
    ).toHaveAttribute('href', '/');
  });

  it('refuses impossible tokens without asking the service', async () => {
    const activate = vi.spyOn(server.api, 'activate');
    arrive('/c/x');
    expect(await screen.findByText('Not quite, Madam')).toBeInTheDocument();
    expect(activate).not.toHaveBeenCalled();
  });

  it('is honest when offline', async () => {
    server.setOffline(true);
    arrive('/c/departure-test-token-0001');
    expect(await screen.findByText('No connection')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });
});
