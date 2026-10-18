import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CASINO_RECORD_KEY } from '../domain/casinoRecord';
import { PRIZE_LEDGER_KEY } from '../../prizes/ledgerStorage';
import Casino from './Casino';

// jsdom has no WebGL, so the casino runs on its honest flat fallback: the
// same engine, panels, prizes and persistence, without the 3D room.

function mount(onComplete = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <Casino onComplete={onComplete} />
    </MemoryRouter>,
  );
  return { ...view, onComplete };
}

const stored = (key: string) =>
  JSON.parse(window.localStorage.getItem(key) ?? 'null');

/** Advances in small steps so React can flush effects between timers. */
async function advance(ms: number) {
  for (let spent = 0; spent < ms; spent += 100) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(100, ms - spent));
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

async function playRoulette() {
  fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
  const roulette = screen.getByRole('region', { name: 'Roulette' });
  fireEvent.click(within(roulette).getByRole('button', { name: 'Red' }));
  fireEvent.click(within(roulette).getByRole('button', { name: /^Spin/ }));
  return roulette;
}

describe('entering the casino', () => {
  it('welcomes her, shows her chips and offers both games and the way back', async () => {
    mount();
    expect(
      screen.getByRole('heading', { name: 'The Grand Casino' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Madam, the tables have been prepared exclusively for your arrival.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('1000 chips')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Roulette/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^The Machine/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Lounge/ })).toHaveAttribute(
      'href',
      '/',
    );
    await advance(0);
    expect(stored(CASINO_RECORD_KEY).visits).toBe(1);
  });

  it('greets a returning member differently and never repeats the first welcome', async () => {
    window.localStorage.setItem(
      CASINO_RECORD_KEY,
      JSON.stringify({
        version: 1,
        chips: 640,
        spins: { roulette: 2, slots: 1 },
        visits: 3,
        soundOn: true,
      }),
    );
    mount();
    expect(
      screen.queryByText(/prepared exclusively for your arrival/),
    ).toBeNull();
    expect(screen.getByLabelText('640 chips')).toBeInTheDocument();
  });

  it('starts fresh, without crashing, when stored progress is corrupt', () => {
    window.localStorage.setItem(PRIZE_LEDGER_KEY, '{nope');
    window.localStorage.setItem(CASINO_RECORD_KEY, '[1,2');
    mount();
    expect(screen.getByLabelText('1000 chips')).toBeInTheDocument();
  });
});

