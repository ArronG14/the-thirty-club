/**
 * REHEARSAL ONLY. The owner's hand on the simulated office from any
 * rehearsal document: the Dev Menu and the TEST Control Centre use these to
 * seed and trigger things exactly as the real Owner Console would, through
 * the same `/api/v1` handlers, as the simulated owner.
 */
import type { OwnerVault } from '../../shared/concierge/types';
import { simulationActive } from './mode';

export class SimulationUnavailable extends Error {}

/** One request to the simulated office, as its owner. */
export async function simOwner<T>(
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'PATCH' = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (!simulationActive)
    throw new SimulationUnavailable('Rehearsal controls work only in TEST.');
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const response = await office.handle(
    new Request(`${window.location.origin}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    'owner',
  );
  const data = (await response.json()) as T & { message?: string };
  if (!response.ok)
    throw new SimulationUnavailable(
      data.message ?? 'The simulated office refused.',
    );
  return data;
}

/** Runs the simulated every-minute round now (letters due, SMS "sent"). */
export async function runSimRound() {
  const { simOffice } = await import('./sim/v1');
  return (await simOffice()).round();
}

/* ---------- Gift Vault seed ---------- */

const REHEARSAL_COMPARTMENTS = [
  {
    displayNumber: 1,
    clue: 'Rehearsal clue: where the morning coffee is made, look beneath the saucer.',
    giftLocation:
      'Rehearsal location: the top drawer of the bedside table (simulated).',
    trigger: 'manual',
    availableAt: null,
    casinoRewardId: null,
    ready: true,
  },
  {
    displayNumber: 2,
    clue: 'Rehearsal clue: the compartment that opens at noon in Jamaica.',
    giftLocation: 'Rehearsal location: behind the second cushion (simulated).',
    trigger: 'scheduled',
    availableAt: '2026-10-24T17:00:00.000Z',
    casinoRewardId: null,
    ready: false,
  },
  {
    displayNumber: 3,
    clue: 'Rehearsal clue: won at the Grand Casino’s slot machine.',
    giftLocation:
      'Rehearsal location: inside the wardrobe, left shelf (simulated).',
    trigger: 'casino',
    availableAt: null,
    casinoRewardId: 'casino.vault-key-one',
    ready: false,
  },
] as const;

/** Three rehearsal compartments, created once per simulation. */
export async function ensureRehearsalVaults(): Promise<OwnerVault[]> {
  const listed = await simOwner<{ vaults: OwnerVault[] }>('/owner/vaults');
  if (listed.vaults.length > 0) return listed.vaults;
  if (seeding) return seeding;
  seeding = seedVaults().finally(() => (seeding = null));
  return seeding;
}

let seeding: Promise<OwnerVault[]> | null = null;

async function seedVaults(): Promise<OwnerVault[]> {
  for (const { ready, ...input } of REHEARSAL_COMPARTMENTS) {
    const { vault } = await simOwner<{ vault: OwnerVault }>(
      '/owner/vaults',
      input,
    );
    if (ready) await simOwner(`/owner/vaults/${vault.id}/ready`, {});
  }
  return (await simOwner<{ vaults: OwnerVault[] }>('/owner/vaults')).vaults;
}

/** Releases every compartment a Casino jackpot would release. */
export async function releaseCasinoCompartments(): Promise<number> {
  const vaults = await ensureRehearsalVaults();
  let released = 0;
  for (const vault of vaults)
    if (vault.trigger === 'casino' && vault.state === 'locked') {
      await simOwner(`/owner/vaults/${vault.id}/ready`, {});
      released++;
    }
  return released;
}

/** The rehearsal NFC token of a compartment, standing in for the tag. */
export async function rehearsalKeyFor(vaultId: string): Promise<string | null> {
  const vaults = await ensureRehearsalVaults();
  return (
    vaults.find((v) => v.id === vaultId || v.slug === vaultId)?.nfcToken ?? null
  );
}

export function forgetVaultSeed() {
  seeding = null;
}

/* ---------- Correspondence ---------- */

const LETTERS = [
  {
    title: 'Rehearsal · A word before Thursday',
    body: 'This is a rehearsal letter, written in the TEST Control Centre. Nothing here was sent to Alise, and no message has left the club.\n\nThe real letters arrive in exactly this way: a sealed envelope at the doors, the Butler at your side.',
  },
  {
    title: 'Rehearsal · An evening at the tables',
    body: 'A rehearsal letter that mentions a room. When you have a moment this afternoon, do look in at the Grand Casino. The croupier has been told to expect you.',
  },
  {
    title: 'Rehearsal · Packing, and other mysteries',
    body: 'A third rehearsal letter, to show several unread letters together and the newest rising to the top.\n\nWith love, and with no SMS whatsoever.',
  },
];

let letterCount = 0;

/** Writes and delivers a rehearsal letter now, through the real Desk flow. */
export async function deliverRehearsalLetter(input?: {
  title: string;
  body: string;
  salutation?: string;
}) {
  const sample = input ?? LETTERS[letterCount++ % LETTERS.length]!;
  const { letter } = await simOwner<{ letter: { id: string } }>(
    '/owner/correspondence',
    {
      title: sample.title,
      salutation: input?.salutation ?? 'Dearest Alise,',
      body: sample.body,
      timezone: 'Europe/London',
      deliverAt: null,
    },
  );
  await simOwner(`/owner/correspondence/${letter.id}/send-now`, {});
  window.dispatchEvent(new Event('thirty-club:butler-rehearsal'));
  return letter.id;
}

/* ---------- Forcing scheduled things ---------- */

/**
 * Brings every scheduled letter's moment to now and runs the round, as the
 * every-minute dispatch would once its time came.
 */
export async function deliverScheduledLettersNow() {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  await office.pg.exec(
    "update public.ttc_letters set deliver_at = public.ttc_sim_now() - interval '1 minute' where state = 'scheduled'",
  );
  const result = await office.round();
  window.dispatchEvent(new Event('thirty-club:butler-rehearsal'));
  return result;
}

/** Brings every approved, scheduled SMS forward to now and "sends" it. */
export async function sendScheduledSmsNow() {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  await office.pg.exec(
    "update public.ttc_messages set send_at = public.ttc_sim_now() - interval '1 second' where state = 'approved' and send_at > public.ttc_sim_now()",
  );
  return office.round();
}

/** A word with the Butler, as Alise, through the member's own route. */
export async function simulateMemberRequest(body: string) {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const response = await office.handle(
    new Request(`${window.location.origin}/api/v1/service/requests`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-concierge-request': '1',
      },
      body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() }),
    }),
    'member',
  );
  if (!response.ok) {
    const data = (await response.json()) as { message?: string };
    throw new SimulationUnavailable(data.message ?? 'Request refused.');
  }
  await office.round();
}

export interface UpcomingItem {
  id: string;
  label: string;
  at: number;
  kind: 'letter' | 'sms' | 'compartment';
}

/** Everything the simulated office has scheduled, for the timeline. */
export async function scheduledInOffice(): Promise<UpcomingItem[]> {
  const { simOffice } = await import('./sim/v1');
  const office = await simOffice();
  const letters = await office.pg.query<{
    id: string;
    title: string;
    at: string;
  }>(
    "select id, title, deliver_at as at from public.ttc_letters where state = 'scheduled' and deliver_at is not null",
  );
  const sms = await office.pg.query<{ id: string; body: string; at: string }>(
    "select id, body, send_at as at from public.ttc_messages where state = 'approved' and send_at is not null",
  );
  const vaults = await office.pg.query<{
    id: string;
    n: number;
    at: string;
  }>(
    "select slug as id, display_number as n, available_at as at from public.ttc_vaults where state = 'locked' and available_at is not null",
  );
  return [
    ...letters.rows.map((r) => ({
      id: r.id,
      label: `Letter: ${r.title}`,
      at: Date.parse(r.at),
      kind: 'letter' as const,
    })),
    ...sms.rows.map((r) => ({
      id: r.id,
      label: `Butler SMS: ${r.body.slice(0, 60)}${r.body.length > 60 ? '…' : ''}`,
      at: Date.parse(r.at),
      kind: 'sms' as const,
    })),
    ...vaults.rows.map((r) => ({
      id: r.id,
      label: `Vault compartment No. ${r.n} becomes ready`,
      at: Date.parse(r.at),
      kind: 'compartment' as const,
    })),
  ].sort((a, b) => a.at - b.at);
}
