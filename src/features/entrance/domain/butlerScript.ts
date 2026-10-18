import type { EntranceStage } from './entranceMachine';

/**
 * Scripted butler dialogue. No live AI: every line is written, reviewed and
 * shipped in the bundle. Copy remains subject to owner approval (D02).
 */

/** The lounge has its own repertoire: club/domain/loungeScript.ts. */
export type ButlerContext = 'locked' | 'final-minute' | 'awaiting-entry';

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type Line = string | ((greeting: string) => string);

const script: Record<ButlerContext, readonly Line[]> = {
  locked: [
    (greeting) =>
      `${greeting}, Alise. Your membership has been approved. Unfortunately, management insists that you turn thirty before we permit you inside.`,
    'The silver has been polished twice. Your husband offered to polish it a third time. We have since restored the silver.',
    'I am afraid the doors remain locked. I have checked. Repeatedly. Once at your husband’s request, and several times since out of professional pride.',
    'Your husband enquired whether the doors might open a little early. I explained that the club does not do “a little early”. We do “precisely on time”.',
    'The champagne is chilling, the staff are rehearsing, and your husband is pacing. Everything is proceeding exactly as planned.',
    'Might I suggest patience, Alise? It has served the club admirably for thirty years.',
    'Rest assured, every detail is in hand. Several were in your husband’s hands first. We have quietly seen to them.',
  ],
  'final-minute': [
    'Any moment now, Alise. Forgive me — I must straighten my tie.',
    'The staff have taken their places. Your husband has been asked to stop helping.',
    'Do stand clear of the doors, madam. They have waited thirty years for this; they intend to make an entrance.',
  ],
  'awaiting-entry': [
    'The doors are unlocked, Alise. They have been waiting for you. So, I confess, have I.',
    'Do go in. The club has been ready since midnight, and it is not accustomed to being kept waiting — present company excepted.',
  ],
};

export function butlerContextFor(stage: EntranceStage): ButlerContext | null {
  switch (stage) {
    case 'locked':
    case 'final-minute':
    case 'awaiting-entry':
      return stage;
    default:
      // He holds his tongue while the doors move; the lounge is his to host.
      return null;
  }
}

export function lineCount(context: ButlerContext): number {
  return script[context].length;
}

/** Lines play in authored order, then cycle; a ring never repeats itself. */
export function butlerLine(
  context: ButlerContext,
  index: number,
  hour: number,
): string {
  const lines = script[context];
  const line = lines[((index % lines.length) + lines.length) % lines.length];
  if (line === undefined) return '';
  return typeof line === 'function' ? line(greetingFor(hour)) : line;
}

export const WELCOME_LINES = [
  'Ah, Alise. There you are.',
  'We’ve been expecting you for thirty years.',
] as const;

/** Long enough to read comfortably, then the butler withdraws. */
export function speechDuration(text: string): number {
  return Math.max(7000, text.length * 65);
}
