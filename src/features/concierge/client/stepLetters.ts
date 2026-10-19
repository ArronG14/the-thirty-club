/**
 * The concierge's letters on the step of the locked entrance (Phase One,
 * then "Your Departure Lounge is ready"). Each is a separate letter: unread
 * it waits at the doors; once opened it leaves the step and stays in My
 * Correspondence; the next one arrives unread. Opened letters are recorded
 * on this device (rehearsal: in the tab's rehearsal storage, ADR-018).
 */
import { DEPARTURE_LOUNGE_OPENS } from '../domain/catalogue';
import { instantOf } from '../domain/time';
import { deviceStorage } from '../../rehearsal/storage';
import { realmKey } from './sessionStore';

export type StepLetterId = 'phase-one' | 'departure-ready';

export interface StepLetter {
  id: StepLetterId;
  title: string;
  deliveredAt: number;
  opened: boolean;
}

export const STEP_LETTERS_EVENT = 'thirty-club:step-letters';

const key = () => realmKey('step-letters');

function openedIds(): StepLetterId[] {
  try {
    const value: unknown = JSON.parse(deviceStorage().getItem(key()) ?? '[]');
    return Array.isArray(value)
      ? value.filter(
          (x): x is StepLetterId =>
            x === 'phase-one' || x === 'departure-ready',
        )
      : [];
  } catch {
    return [];
  }
}

/** The letters delivered by `now`, newest first. */
export function stepLetters(now: number): StepLetter[] {
  const opened = openedIds();
  const readyAt = instantOf(DEPARTURE_LOUNGE_OPENS);
  const list: StepLetter[] = [
    {
      id: 'phase-one',
      title: 'A letter from the concierge',
      // Present from the start of the pre-birthday journey.
      deliveredAt: Date.parse('2026-10-17T00:00:00Z'),
      opened: opened.includes('phase-one'),
    },
  ];
  if (now >= readyAt)
    list.unshift({
      id: 'departure-ready',
      title: 'Your Departure Lounge is ready',
      deliveredAt: readyAt,
      opened: opened.includes('departure-ready'),
    });
  return list;
}

export function markStepLetterOpened(id: StepLetterId) {
  const opened = openedIds();
  if (opened.includes(id)) return;
  try {
    deviceStorage().setItem(key(), JSON.stringify([...opened, id]));
  } catch {
    // The letter simply remains on the step a little longer.
  }
  window.dispatchEvent(new Event(STEP_LETTERS_EVENT));
}
