import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  memoryConciergeStorage,
  type ConciergeStorage,
} from '../client/localRecord';
import type { StoredSession } from '../client/sessionStore';
import { decodeSessionClaims } from '../domain/session';
import { serverBackedApi } from '../testing/serverBackedApi';
import type { ConciergeDeps, SessionAccess } from '../useConcierge';
import DepartureLounge from './DepartureLounge';

/** Thursday 22 October, 14:00 in London. */
const OPENS = Date.parse('2026-10-22T13:00:00Z');
const IN_FLIGHT = Date.parse('2026-10-22T17:30:00Z');
const MINUTE = 60_000;

let now: number;
let server: ReturnType<typeof serverBackedApi>;

function memorySessions(initial: string | null = null): SessionAccess & {
  token(): string | null;
} {
  let token = initial;
  const stored = (): StoredSession | null => {
    const claims = token ? decodeSessionClaims(token) : null;
    return token && claims ? { token, claims } : null;
  };
  return {
    token: () => token,
    active: stored,
    save: (next) => {
      token = next;
      return stored();
    },
    clear: () => {
      token = null;
    },
  };
}

interface Device {
  storage: ConciergeStorage;
  sessions: ReturnType<typeof memorySessions>;
}

function newDevice(): Device {
  return { storage: memoryConciergeStorage(), sessions: memorySessions() };
}

function visit(device: Device, api = server.api) {
  const deps: ConciergeDeps = {
    api,
    storage: device.storage,
    sessions: device.sessions,
  };
  return render(
    <MemoryRouter>
      <DepartureLounge deps={deps} />
    </MemoryRouter>,
  );
}

function preferReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: reduce,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

async function presentByHand(code: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Present it by hand' }),
  );
  fireEvent.change(
    screen.getByLabelText('The code printed on your credential'),
    {
      target: { value: code },
    },
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Present credential' }));
  });
}

async function board(device: Device) {
  visit(device);
  await presentByHand('BRASS-2210');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Enter the lounge' }),
  );
}

const arronMessages = () =>
  server.channels.outbox.filter((m) => m.text.includes('CONCIERGE REQUEST'));

