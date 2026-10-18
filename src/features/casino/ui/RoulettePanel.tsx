import { useState } from 'react';
import { CHIPS, ROULETTE_RULES } from '../config/casinoRules';
import {
  addStake,
  betKey,
  betLabel,
  colourOf,
  totalStake,
  type PlacedBet,
  type RouletteBet,
  type Settlement,
} from '../domain/roulette';

export type RoulettePhase = 'betting' | 'spinning' | 'result';

const OUTSIDE: readonly { bet: RouletteBet; label: string; tone: string }[] = [
  { bet: { kind: 'red' }, label: 'Red', tone: 'red' },
  { bet: { kind: 'black' }, label: 'Black', tone: 'black' },
  { bet: { kind: 'odd' }, label: 'Odd', tone: 'plain' },
  { bet: { kind: 'even' }, label: 'Even', tone: 'plain' },
  { bet: { kind: 'low' }, label: '1–18', tone: 'plain' },
  { bet: { kind: 'high' }, label: '19–36', tone: 'plain' },
];

const DOZENS: readonly { bet: RouletteBet; label: string }[] = [
  { bet: { kind: 'dozen', index: 1 }, label: '1st 12' },
  { bet: { kind: 'dozen', index: 2 }, label: '2nd 12' },
  { bet: { kind: 'dozen', index: 3 }, label: '3rd 12' },
];

const NUMBERS = Array.from({ length: 36 }, (_, i) => i + 1);

export function RoulettePanel({
  chips,
  slip,
  onSlip,
  phase,
  result,
  message,
  onSpin,
  spinsLeft,
  onChip,
}: {
  chips: number;
  slip: readonly PlacedBet[];
  onSlip(next: PlacedBet[]): void;
  phase: RoulettePhase;
  result: Settlement | null;
  /** A refusal or note from the table. */
  message: string | null;
  onSpin(): void;
  spinsLeft: number | null;
  /** The player placed a chip (for the sound). */
  onChip(): void;
}) {
  const [denomination, setDenomination] = useState<number>(
    CHIPS.denominations[0],
  );
  const [numbers, setNumbers] = useState(false);
  // Each chip placed, newest last, so Undo takes back exactly one chip.
  const [history, setHistory] = useState<{ bet: RouletteBet; chips: number }[]>(
    [],
  );
  const total = totalStake(slip);
  const open = phase === 'betting' || phase === 'result';

  function place(bet: RouletteBet) {
    if (!open) return;
    if (total + denomination > ROULETTE_RULES.maxTotal) return;
    if (total + denomination > chips) return;
    onChip();
    setHistory((h) => [...h, { bet, chips: denomination }]);
    onSlip(addStake(slip, bet, denomination));
  }
  const stakeOn = (bet: RouletteBet) =>
    slip.find((b) => betKey(b.bet) === betKey(bet))?.stake ?? 0;
  const undo = () => {
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    if (!last) return;
    const key = betKey(last.bet);
    onSlip(
      slip.flatMap((b) => {
        if (betKey(b.bet) !== key) return [b];
        const stake = b.stake - last.chips;
        return stake > 0 ? [{ ...b, stake }] : [];
      }),
    );
  };
  const clear = () => {
    setHistory([]);
    onSlip([]);
  };

  const cell = (bet: RouletteBet, label: string, tone: string, extra = '') => {
    const stake = stakeOn(bet);
    return (
      <button
        key={betKey(bet)}
        type="button"
        className={`bet bet--${tone} ${extra}`}
        disabled={!open}
        aria-label={`${betLabel(bet)}${stake ? `, ${stake} chips placed` : ''}`}
        onClick={() => place(bet)}
      >
        <span className="bet__label" aria-hidden="true">
          {label}
        </span>
        {stake > 0 && (
          <span className="bet__stake" aria-hidden="true">
            {stake}
          </span>
        )}
      </button>
    );
  };

  if (phase === 'spinning') {
    return (
      <section className="panel panel--compact" aria-label="Roulette">
        <p className="panel__status" role="status">
          No more bets. The ball is in play…
        </p>
        <p className="panel__fine">{total} chips on the table</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Roulette">
      {result && phase === 'result' && (
        <div
          className="outcome"
          data-won={result.won ? 'true' : 'false'}
          role="status"
        >
          <span
            className={`outcome__number outcome__number--${result.colour}`}
            aria-hidden="true"
          >
            {result.number}
          </span>
          <p className="outcome__text">
            <strong>
              {result.number} {result.colour}
            </strong>
            <span>
              {result.won
                ? `You won ${result.net} chips`
                : result.net === 0
                  ? 'Your stake is returned'
                  : `No win. ${-result.net} chips to the house`}
            </span>
          </p>
        </div>
      )}
      {message && (
        <p className="panel__note" role="alert">
          {message}
        </p>
      )}

      {numbers ? (
        <div className="numbers" role="group" aria-label="Number bets">
          {cell({ kind: 'straight', number: 0 }, '0', 'green', 'numbers__zero')}
          {NUMBERS.map((n) =>
            cell({ kind: 'straight', number: n }, String(n), colourOf(n)),
          )}
          <button
            type="button"
            className="panel__done"
            onClick={() => setNumbers(false)}
          >
            Done
          </button>
        </div>
      ) : (
        <>
          <div className="chips" role="group" aria-label="Chip value">
            {CHIPS.denominations.map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                data-value={value}
                aria-pressed={denomination === value}
                aria-label={`${value} chip`}
                onClick={() => setDenomination(value)}
              >
                {value}
              </button>
            ))}
            <span className="chips__held" aria-label={`${chips} chips held`}>
              {chips.toLocaleString('en-GB')}
              <small>chips</small>
            </span>
          </div>
          <div className="bets" role="group" aria-label="Outside bets">
            {OUTSIDE.map(({ bet, label, tone }) => cell(bet, label, tone))}
          </div>
          <div className="bets bets--dozens" role="group" aria-label="Dozens">
            {DOZENS.map(({ bet, label }) => cell(bet, label, 'plain'))}
          </div>
          <button
            type="button"
            className="panel__link"
            onClick={() => setNumbers(true)}
          >
            Bet on a number · pays 35 to 1
          </button>
        </>
      )}

      <div className="panel__footer">
        <button
          type="button"
          className="panel__quiet"
          onClick={undo}
          disabled={!open || history.length === 0}
        >
          Undo
        </button>
        <button
          type="button"
          className="panel__quiet"
          onClick={clear}
          disabled={!open || slip.length === 0}
        >
          Clear
        </button>
        <button
          type="button"
          className="spin"
          onClick={onSpin}
          disabled={!open || slip.length === 0}
        >
          Spin
          <small>{total > 0 ? `${total} chips` : 'place a chip'}</small>
        </button>
      </div>
      {spinsLeft !== null && spinsLeft <= 10 && (
        <p className="panel__fine">
          {spinsLeft === 0
            ? 'The table is closed for the evening.'
            : `${spinsLeft} spins left this evening`}
        </p>
      )}
    </section>
  );
}
