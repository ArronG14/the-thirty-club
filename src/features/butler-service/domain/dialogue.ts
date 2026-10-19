/**
 * The Butler's repertoire for his service: scripted, never generated. Each
 * recurring moment has several carefully written variations so he never
 * says the same thing twice in a row. Copy remains subject to owner approval.
 */

export type ButlerMoment =
  | 'unread-greeting'
  | 'ring'
  | 'correspondence'
  | 'request-received'
  | 'thanks'
  | 'departure';

export const BUTLER_LINES: Record<ButlerMoment, readonly string[]> = {
  /** Welcoming Alise when unread correspondence is waiting. */
  'unread-greeting': [
    'Ah, welcome back, Madam. I do hope I am not interrupting, but a little correspondence has arrived in your absence.',
    'Good to see you, Madam. Something arrived for you while you were away. I took the liberty of keeping it warm.',
    'Madam. A letter came for you with rather particular instructions: it was to be handed to no one else. I have guarded it accordingly.',
    'Forgive the formality, Madam, but the post has been. One envelope bears your name, and a very fine seal.',
    'Welcome, Madam. I have resisted the temptation to read what has arrived for you. It was considerable temptation.',
    'Ah, Madam, perfect timing. The post brought something for you, and I have been loitering by the door ever since.',
  ],
  /** Responding when she rings for service. */
  ring: [
    'You rang, Madam? How may I be of service?',
    'At your service, Madam. Your letters, or a word in confidence?',
    'Madam. I was hoping you might ring. What may I do for you?',
    'Right away, Madam. I am entirely at your disposal.',
    'The bell has been answered, Madam, as it always will be. How may I help?',
    'Madam, I came as quickly as decorum allows. What shall it be?',
  ],
  /** Introducing her correspondence collection. */
  correspondence: [
    'Your correspondence, Madam, kept in the order it arrived. The newest is on top.',
    'Every letter addressed to you, Madam, sealed or otherwise. I have dusted them all.',
    'Here is your correspondence, Madam. I have taken great care not to read a word.',
    'Your letters, Madam. Unopened ones are marked, should you wish to begin there.',
    'All of your post, Madam, exactly as it was delivered to the club.',
    'Your private correspondence, Madam. Take all the time you wish.',
  ],
  /** Acknowledging a submitted request. Truthful: received, not fulfilled. */
  'request-received': [
    'Very good, Madam. Your request is written in the club’s book, and I shall see that it is placed before Arron directly.',
    'Noted with the greatest care, Madam. I shall pass it along at once, and let you know what comes of it.',
    'Consider it received, Madam. Arron will have it in his hands shortly. I promise nothing on his behalf, but I shall certainly mention that you asked nicely.',
    'Thank you, Madam. Your words are safely recorded and on their way to Arron. I shall attend to any reply the moment it arrives.',
    'Received and recorded, Madam. I shan’t pretend it is settled until Arron says so, but it is now in the right hands.',
    'An excellent request, Madam. It is now in the club’s book, and Arron shall hear of it without delay.',
  ],
  /** Thanking her for her kind words. */
  thanks: [
    'You are most gracious, Madam. Though I must insist, the pleasure is entirely mine.',
    'Madam is too kind. I shall treasure that, and very possibly mention it to the staff.',
    'Your thanks are received with great warmth, Madam. It is a privilege to deliver your post.',
    'How very kind, Madam. A butler lives for such moments, though he would never admit it.',
    'Thank you, Madam. I shall pass your kind words on to the writer as well, naturally.',
    'You are very welcome, Madam. Should anything else arrive, you will be the first to know.',
  ],
  /** Inviting her to the Departure Lounge. */
  departure: [
    'Although the Club’s grand doors remain closed, Madam, your private Departure Lounge has been prepared. Shall I escort you?',
    'If I may, Madam: your Departure Lounge awaits, just along the corridor. The doors to the Club need not trouble us.',
    'The Departure Lounge is yours, Madam, while the main doors keep their appointment with your birthday.',
    'Madam, might I suggest the Departure Lounge? It is quiet, it is private, and it has been prepared for you alone.',
    'Your journey has its own lounge, Madam. Shall we go? I will bring you back to the doors whenever you wish.',
    'The grand doors are being stubborn, Madam, but the Departure Lounge is entirely cooperative. Allow me.',
  ],
};

/** What each moment last said, for this tab: avoids immediate repetition. */
const MEMORY_KEY = 'thirty-club:butler-lines';
const memory: Partial<Record<ButlerMoment, number>> = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(MEMORY_KEY) ?? '{}') as Partial<
      Record<ButlerMoment, number>
    >;
  } catch {
    return {};
  }
})();

/**
 * The next line for a moment, never the one just said. Order is varied
 * (not merely cycled) so a rehearsal can hear every line in a few rings.
 */
export function nextLine(
  moment: ButlerMoment,
  random: () => number = Math.random,
): string {
  const lines = BUTLER_LINES[moment];
  const last = memory[moment];
  let index = Math.floor(random() * lines.length) % lines.length;
  if (lines.length > 1 && index === last) index = (index + 1) % lines.length;
  memory[moment] = index;
  try {
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* repetition avoidance is a courtesy, not a requirement */
  }
  return lines[index]!;
}

/** For rehearsal: a specific line, by position. */
export function lineAt(moment: ButlerMoment, index: number): string {
  const lines = BUTLER_LINES[moment];
  return lines[((index % lines.length) + lines.length) % lines.length]!;
}