beforeEach(() => {
  now = OPENS + 5 * MINUTE;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  server = serverBackedApi(() => now);
  preferReducedMotion(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('before Thursday', () => {
  it('shows the concierge letter and when the lounge opens, in UK time', async () => {
    now = OPENS - (2 * 24 * 60 + 90) * MINUTE;
    vi.setSystemTime(now);
    visit(newDevice());
    expect(
      await screen.findByText('Your membership has been approved.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Thursday 22 October, 2\spm UK time/),
    ).toBeInTheDocument();
    expect(screen.getByText('In 2 days, 1 hour')).toBeInTheDocument();
    expect(screen.getByLabelText('Departures')).toHaveTextContent(
      'Opens THU 14:00',
    );
    expect(
      screen.queryByRole('button', { name: 'Present it by hand' }),
    ).toBeNull();
  });
});

describe('the travel credential', () => {
  it('asks for the misplaced credentials with a riddle', async () => {
    visit(newDevice());
    expect(
      await screen.findByText('Your Departure Lounge is now ready.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/never once complained about the weight/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Departures')).toHaveTextContent(
      'Awaiting papers',
    );
  });

  it('refuses a wrong code without unlocking', async () => {
    visit(newDevice());
    await presentByHand('NOT-A-CODE');
    expect(
      await screen.findByText(/does not recognise that credential/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Enter the lounge' }),
    ).toBeNull();
  });

  it('issues the boarding pass for the right code, then remembers the device', async () => {
    const device = newDevice();
    const view = visit(device);
    await presentByHand('brass 2210');
    expect(
      await screen.findByText('Your travel credentials are in order'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Boarding pass')).toHaveTextContent(
      'Madam Alise Khera',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enter the lounge' }));
    expect(await screen.findByText('Your privileges')).toBeInTheDocument();
    view.unmount();
    // A later visit needs no credential and no second ceremony.
    visit(device);
    expect(await screen.findByText('Your privileges')).toBeInTheDocument();
    expect(
      screen.queryByText('Your travel credentials are in order'),
    ).toBeNull();
  });
});

describe('privileges', () => {
  it('locks the in-flight privilege until its release and it is not a control', async () => {
    await board(newDevice());
    const pocket = await screen.findByRole('list');
    expect(
      within(pocket).getByText(/Released in flight · 6:30\spm UK time/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /In-Flight Refreshment/ }),
    ).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Break the seal: Duty-Free Indulgence',
      }),
    ).toBeInTheDocument();
  });

  it('reveals, redeems, confirms and tells Arron, exactly once', async () => {
    const device = newDevice();
    await board(device);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Break the seal: Duty-Free Indulgence',
      }),
    );
    const card = await screen.findByRole('dialog');
    expect(
      within(card).getByText(/made arrangements for a little shopping/),
    ).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText(/boutique you have in mind/), {
      target: { value: 'A Diptyque candle' },
    });
    await act(async () => {
      fireEvent.click(
        within(card).getByRole('button', { name: 'Inform Arron' }),
      );
    });
    expect(
      await within(card).findByText('Your privilege has been granted.'),
    ).toBeInTheDocument();
    expect(within(card).getByText('A Diptyque candle')).toBeInTheDocument();
    expect(
      within(card).getByText('Arron has been informed.'),
    ).toBeInTheDocument();
    expect(arronMessages()).toHaveLength(1);
    expect(arronMessages()[0]?.text).toContain('A Diptyque candle');

    fireEvent.click(within(card).getByRole('button', { name: 'Close' }));
    expect(
      screen.getByRole('button', {
        name: /Duty-Free Indulgence\. Redeemed · 22 OCT · Arron informed/,
      }),
    ).toBeInTheDocument();
  });

  it('is redeemed for good: another device sees it and cannot redeem again', async () => {
    const first = newDevice();
    await board(first);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Break the seal: Duty-Free Indulgence',
      }),
    );
    await act(async () => {
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Inform Arron',
        }),
      );
    });
    await screen.findByText('Your privilege has been granted.');
    document.body.innerHTML = '';

    // The second device presents the credential too.
    const second = newDevice();
    await board(second);
    expect(
      await screen.findByRole('button', {
        name: /Duty-Free Indulgence\. Redeemed/,
      }),
    ).toBeInTheDocument();
    expect(arronMessages()).toHaveLength(1);
  });

  it('never claims Arron was told when the notification failed', async () => {
    await board(newDevice());
    server.channels.failNext('arron', 1);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Break the seal: Duty-Free Indulgence',
      }),
    );
    const card = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(
        within(card).getByRole('button', { name: 'Inform Arron' }),
      );
    });
    expect(
      await within(card).findByText(
        'Your request is recorded. Word is on its way to Arron.',
      ),
    ).toBeInTheDocument();
    expect(within(card).queryByText('Arron has been informed.')).toBeNull();
  });

  it('offers the in-flight choices once released and sends the selection', async () => {
    now = IN_FLIGHT + MINUTE;
    vi.setSystemTime(now);
    await board(newDevice());
    expect(screen.getByLabelText('Departures')).toHaveTextContent('In flight');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Break the seal: In-Flight Refreshment',
      }),
    );
    const card = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(
        within(card).getByRole('button', { name: 'Inform Arron' }),
      );
    });
    expect(within(card).getByRole('alert')).toHaveTextContent(
      'Please make your selection first',
    );
    fireEvent.click(within(card).getByLabelText('Champagne'));
    fireEvent.change(within(card).getByLabelText('Your preferred drink'), {
      target: { value: 'Something pink' },
    });
    await act(async () => {
      fireEvent.click(
        within(card).getByRole('button', { name: 'Inform Arron' }),
      );
    });
    expect(
      await within(card).findByText('Champagne — Something pink'),
    ).toBeInTheDocument();
    expect(arronMessages()[0]?.text).toContain(
      'Selection: Champagne — Something pink',
    );
  });

  it('keeps a request made offline and sends it when the connection returns', async () => {
    const device = newDevice();
    await board(device);
    server.setOffline(true);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Break the seal: Duty-Free Indulgence',
      }),
    );
    const card = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(
        within(card).getByRole('button', { name: 'Inform Arron' }),
      );
    });
    expect(
      await within(card).findByText('Your request is safely kept.'),
    ).toBeInTheDocument();
    expect(arronMessages()).toHaveLength(0);
    expect(device.storage.load().pending['duty-free']).toBeDefined();

    server.setOffline(false);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(arronMessages()).toHaveLength(1));
    expect(
      await within(card).findByText('Arron has been informed.'),
    ).toBeInTheDocument();
    expect(device.storage.load().pending['duty-free']).toBeUndefined();
  });

  it('opens the Friday correspondence as a letter, not a redemption', async () => {
    now = Date.parse('2026-10-23T14:01:00Z'); // 09:01 in Jamaica
    vi.setSystemTime(now);
    await board(newDevice());
    expect(screen.getByLabelText('Departures')).toHaveTextContent('Arrived');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Break the seal: Welcome to Jamaica',
      }),
    );
    const letter = await screen.findByRole('dialog');
    expect(
      within(letter).getByText(/Tomorrow you turn thirty/),
    ).toBeInTheDocument();
    expect(
      within(letter).queryByRole('button', { name: 'Inform Arron' }),
    ).toBeNull();
  });

  it('renders the last known lounge offline', async () => {
    const device = newDevice();
    await board(device);
    document.body.innerHTML = '';
    server.setOffline(true);
    visit(device);
    expect(await screen.findByText('Your privileges')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'You are offline. The lounge is shown as it was when last seen.',
      ),
    ).toBeInTheDocument();
  });
});