describe('roulette', () => {
  it('needs a chip before it will spin', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
    const roulette = screen.getByRole('region', { name: 'Roulette' });
    expect(
      within(roulette).getByRole('button', { name: /^Spin/ }),
    ).toBeDisabled();
    fireEvent.click(within(roulette).getByRole('button', { name: 'Red' }));
    expect(
      within(roulette).getByRole('button', { name: /Red, 10 chips placed/ }),
    ).toBeInTheDocument();
    expect(
      within(roulette).getByRole('button', { name: /^Spin/ }),
    ).toBeEnabled();
  });

  it('places, undoes and clears chips', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
    const roulette = screen.getByRole('region', { name: 'Roulette' });
    fireEvent.click(within(roulette).getByRole('button', { name: '50 chip' }));
    fireEvent.click(within(roulette).getByRole('button', { name: 'Black' }));
    fireEvent.click(within(roulette).getByRole('button', { name: 'Odd' }));
    expect(
      within(roulette).getByRole('button', { name: /Spin/ }),
    ).toHaveTextContent('100 chips');
    fireEvent.click(within(roulette).getByRole('button', { name: 'Undo' }));
    expect(
      within(roulette).getByRole('button', { name: /Spin/ }),
    ).toHaveTextContent('50 chips');
    fireEvent.click(within(roulette).getByRole('button', { name: 'Clear' }));
    expect(
      within(roulette).getByRole('button', { name: /Spin/ }),
    ).toBeDisabled();
  });

  it('offers every number from a drawer', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
    const roulette = screen.getByRole('region', { name: 'Roulette' });
    fireEvent.click(
      within(roulette).getByRole('button', { name: /Bet on a number/ }),
    );
    const numbers = within(roulette).getByRole('group', {
      name: 'Number bets',
    });
    expect(within(numbers).getAllByRole('button')).toHaveLength(38); // 0–36 and Done
    fireEvent.click(within(numbers).getByRole('button', { name: 'Number 17' }));
    expect(
      within(numbers).getByRole('button', {
        name: /Number 17, 10 chips placed/,
      }),
    ).toBeInTheDocument();
  });

  it('completes a spin, shows the engine’s result and a prize she can claim', async () => {
    mount();
    const roulette = await playRoulette();
    expect(
      screen.getByText('No more bets. The ball is in play…'),
    ).toBeInTheDocument();
    // The result is already saved while the wheel is still turning.
    expect(stored(CASINO_RECORD_KEY).spins.roulette).toBe(1);
    expect(stored(PRIZE_LEDGER_KEY).grants['casino.first-fortune'].status).toBe(
      'unclaimed',
    );
    await advance(5000);
    const outcome = roulette.ownerDocument.querySelector('.outcome');
    expect(outcome).toHaveAttribute('data-won', 'true');
    expect(screen.getByLabelText('1010 chips')).toBeInTheDocument();
    // The butler remarks on the win; then the prize is revealed.
    await advance(1200);
    const reveal = screen.getByRole('dialog', { name: 'The First Fortune' });
    expect(reveal).toBeInTheDocument();
    expect(
      within(reveal).getByRole('button', { name: 'Add to my collection' }),
    ).toBeDisabled();
    await advance(3000);
    const add = within(reveal).getByRole('button', {
      name: 'Add to my collection',
    });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(stored(PRIZE_LEDGER_KEY).grants['casino.first-fortune'].status).toBe(
      'claimed',
    );
    fireEvent.click(within(reveal).getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores rapid repeated taps on Spin: one spin, one result', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
    const roulette = screen.getByRole('region', { name: 'Roulette' });
    fireEvent.click(within(roulette).getByRole('button', { name: 'Red' }));
    const spin = within(roulette).getByRole('button', { name: /^Spin/ });
    fireEvent.click(spin);
    fireEvent.click(spin);
    fireEvent.click(spin);
    await advance(6000);
    expect(stored(CASINO_RECORD_KEY).spins.roulette).toBe(1);
  });

  it('skips the reveal without losing the prize, which waits to be claimed', async () => {
    mount();
    await playRoulette();
    await advance(7000);
    const reveal = screen.getByRole('dialog', { name: 'The First Fortune' });
    fireEvent.click(within(reveal).getByRole('button', { name: 'Skip' }));
    fireEvent.click(
      within(reveal).getByRole('button', { name: 'Keep it for later' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(stored(PRIZE_LEDGER_KEY).grants['casino.first-fortune'].status).toBe(
      'unclaimed',
    );
    expect(
      screen.getByRole('button', { name: 'A prize is waiting' }),
    ).toBeInTheDocument();
  });

  it('shows the prize again after a refresh in the middle of a reveal', async () => {
    const first = mount();
    await playRoulette();
    await advance(4000); // refresh with the wheel still turning
    first.unmount();
    mount();
    await advance(2500);
    expect(
      screen.getByRole('dialog', { name: 'The First Fortune' }),
    ).toBeInTheDocument();
    // The spin already counted: she was not charged twice or given a second prize.
    expect(stored(CASINO_RECORD_KEY).spins.roulette).toBe(1);
    expect(Object.keys(stored(PRIZE_LEDGER_KEY).grants)).toEqual([
      'casino.first-fortune',
    ]);
  });

  it('keeps the way back to the lobby disabled while the ball is in play', async () => {
    mount();
    await playRoulette();
    expect(screen.getByRole('button', { name: /Lobby/ })).toBeDisabled();
    await advance(6000);
    expect(screen.getByRole('button', { name: /Lobby/ })).toBeEnabled();
  });
});

describe('slots', () => {
  it('plays the first scripted spin (a pair) and pays the chips', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^The Machine/ }));
    const slots = screen.getByRole('region', { name: 'Slot machine' });
    fireEvent.click(
      within(slots).getByRole('button', { name: /Pull the lever/ }),
    );
    expect(
      within(slots).getByText('The reels are turning…'),
    ).toBeInTheDocument();
    await advance(4000);
    const outcome = slots.querySelector('.outcome');
    expect(outcome).toHaveAttribute('data-won', 'true');
    expect(within(slots).getByText(/A pair:/)).toBeInTheDocument();
    // 10 staked, 20 won plus the stake returned: net +20.
    expect(screen.getByLabelText('1020 chips')).toBeInTheDocument();
    expect(stored(PRIZE_LEDGER_KEY).grants['casino.gilded-reel']).toBeDefined();
  });

  it('lists the paytable on request', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^The Machine/ }));
    fireEvent.click(screen.getByRole('button', { name: 'The paytable' }));
    const table = screen.getByRole('list', { name: 'Paytable' });
    expect(within(table).getAllByRole('listitem')).toHaveLength(8);
    expect(within(table).getByText('Three Thirties')).toBeInTheDocument();
  });

  it('refuses a spin she cannot afford, plainly', () => {
    window.localStorage.setItem(
      CASINO_RECORD_KEY,
      JSON.stringify({
        version: 1,
        chips: 5,
        spins: { roulette: 0, slots: 0 },
        visits: 1,
        soundOn: true,
      }),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^The Machine/ }));
    expect(
      screen.getByRole('button', { name: /Pull the lever/ }),
    ).toBeDisabled();
  });
});

