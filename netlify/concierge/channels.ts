/**
 * Outbound channels. Telegram reaches Arron; SMS go through the server's
 * single SMS policy boundary (ADR-022). Plain HTTPS calls with an injected `fetch`, so automated tests
 * never reach a real provider. A send counts as successful only when the
 * provider says so.
 */
import type { Realm } from '../../src/features/concierge/domain/session.ts';
import type { ConciergeConfig } from './config.ts';

export type SendResult =
  | { ok: true; reference?: string }
  | { ok: false; error: string; unconfigured?: boolean };

export interface Channels {
  /** A message to Arron. Rehearsal messages are visibly marked. */
  arron(html: string, realm: Realm): Promise<SendResult>;
  /** An SMS. The service decides the recipient; see dispatch.ts. */
  sms(to: string, body: string): Promise<SendResult>;
  readonly telegramConfigured: boolean;
  readonly smsConfigured: boolean;
}

const TIMEOUT_MS = 6000;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** A Telegram message: bold title, then escaped lines. */
export function telegramMessage(
  title: string,
  lines: readonly string[],
  footer?: string,
): string {
  const body = lines.map(escapeHtml).join('\n');
  const tail = footer ? `\n\n<i>${escapeHtml(footer)}</i>` : '';
  return `<b>${escapeHtml(title)}</b>\n\n${body}${tail}`;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'The provider did not answer in time.'
      : error.message.slice(0, 200);
  }
  return 'Unknown error.';
}

/** Sends one SMS through the server's policy; see netlify/backend/smsPolicy.ts. */
export type SmsBoundary = (to: string, body: string) => Promise<SendResult>;

export function createChannels(
  config: ConciergeConfig,
  fetchImpl: typeof fetch,
  smsBoundary: SmsBoundary,
): Channels {
  const telegram = config.telegram;
  const twilio = config.twilio;
  return {
    telegramConfigured: telegram !== null,
    smsConfigured: twilio !== null,
    async arron(html, realm) {
      if (realm === 'rehearsal') {
        return { ok: true, reference: 'rehearsal-suppressed' };
      }
      if (!telegram) {
        return {
          ok: false,
          unconfigured: true,
          error: 'Telegram is not configured.',
        };
      }
      const chatId = telegram.chatId;
      const text = html;
      try {
        const response = await fetchImpl(
          `https://api.telegram.org/bot${telegram.botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          description?: string;
          result?: { message_id?: number };
        } | null;
        if (response.ok && data?.ok === true) {
          return { ok: true, reference: String(data.result?.message_id ?? '') };
        }
        return {
          ok: false,
          error: `Telegram ${response.status}: ${data?.description ?? 'no description'}`,
        };
      } catch (error) {
        return { ok: false, error: describe(error) };
      }
    },
    // SMS leave only through the server's SMS policy boundary (ADR-022):
    // the caller supplies it, so this module never talks to Twilio itself.
    sms: smsBoundary,
  };
}
