/**
 * Where the Butler's service gets its letters and sends her words.
 *
 * - `liveDesk`: the Correspondence Desk API (`/api/v1/correspondence…`,
 *   `/api/v1/service/requests`). The server is the only authority.
 * - `rehearsalDesk`: Dev Mode (the PIN owner rehearsal, ADR-011). Letters
 *   and requests live in this tab's session storage under the owner prefix,
 *   so clearing owner progress clears them. It never calls the network: it
 *   cannot send an SMS, touch real correspondence or record anything for
 *   Alise.
 */
import type {
  MemberLetter,
  MemberLetterReply,
  MemberServiceRequest,
} from '../../../shared/concierge/types';
import {
  deskRequest,
  listLetters,
  memberStanding,
  openLetter,
  sendWord,
  thankButler,
  type DeskResult,
  type MemberStanding,
} from '../../correspondence/client/correspondenceApi';
import { ownerActive, OWNER_PREFIX } from '../../owner/session';

export interface ButlerDesk {
  mode: 'live' | 'rehearsal';
  standing(): Promise<MemberStanding>;
  letters(): Promise<DeskResult<{ letters: MemberLetter[] }>>;
  open(id: string): Promise<DeskResult<{ letter: MemberLetter }>>;
  thank(
    id: string,
  ): Promise<DeskResult<{ letter: MemberLetter; duplicate: boolean }>>;
  reply(
    id: string,
    body: string,
    key: string,
  ): Promise<DeskResult<{ reply: MemberLetterReply; duplicate: boolean }>>;
  request(
    body: string,
    key: string,
  ): Promise<DeskResult<{ request: MemberServiceRequest; duplicate: boolean }>>;
}

export const liveDesk: ButlerDesk = {
  mode: 'live',
  standing: memberStanding,
  letters: listLetters,
  open: openLetter,
  thank: thankButler,
  reply: sendWord,
  request: (body, idempotencyKey) =>
    deskRequest<{ request: MemberServiceRequest; duplicate: boolean }>(
      '/service/requests',
      { body: { body, idempotencyKey } },
    ),
};

/* ---------- Rehearsal (Dev Mode) ---------- */

interface RehearsalState {
  letters: MemberLetter[];
  requests: MemberServiceRequest[];
}

export const REHEARSAL_KEY = `${OWNER_PREFIX}thirty-club:butler-rehearsal`;

function read(): RehearsalState {
  try {
    const raw = sessionStorage.getItem(REHEARSAL_KEY);
    if (raw) return JSON.parse(raw) as RehearsalState;
  } catch {
    /* an unreadable rehearsal is an empty one */
  }
  return { letters: [], requests: [] };
}

function write(state: RehearsalState) {
  try {
    sessionStorage.setItem(REHEARSAL_KEY, JSON.stringify(state));
  } catch {
    /* rehearsal state is best-effort */
  }
  window.dispatchEvent(new Event('thirty-club:butler-rehearsal'));
}

const ok = <T>(data: T): DeskResult<T> => ({ ok: true, data });
const missing: DeskResult<never> = {
  ok: false,
  kind: 'http',
  status: 404,
  code: 'not-found',
  message: 'This record could not be found.',
};
const id = () => crypto.randomUUID();

const SAMPLES: readonly Pick<MemberLetter, 'title' | 'salutation' | 'body'>[] =
  [
    {
      title: 'Rehearsal · A word before Thursday',
      salutation: 'Dearest Alise,',
      body: 'This is a rehearsal letter, written only for Dev Mode. Nothing here was sent to you, and no message has left the club.\n\nThe real letters will arrive in exactly this way: a sealed envelope at the doors, the Butler at your side, and all the time in the world to read them.',
    },
    {
      title: 'Rehearsal · On the matter of the sea',
      salutation: 'Dearest Alise,',
      body: 'A second rehearsal letter, so that several unread letters can be seen together.\n\nIt says very little, by design. The Butler has been asked to look suitably impressed regardless.',
    },
    {
      title: 'Rehearsal · Packing, and other mysteries',
      salutation: 'My dear Alise,',
      body: 'A third rehearsal letter. It exists to show the newest letter rising to the top of your correspondence.\n\nWith love, and with no SMS whatsoever.',
    },
  ];

/** Dev Mode controls: add simulated unread letters, or clear them. */
export function rehearseLetters(count: number) {
  const state = read();
  const now = Date.now();
  const added = Array.from({ length: count }, (_, n): MemberLetter => {
    const sample = SAMPLES[(state.letters.length + n) % SAMPLES.length]!;
    return {
      id: id(),
      ...sample,
      timezone: 'Europe/London',
      deliveredAt: new Date(now - (count - n) * 1000).toISOString(),
      openedAt: null,
      thankedAt: null,
      status: 'published',
      replies: [],
    };
  });
  write({ ...state, letters: [...state.letters, ...added] });
}

export function clearRehearsal() {
  write({ letters: [], requests: [] });
}

export function rehearsalCounts() {
  const state = read();
  return {
    letters: state.letters.length,
    unread: state.letters.filter((l) => !l.openedAt).length,
    requests: state.requests.length,
  };
}

function update(letterId: string, change: (l: MemberLetter) => MemberLetter) {
  const state = read();
  const letter = state.letters.find((l) => l.id === letterId);
  if (!letter) return null;
  const next = change(letter);
  write({
    ...state,
    letters: state.letters.map((l) => (l.id === letterId ? next : l)),
  });
  return next;
}

export const rehearsalDesk: ButlerDesk = {
  mode: 'rehearsal',
  standing: async () => ({ kind: 'member' }),
  letters: async () =>
    ok({
      letters: [...read().letters].sort((a, b) =>
        b.deliveredAt.localeCompare(a.deliveredAt),
      ),
    }),
  open: async (letterId) => {
    const letter = update(letterId, (l) => ({
      ...l,
      openedAt: l.openedAt ?? new Date().toISOString(),
      status: l.thankedAt ? 'thanked' : 'opened',
    }));
    return letter ? ok({ letter }) : missing;
  },
  thank: async (letterId) => {
    const before = read().letters.find((l) => l.id === letterId);
    if (!before) return missing;
    const duplicate = Boolean(before.thankedAt);
    const letter = update(letterId, (l) => {
      const at = new Date().toISOString();
      return {
        ...l,
        openedAt: l.openedAt ?? at,
        thankedAt: l.thankedAt ?? at,
        status: 'thanked',
      };
    })!;
    return ok({ letter, duplicate });
  },
  reply: async (letterId, body) => {
    const reply = { id: id(), body, createdAt: new Date().toISOString() };
    const letter = update(letterId, (l) => ({
      ...l,
      replies: [...l.replies, reply],
    }));
    return letter ? ok({ reply, duplicate: false }) : missing;
  },
  request: async (body) => {
    const state = read();
    const request = {
      id: id(),
      body,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    write({ ...state, requests: [request, ...state.requests] });
    return ok({ request, duplicate: false });
  },
};

/** Dev Mode rehearses; everyone else is served by the club's office. */
export const activeDesk: ButlerDesk = ownerActive ? rehearsalDesk : liveDesk;
