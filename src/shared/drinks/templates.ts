/**
 * The two drinks privileges (ADR-024). Shared by the server (the owner's SMS)
 * and the member interface (the copy she reads).
 *
 * Airport: TWO complimentary drinks after security; her husband pays.
 * Jamaica: THREE "Bring Me a Drink" vouchers, won at the Casino and claimed by
 * her; the resort is all-inclusive, so the privilege is the delivery: the
 * owner asks the staff to bring the drink to her wherever she is. She is
 * never asked for a location (the owner is with her).
 *
 * Member-facing wording is PROPOSED (the Story Bible was not available to the
 * engineer); owner-facing SMS wording is operational.
 */
export type DrinkKind = 'airport' | 'jamaica';

export const DRINK_KINDS: readonly DrinkKind[] = ['airport', 'jamaica'];

export const isDrinkKind = (value: unknown): value is DrinkKind =>
  value === 'airport' || value === 'jamaica';

/**
 * The owner's SMS. `{beverage}` is her exact choice; `{remaining}` and
 * `{granted}` are that balance after this request.
 */
export const DRINK_NOTIFICATIONS: Record<DrinkKind, string> = {
  airport:
    'THE THIRTY CLUB — AIRPORT DRINK. Alise would like: {beverage}. Please get it for her (yours to pay). Airport drinks left: {remaining} of {granted}.',
  jamaica:
    'THE THIRTY CLUB — BRING ME A DRINK. Alise would like: {beverage}. Please ask the resort staff to bring it to her. Jamaica drinks left: {remaining} of {granted}.',
};

export interface DrinkCopy {
  title: string;
  eyebrow: string;
  intro: string;
  prompt: string;
  placeholder: string;
  submit: string;
  confirmation: string;
  none: string;
}

/** PROPOSED wording, in the Butler's voice. */
export const DRINK_COPY: Record<DrinkKind, DrinkCopy> = {
  airport: {
    eyebrow: 'Departure privilege',
    title: 'Two drinks before the flight',
    intro:
      'With the club’s compliments, Madam. Name your drink and I shall pass word to your husband, who has kindly agreed to settle the bill.',
    prompt: 'What may I bring you?',
    placeholder: 'A glass of champagne, perhaps',
    submit: 'Request this drink',
    confirmation:
      'Very good, Madam. Word has gone to your husband; it will be with you shortly.',
    none: 'No airport drink vouchers are currently available.',
  },
  jamaica: {
    eyebrow: 'Bring Me a Drink',
    title: 'Bring Me a Drink',
    intro:
      'Wherever you happen to be, Madam, you need only name it. It will be brought to you.',
    prompt: 'What would you like brought to you?',
    placeholder: 'A rum punch, perhaps',
    submit: 'Bring me this drink',
    confirmation:
      'Consider it done, Madam. It is on its way to you — do not move a muscle.',
    none: 'No Bring Me a Drink vouchers are currently available.',
  },
};

export const MAX_BEVERAGE_LENGTH = 300;