describe('navigation, collection and persistence', () => {
  it('moves between the lobby and the games, and offers the lounge from the lobby', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
    expect(
      screen.queryByRole('navigation', { name: 'Choose a game' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Lobby/ }));
    expect(
      screen.getByRole('navigation', { name: 'Choose a game' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^The Machine/ }));
    expect(
      screen.getByRole('region', { name: 'Slot machine' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lobby/ }));
    expect(screen.getByRole('link', { name: /Lounge/ })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('lists the collection: locked prizes stay hidden, won ones are shown', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Your collection' }));
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    expect(within(sheet).getByText('0 of 6 won')).toBeInTheDocument();
    expect(within(sheet).getAllByText('A prize yet to be won')).toHaveLength(6);
    expect(within(sheet).queryByText('Vault Key I')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps chips, spins and claimed prizes across a reload', async () => {
    const first = mount();
    await playRoulette();
    await advance(7000);
    const reveal = screen.getByRole('dialog', { name: 'The First Fortune' });
    await advance(3000);
    fireEvent.click(
      within(reveal).getByRole('button', { name: 'Add to my collection' }),
    );
    fireEvent.click(within(reveal).getByRole('button', { name: 'Continue' }));
    first.unmount();
    mount();
    await advance(3000);
    expect(screen.getByLabelText('1010 chips')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Your collection' }));
    const sheet = screen.getByRole('dialog', { name: 'Your collection' });
    expect(within(sheet).getByText('1 of 6 won')).toBeInTheDocument();
    expect(within(sheet).getByText('The First Fortune')).toBeInTheDocument();
    expect(within(sheet).getByText(/Claimed/)).toBeInTheDocument();
  });

  it('shows an already-claimed vault code in the collection, never again as a reveal', async () => {
    const at = '2026-10-24T20:00:00.000Z';
    window.localStorage.setItem(
      PRIZE_LEDGER_KEY,
      JSON.stringify({
        version: 1,
        counters: { 'slots.jackpots': 1 },
        grants: {
          'casino.vault-key-one': {
            awardedAt: at,
            status: 'claimed',
            claimedAt: at,
          },
        },
      }),
    );
    mount();
    await advance(3000);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Your collection' }));
    expect(screen.getByText('TC-0000')).toBeInTheDocument();
  });

  it('tells the room it is complete once every prize is claimed', async () => {
    const at = '2026-10-24T20:00:00.000Z';
    const grants = Object.fromEntries(
      [
        'casino.first-fortune',
        'casino.croupiers-clue',
        'casino.lucky-number',
        'casino.gilded-reel',
        'casino.vault-key-one',
        'casino.house-favour',
      ].map((id) => [id, { awardedAt: at, status: 'claimed', claimedAt: at }]),
    );
    window.localStorage.setItem(
      PRIZE_LEDGER_KEY,
      JSON.stringify({ version: 1, counters: {}, grants }),
    );
    const { onComplete } = mount();
    await advance(10);
    expect(onComplete).toHaveBeenCalled();
    expect(
      screen.getByText(/won everything the house has to give/),
    ).toBeInTheDocument();
  });

  it('closes the table at the spin limit and says so', async () => {
    window.localStorage.setItem(
      CASINO_RECORD_KEY,
      JSON.stringify({
        version: 1,
        chips: 900,
        spins: { roulette: 80, slots: 0 },
        visits: 2,
        soundOn: true,
      }),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Roulette/ }));
    const roulette = screen.getByRole('region', { name: 'Roulette' });
    fireEvent.click(within(roulette).getByRole('button', { name: 'Red' }));
    fireEvent.click(within(roulette).getByRole('button', { name: /^Spin/ }));
    expect(
      within(roulette).getByText('The tables are closed for the evening.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The tables are closing for the evening, Madam/),
    ).toBeInTheDocument();
  });

  it('toggles and remembers the sound preference', () => {
    mount();
    const sound = screen.getByRole('button', { name: 'Sound on' });
    fireEvent.click(sound);
    expect(screen.getByRole('button', { name: 'Sound off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(stored(CASINO_RECORD_KEY).soundOn).toBe(false);
  });
});

describe('reduced motion', () => {
  it('shows a prize reveal complete at once, with no waiting for the animation', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    window.localStorage.setItem(
      PRIZE_LEDGER_KEY,
      JSON.stringify({
        version: 1,
        counters: { 'roulette.wins': 1 },
        grants: {
          'casino.first-fortune': {
            awardedAt: '2026-10-24T20:00:00.000Z',
            status: 'unclaimed',
          },
        },
      }),
    );
    mount();
    await advance(400);
    const reveal = screen.getByRole('dialog', { name: 'The First Fortune' });
    expect(
      within(reveal).getByRole('button', { name: 'Add to my collection' }),
    ).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
