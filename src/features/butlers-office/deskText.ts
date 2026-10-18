/** Wording for the Correspondence Desk; pure, no React. */
import type { LetterSms } from '../../shared/concierge/types';

export const when = (at: string | null, zone: string) =>
  at
    ? new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: zone,
      }).format(new Date(at))
    : '—';

/** "Tue 20 Oct, 09:00 Jamaica (15:00 UK)", or the UK time alone. */
export function deliveryText(at: string, zone: string): string {
  const own = `${when(at, zone)} ${zone === 'Europe/London' ? 'UK time' : 'Jamaica time'}`;
  if (zone === 'Europe/London') return own;
  const uk = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(at));
  return `${own} (${uk} UK)`;
}

/** Exactly what the outbox knows; never more. */
export function smsText(sms: LetterSms | null, smsEnabled: boolean): string {
  if (!sms) return 'Not queued';
  switch (sms.state) {
    case 'approved':
      return smsEnabled
        ? 'Queued — the Butler sends it within a minute or two'
        : 'Queued, not sent — SMS sending is switched off';
    case 'sending':
      return 'Sending now';
    case 'accepted':
      return 'Accepted by Twilio; delivery not yet confirmed';
    case 'delivered':
      return 'Delivered (confirmed by Twilio)';
    case 'failed':
      return `Failed${sms.lastError ? ` — ${sms.lastError}` : ''}`;
    case 'uncertain':
      return 'Uncertain — check the Twilio log before resending';
    case 'cancelled':
      return `Not sent${sms.lastError ? ` — ${sms.lastError}` : ' — cancelled'}`;
    default:
      return sms.state;
  }
}
