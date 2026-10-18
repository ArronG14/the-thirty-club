/**
 * Concierge configuration, read only from server-side environment variables
 * (Netlify site settings). Nothing here may ever be given a VITE_ prefix.
 * Every variable is documented in docs/CONCIERGE.md.
 */
import type { CredentialId } from '../../src/features/concierge/domain/credentials.ts';
import { normaliseCode } from '../../src/features/concierge/domain/credentials.ts';
import type { EnvLookup } from '../../src/features/concierge/domain/schedule.ts';

export interface CredentialSecret {
  /** The token in the NFC tag's URL. */
  token: string | null;
  /** The manual code, normalised. */
  code: string | null;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  /** Rehearsal notifications go here when set; otherwise prefixed. */
  rehearsalChatId: string | null;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export type AliseDispatch = 'manual' | 'sms';

export interface ConciergeConfig {
  sessionSecret: string | null;
  ownerKey: string | null;
  credentials: Record<CredentialId, CredentialSecret>;
  telegram: TelegramConfig | null;
  twilio: TwilioConfig | null;
  aliseDispatch: AliseDispatch;
  alisePhone: string | null;
  /** Receives rehearsal SMS so Alise never does. */
  arronPhone: string | null;
  siteUrl: string;
  /** Raw environment, for schedule overrides such as release times. */
  env: EnvLookup;
}

const MIN_SECRET_LENGTH = 24;

function value(env: EnvLookup, key: string): string | null {
  const raw = env[key]?.trim();
  return raw ? raw : null;
}

export function readConfig(env: EnvLookup): ConciergeConfig {
  const secret = value(env, 'CONCIERGE_SESSION_SECRET');
  const owner = value(env, 'CONCIERGE_OWNER_KEY');
  const credential = (prefix: string): CredentialSecret => {
    const token = value(env, `${prefix}_TOKEN`);
    const code = value(env, `${prefix}_CODE`);
    return {
      token: token && token.length >= 16 ? token : null,
      code:
        code && normaliseCode(code).length >= 6 ? normaliseCode(code) : null,
    };
  };
  const botToken = value(env, 'TELEGRAM_BOT_TOKEN');
  const chatId = value(env, 'TELEGRAM_CHAT_ID');
  const sid = value(env, 'TWILIO_ACCOUNT_SID');
  const auth = value(env, 'TWILIO_AUTH_TOKEN');
  const from = value(env, 'TWILIO_FROM');
  return {
    // Short secrets are treated as missing rather than trusted.
    sessionSecret: secret && secret.length >= MIN_SECRET_LENGTH ? secret : null,
    ownerKey: owner && owner.length >= 16 ? owner : null,
    credentials: {
      departure: credential('CREDENTIAL_DEPARTURE'),
      membership: credential('CREDENTIAL_MEMBERSHIP'),
    },
    telegram:
      botToken && chatId
        ? {
            botToken,
            chatId,
            rehearsalChatId: value(env, 'TELEGRAM_REHEARSAL_CHAT_ID'),
          }
        : null,
    twilio:
      sid && auth && from ? { accountSid: sid, authToken: auth, from } : null,
    aliseDispatch: value(env, 'ALISE_DISPATCH') === 'sms' ? 'sms' : 'manual',
    alisePhone: value(env, 'ALISE_PHONE'),
    arronPhone: value(env, 'ARRON_PHONE'),
    siteUrl:
      value(env, 'CONCIERGE_SITE_URL') ??
      value(env, 'URL') ??
      'http://localhost:5173',
    env,
  };
}

/** Plain-language health for the owner console. Never exposes values. */
export function configHealth(config: ConciergeConfig) {
  return {
    sessions: config.sessionSecret !== null,
    owner: config.ownerKey !== null,
    departureCredential: {
      link: config.credentials.departure.token !== null,
      code: config.credentials.departure.code !== null,
    },
    membershipCredential: {
      link: config.credentials.membership.token !== null,
      code: config.credentials.membership.code !== null,
    },
    telegram: config.telegram !== null,
    telegramRehearsalChat: Boolean(config.telegram?.rehearsalChatId),
    sms: config.twilio !== null && config.alisePhone !== null,
    aliseDispatch: config.aliseDispatch,
    siteUrl: config.siteUrl,
  };
}

export type ConfigHealth = ReturnType<typeof configHealth>;
