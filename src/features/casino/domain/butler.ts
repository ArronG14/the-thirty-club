/**
 * The butler in the casino. Scripted, never live AI. Lines are grouped by
 * moment; `nextLine` walks a pool without repeating the last line, so a
 * short run of wins or losses never sounds recorded. Copy is subject to
 * owner approval, like all butler dialogue (D02).
 */
import type { RewardKind } from '../../prizes/rewards';

export type CasinoMoment =
  | 'enter-first'
  | 'enter-return'
  | 'roulette-open'
  | 'slots-open'
  | 'roulette-win'
  | 'roulette-straight'
  | 'roulette-lose'
  | 'slots-pair'
  | 'slots-triple'
  | 'slots-miss'
  | 'top-up'
  | 'closing'
  | 'complete'
  | `reward-${RewardKind}`;

export const CASINO_LINES: Record<CasinoMoment, readonly string[]> = {
  'enter-first': [
    'Madam, the tables have been prepared exclusively for your arrival.',
    'Welcome to the Grand Casino, Alise. It is not open to the public. It is not, strictly speaking, open to anyone but you.',
  ],
  'enter-return': [
    'Welcome back, Madam. The wheel has been polished in your absence.',
    'The house is delighted to see you again, Alise. It has been rehearsing its composure.',
    'Your usual table, Madam. We have not changed it. We have not had a usual before, but we are confident.',
  ],
  'roulette-open': [
    'A little risk is perfectly acceptable on one’s thirtieth birthday.',
    'The croupier asks me to say that the ball is entirely impartial. I have my doubts.',
  ],
  'slots-open': [
    'The machine was imported at considerable expense, Madam. It is hoping to be worth it.',
    'Do pull gently, Alise. It has been through a great deal.',
  ],
  'roulette-win': [
    'An excellent decision, Madam. Fortune appears to know whose birthday it is.',
    'The wheel has spoken, and for once it said something agreeable.',
    'Splendid. The croupier is pretending not to be pleased.',
  ],
  'roulette-straight': [
    'A single number, called correctly. I shall be telling the staff about this for years.',
    'Thirty-five to one, Madam. The house is, I believe, applauding quietly.',
  ],
  'roulette-lose': [
    'A temporary setback. The house remains most optimistic.',
    'The ball has a mischievous streak. It will be spoken to.',
    'One does not lose at the Grand Casino, Madam. One merely postpones winning.',
  ],
  'slots-pair': [
    'Two of a kind, Madam. The third reel is, I am told, shy.',
    'A modest win. The machine is warming to you.',
  ],
  'slots-triple': [
    'Three alike. The machine has quite lost its composure.',
    'A splendid alignment, Alise. I shall make a note.',
  ],
  'slots-miss': [
    'The reels were close, Madam. They send their regrets.',
    'Nothing this time. The machine, I suspect, is saving itself.',
    'A near thing. Do try again; it is only chips, and it is only your birthday.',
  ],
  'top-up': [
    'The house has taken the liberty of replenishing your chips. It insists.',
  ],
  closing: [
    'The tables are closing for the evening, Madam. The house has enjoyed your company enormously.',
  ],
  complete: [
    'You have won everything the house has to give, Alise. It is a little embarrassed, and rather proud.',
  ],
  'reward-collectible': [
    'A keepsake, Madam. The house does not give these to just anyone. It gives them to you.',
  ],
  'reward-clue': [
    'Ah. A clue. I am not at liberty to say what it points to, but I am quite sure it is worth following.',
  ],
  'reward-vault-code': [
    'How intriguing. It appears you’ve acquired access to something rather special.',
  ],
  'reward-privilege': [
    'A privilege, Madam. The staff have been asked to treat it with the utmost seriousness.',
  ],
  'reward-mystery': [
    'I confess I do not know what this is. That is the best sort of surprise.',
  ],
};

/**
 * Picks the next line for a moment, avoiding `previous` when there is a
 * choice. `cursor` makes the choice deterministic and testable: the caller
 * keeps a counter per moment, so the pool is walked in order and cycles.
 */
export function nextLine(
  moment: CasinoMoment,
  cursor: number,
  previous?: string | null,
): string {
  const pool = CASINO_LINES[moment];
  const line = pool[cursor % pool.length]!;
  if (line === previous && pool.length > 1)
    return pool[(cursor + 1) % pool.length]!;
  return line;
}
