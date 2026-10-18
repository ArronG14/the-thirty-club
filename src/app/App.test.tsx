import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useConnectivityStore } from '../shared/state/connectivityStore';

const pwa = vi.hoisted(() => ({
  offlineReady: false,
  needRefresh: false,
  update: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [pwa.offlineReady, vi.fn()],
    needRefresh: [pwa.needRefresh, vi.fn()],
    updateServiceWorker: pwa.update,
  }),
}));

function open(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Fix the wall clock before the birthday; leave timers real for findBy*.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17, 20, 0, 0));
  window.localStorage.clear();
  pwa.offlineReady = false;
  pwa.needRefresh = false;
  pwa.update.mockReset().mockResolvedValue(undefined);
  useConnectivityStore.setState({ isOnline: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('routes and connectivity', () => {
  it('renders the locked entrance with only working controls', () => {
    open();
    expect(
      screen.getByRole('heading', { name: 'The Thirty Club' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Alise, your table is being prepared.'),
    ).toBeInTheDocument();
    // Names as announced: decorative artwork is aria-hidden.
    const spoken = (element: Element) => {
      const copy = element.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      return copy.textContent;
    };
    // The concierge's letter on the step (ADR-012) and the butler's bell.
    expect(screen.getAllByRole('button').map(spoken)).toEqual([
      'A letter has been left for you',
      'Ring for service',
    ]);
  });

  it('provides a recovery link for an unknown route', () => {
    open('/missing-room');
    expect(
      screen.getByRole('heading', { name: 'This room does not exist.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Return to the entrance' }),
    ).toHaveAttribute('href', '/');
  });

  it('distinguishes network loss from confirmed offline readiness and recovers', () => {
    open();
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent(
      'You are offline. Offline readiness has not been confirmed.',
    );
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'You are offline.',
    );
  });

  it('shows readiness only after the worker reports it', () => {
    pwa.offlineReady = true;
    open();
    expect(screen.getByRole('status')).toHaveTextContent(
      'available offline on this device',
    );
  });

  it('only applies a waiting update after user action', () => {
    pwa.needRefresh = true;
    open();
    expect(pwa.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));
    expect(pwa.update).toHaveBeenCalledWith(true);
  });

  it('reports update failure instead of claiming success', async () => {
    pwa.needRefresh = true;
    pwa.update.mockRejectedValueOnce(new Error('Disconnected'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Apply update' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be applied',
    );
  });
});
