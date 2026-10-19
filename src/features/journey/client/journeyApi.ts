/**
 * The birthday journey's client (ADR-020). Every call resolves to a result
 * and nothing throws; the server is the only authority on admissions and
 * milestones. On rehearsal pages these calls are answered by the simulated
 * office in the tab (ADR-018) and never reach the real server.
 */
import type {
  AcceptAdmissionResult,
  AdmissionRoomId,
  MemberJourney,
  MilestoneInput,
  OwnerJourney,
  OwnerMilestone,
} from '../../../shared/journey/contract';
import { deskRequest } from '../../correspondence/client/correspondenceApi';

export const journeyState = () => deskRequest<MemberJourney>('/journey');

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

export const rescheduleMilestone = (key: string, fireAt: string) =>
  deskRequest<{ milestone: OwnerMilestone }>(
    `/owner/journey/milestones/${key}`,
    { method: 'PATCH', body: { fireAt } },
  );

export const createMilestone = (key: string, input: MilestoneInput) =>
  deskRequest<{ milestone: OwnerMilestone }>('/owner/journey/milestones', {
    body: { key, ...input },
  });

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
