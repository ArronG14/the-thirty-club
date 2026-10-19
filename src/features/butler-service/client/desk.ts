/**
 * Where the Butler's service gets its letters and sends her words.
 *
 * - `liveDesk`: the Correspondence Desk API (`/api/v1/correspondence…`,
 *   `/api/v1/service/requests`). The server is the only authority.
 * - `rehearsalDesk`: Dev Mode. The same calls, answered by the simulated
 *   office in this tab (ADR-018): it cannot send an SMS, touch real
 *   correspondence or record anything for Alise.
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
import { simulationActive } from '../../rehearsal/mode';

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

/**
 * Dev Mode (ADR-018): the same desk, answered by the simulated club office
 * in this tab. Its calls never leave the browser; it is labelled so the
 * letter and composer say "rehearsal" on screen.
 */
export const rehearsalDesk: ButlerDesk = { ...liveDesk, mode: 'rehearsal' };

/** Dev Mode rehearses; everyone else is served by the club's office. */
export const activeDesk: ButlerDesk = simulationActive
  ? rehearsalDesk
  : liveDesk;
