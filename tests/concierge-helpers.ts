import type { Page } from '@playwright/test';

/**
 * The membership card has been presented on this device (ADR-012): stores a
 * session whose claims carry the membership scope. The website only decodes
 * claims, so the signature is a placeholder; nothing here reaches a server.
 */
export async function presentMembershipCard(page: Page) {
  await page.addInitScript(() => {
    const claims = btoa(
      JSON.stringify({ v: 1, realm: 'live', scopes: ['membership'], iat: 1 }),
    )
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    localStorage.setItem('thirty-club:concierge-session', `${claims}.test`);
  });
}

/**
 * The doors were unlocked on this device by the one entrance ceremony
 * (21 Oct, 19:00 UK, with the card; ADR-023) but she has not yet walked in:
 * "Enter the club" waits. No clock opens the doors any more.
 */
export async function unlockedEarlier(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      'thirty-club:entrance',
      JSON.stringify({
        version: 1,
        unlockedAt: '2026-10-21T18:00:10.000Z',
        ceremonySeenAt: null,
      }),
    ),
  );
}

/** 01:00 on the birthday in Jamaica. */
export const BIRTHDAY_EARLY = new Date('2026-10-24T06:00:00Z');
/** 09:00 on the birthday in Jamaica. */
export const BIRTHDAY_MORNING = new Date('2026-10-24T14:00:00Z');
