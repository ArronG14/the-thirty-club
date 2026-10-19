/**
 * The Butler's Office side of the Butler's Service (docs/BUTLERS_SERVICE.md):
 * Arron's direct SMS to Alise, and her requests with his responses. Same
 * session, same request rules and the same result shape as the Desk.
 */
import type {
  DirectSms,
  DirectSmsInput,
  LetterSms,
  OwnerDirectSms,
  OwnerRequests,
  OwnerServiceRequest,
} from '../../shared/concierge/types';
import { deskRequest } from '../correspondence/client/correspondenceApi';

export const ownerDirectSms = () =>
  deskRequest<OwnerDirectSms>('/owner/butler-sms');

export const sendDirectSms = (input: DirectSmsInput) =>
  deskRequest<{ message: DirectSms; duplicate: boolean }>('/owner/butler-sms', {
    body: input,
  });

export const cancelDirectSms = (id: string) =>
  deskRequest<{ message: DirectSms }>(`/owner/butler-sms/${id}/cancel`, {
    body: {},
  });

export const ownerRequests = () =>
  deskRequest<OwnerRequests>('/owner/requests');

export const replyBySms = (id: string, body: string, idempotencyKey: string) =>
  deskRequest<{ request: OwnerServiceRequest; duplicate: boolean }>(
    `/owner/requests/${id}/sms`,
    { body: { body, idempotencyKey } },
  );

export const linkLetter = (
  id: string,
  letterId: string,
  idempotencyKey: string,
) =>
  deskRequest<{ request: OwnerServiceRequest; duplicate: boolean }>(
    `/owner/requests/${id}/letter`,
    { body: { letterId, idempotencyKey } },
  );

export const resolveRequest = (id: string, resolved: boolean) =>
  deskRequest<{ request: OwnerServiceRequest }>(
    `/owner/requests/${id}/resolve`,
    { body: { resolved } },
  );

/** One word for a message's state, from the outbox alone. */
export type SmsStage =
  | 'scheduled'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'uncertain'
  | 'cancelled';

export function smsStage(
  sms: Pick<LetterSms, 'state' | 'sendAt'>,
  now: number,
): SmsStage {
  switch (sms.state) {
    case 'approved':
    case 'draft':
      return sms.sendAt && Date.parse(sms.sendAt) > now
        ? 'scheduled'
        : 'queued';
    case 'sending':
      return 'sending';
    case 'accepted':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    case 'uncertain':
      return 'uncertain';
    default:
      return 'cancelled';
  }
}

export const STAGE_LABEL: Record<SmsStage, string> = {
  scheduled: 'Scheduled',
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent · awaiting delivery report',
  delivered: 'Delivered',
  failed: 'Failed',
  uncertain: 'Uncertain',
  cancelled: 'Cancelled · not sent',
};

/** Only a definite failure or a cancellation may be sent again. */
export const retryable = (sms: Pick<LetterSms, 'state'>) =>
  sms.state === 'failed' || sms.state === 'cancelled';
/** Only a message the worker has not claimed may be withdrawn. */
export const cancellable = (sms: Pick<LetterSms, 'state'>) =>
  sms.state === 'approved';
