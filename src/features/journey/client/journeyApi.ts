/**
 * The birthday journey's client (ADR-020). Every call resolves to a result
 * and nothing throws; the server is the only authority on admissions and
 * milestones. On rehearsal pages these calls are answered by the simulated
 * office in the tab (ADR-018) and never reach the real server.
 */
import type {
  HoldState,
  AcceptAdmissionResult,
  AdmissionRoomId,
  MemberJourney,
  MilestoneEffect,
  MilestoneInput,
  OwnerJourney,
  OwnerMilestone,
} from '../../../shared/journey/contract';
import type { Session } from '../../../shared/concierge/types';
import { deskRequest } from '../../correspondence/client/correspondenceApi';

export const journeyState = () => deskRequest<MemberJourney>('/journey');

export const enterClub = () =>
  deskRequest<AcceptAdmissionResult>('/journey/enter', { body: {} });

/**
 * The membership card was presented on this device (ADR-023): the server
 * verifies the concierge's credential, records the card and gives this
 * device a member session if it has none.
 */
export const presentCard = (conciergeToken: string) =>
  deskRequest<{
    session: Session;
    card: { firstPresentedAt: string; presentations: number };
  }>('/auth/member/card', {
    body: {},
    headers: { authorization: `Bearer ${conciergeToken}` },
  });

export const acceptAdmission = (room: AdmissionRoomId) =>
  deskRequest<AcceptAdmissionResult>(`/journey/admissions/${room}/accept`, {
    body: {},
  });

/* ---------- Owner ---------- */

export const ownerJourney = () => deskRequest<OwnerJourney>('/owner/journey');

export type MilestoneCommand = 'fire' | 'hold' | 'resume' | 'retry';

export const commandMilestone = (key: string, command: MilestoneCommand) =>
  deskRequest<{ milestone: OwnerMilestone }>(
    `/owner/journey/milestones/${key}/${command}`,
    { body: {} },
  );

/** Replaces a milestone's effects (e.g. the wording of its letter). */
export const editMilestoneEffects = (key: string, effects: MilestoneEffect[]) =>
  deskRequest<{ milestone: OwnerMilestone }>(
    `/owner/journey/milestones/${key}`,
    { method: 'PATCH', body: { effects } },
  );

export const rescheduleMilestone = (key: string, fireAt: string) =>
  deskRequest<{ milestone: OwnerMilestone }>(
    `/owner/journey/milestones/${key}`,
    { method: 'PATCH', body: { fireAt } },
  );

export const createMilestone = (input: MilestoneInput) =>
  deskRequest<{ milestone: OwnerMilestone; duplicate: boolean }>(
    '/owner/journey/milestones',
    { body: input },
  );

export const commandRoom = (
  room: AdmissionRoomId,
  command: 'invite' | 'withdraw',
) =>
  deskRequest<{ roomId: AdmissionRoomId; state: string }>(
    `/owner/journey/rooms/${room}/${command}`,
    { body: {} },
  );

export const retryEvent = (id: string) =>
  deskRequest<{ event: { id: string; state: string } }>(
    `/owner/journey/events/${id}/retry`,
    { body: {} },
  );

/** The communication hold (ADR-021). */
export const ownerCommunications = () =>
  deskRequest<HoldState>('/owner/communications');
