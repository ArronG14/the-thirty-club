import { useState } from 'react';
import { SLOT_RULES } from '../config/casinoRules';
import {
  PAIR_PAYOUT,
  PAYOUT,
  SYMBOL_NAMES,
  type SlotEvaluation,
  type SlotSymbol,
} from '../domain/slots';
import { describeSlotResult } from './slotText';
import { SymbolIcon } from './SymbolIcon';

export type SlotsPhase = 'ready' | 'spinning' | 'result';

const PAYTABLE: readonly SlotSymbol[] = [
  'thirty',
  'emblem',
  'key',
  'crown',
  'diamond',
  'champagne',
  'rose',
];

export function SlotsPanel({
  phase,
  result,
  net,
  chips,
  message,
  onSpin,
  spinsLeft,
}: {
  phase: SlotsPhase;
  result: SlotEvaluation | null;
  /** Chips gained or lost on the last spin. */
  net: number;
  chips: number;
  message: string | null;
  onSpin(): void;
  spinsLeft: number | null;
}) {
  const [table, setTable] = useState(false);
  const affordable = chips >= SLOT_RULES.stake;
  const spinning = phase === 'spinning';

  return (
    <section className="panel panel--slots" aria-label="Slot machine">
      {result && phase === 'result' && (
        <div
          className="outcome"
          data-won={result.class !== 'miss' ? 'true' : 'false'}
          role="status"
        >
          <span className="outcome__line" aria-hidden="true">
            {result.line.map((symbol, i) => (
              <SymbolIcon key={i} symbol={symbol} decorative />
            ))}
          </span>
          <p className="outcome__text">
            <strong>{describeSlotResult(result)}</strong>
            <span>
              {net > 0
                ? `You won ${net + SLOT_RULES.stake} chips`
                : `${SLOT_RULES.stake} chips to the house`}
            </span>
          </p>
        </div>
      )}
      {message && (
        <p className="panel__note" role="alert">
          {message}
        </p>
      )}
      {spinning && (
        <p className="panel__status" role="status">
          The reels are turning…
        </p>
      )}
      <button
        type="button"
        className="spin spin--wide"
        onClick={onSpin}
        disabled={spinning || !affordable}
      >
        Pull the lever
        <small>{SLOT_RULES.stake} chips a spin</small>
      </button>
      <p className="panel__fine">
        {chips.toLocaleString('en-GB')} chips held
        {spinsLeft !== null && spinsLeft <= 10
          ? spinsLeft === 0
            ? ' · the machine is resting for the evening'
            : ` · ${spinsLeft} spins left`
          : ''}
      </p>
      <button
        type="button"
        className="panel__link"
        aria-expanded={table}
        onClick={() => setTable((v) => !v)}
      >
        {table ? 'Hide the paytable' : 'The paytable'}
      </button>
      {table && (
        <ul className="paytable" aria-label="Paytable">
          {PAYTABLE.map((symbol) => (
            <li key={symbol}>
              <SymbolIcon symbol={symbol} />
              <span>
                {symbol === 'thirty'
                  ? 'Three Thirties'
                  : `Three ${SYMBOL_NAMES[symbol].toLowerCase()}s`}
              </span>
              <b>{PAYOUT[symbol]}×</b>
            </li>
          ))}
          <li>
            <span className="paytable__pair" aria-hidden="true">
              ◆ ◆
            </span>
            <span>Any pair, from the left</span>
            <b>{PAIR_PAYOUT}×</b>
          </li>
        </ul>
      )}
    </section>
  );
}
