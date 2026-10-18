import { SYMBOL_NAMES, type SlotEvaluation } from '../domain/slots';

export function describeSlotResult(e: SlotEvaluation): string {
  const name = e.symbol ? SYMBOL_NAMES[e.symbol] : '';
  switch (e.class) {
    case 'jackpot':
      return 'Three Thirties. The jackpot.';
    case 'triple':
      return `Three alike: ${name.toLowerCase()}`;
    case 'pair':
      return `A pair: ${name.toLowerCase()}`;
    case 'miss':
      return 'No win this time';
  }
}
