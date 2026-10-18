/**
 * The Butler in the Gift Vault. Scripted, no live AI. Nothing here, or in
 * any line he speaks, names or describes a physical present: he speaks of
 * deposit boxes, keys and envelopes only.
 */
import type { MemberVault } from '../../../shared/concierge/types';

export const plate = (n: number) => String(n).padStart(3, '0');

export const VAULT_LINES = {
  arrival:
    'Welcome to the Private Gift Vault, Alise. Every box in this room is spoken for. A few of them are spoken for by you.',
  arrivalQuiet:
    'The vault is yours to wander, Alise. Your opened compartments keep their envelopes for you; the dark ones are keeping their counsel.',
  nothingReady:
    'None of your compartments has been prepared just yet, Alise. When one is, I shall be the first to tell you.',
  allOpened:
    'Every one of your compartments has been opened, Madam. You may revisit any of them; the envelopes will wait for you.',
  timeLocked:
    'The vault is sealed until your birthday, Alise. A time-lock, I’m afraid. Even I am not permitted to argue with it.',
  locked: (n: number) =>
    `Compartment ${plate(n)} remains sealed, Madam. Its moment has not yet come.`,
  readyIntro: (n: number) =>
    `Compartment ${plate(n)}. Prepared in your name, and locked tight. The key, regrettably, has wandered off.`,
  clueLead:
    'A most curious predicament, Madam. I am told the key was last seen…',
  howToScan:
    'When you find it, simply hold the top of your iPhone to it. The vault will recognise its own key.',
  codeLead:
    'If the key will not speak to your telephone, its engraved code will serve just as well.',
  keyAccepted: 'Splendid. The key is genuine, and it fits. Shall we?',
  keyAcceptedAgain:
    'Ah, this key has been here before. The compartment is already open, Madam; your envelope is just where you left it.',
  turning: 'Steady now…',
  revealed: 'There we are, Madam. The vault has kept its word.',
  revisit: (n: number) =>
    `Compartment ${plate(n)}, as you left it. Your envelope, Madam.`,
  wrongKey:
    'How peculiar. The vault does not recognise this key. Might it belong to some other establishment?',
  lockedKey:
    'The key is genuine, Madam, but its compartment has not yet been prepared. Hold on to it; its time will come.',
  tooEarly:
    'That key is quite genuine, but the vault’s time-lock holds until your birthday. Patience, Madam. Not long now.',
  tooMany:
    'The vault has grown wary of so many attempts. Give it a few minutes to compose itself.',
  needsMembership:
    'Before the vault will answer, Madam, it asks to see your membership. A formality, but the vault is a stickler.',
  unavailable:
    'The vault is not answering just now. Nothing has been lost; please try again in a moment.',
  ownerTag: (n: number) =>
    `Owner rehearsal. This tag opens compartment ${plate(n)}. Nothing has been changed or recorded.`,
} as const;

/**
 * Spoken once when a compartment first becomes ready (the brief's
 * announcement), as separate beats so each can be read at a gentle pace.
 */
export const ANNOUNCEMENT = [
  'Madam, I am delighted to inform you that a private deposit box has been prepared in your name.',
  'There is, however, a small complication. The key appears to have been misplaced.',
  'How terribly inconvenient. Might I suggest a little investigation?',
] as const;

export function stateLabel(vault: Pick<MemberVault, 'state'>): string {
  switch (vault.state) {
    case 'locked':
      return 'Sealed';
    case 'ready':
      return 'Prepared for you';
    case 'opened':
      return 'Opened';
  }
}

/** The line for walking in, given what is waiting. */
export function arrivalLine(vaults: readonly MemberVault[], open: boolean) {
  if (!open) return VAULT_LINES.timeLocked;
  if (vaults.some((v) => v.state === 'ready')) return VAULT_LINES.arrival;
  if (vaults.length > 0 && vaults.every((v) => v.state === 'opened'))
    return VAULT_LINES.allOpened;
  if (vaults.some((v) => v.state === 'opened')) return VAULT_LINES.arrivalQuiet;
  return VAULT_LINES.nothingReady;
}
