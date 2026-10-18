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

/** 01:00 on the birthday in Jamaica: the club is open to members. */
export const BIRTHDAY_EARLY = new Date('2026-10-24T06:00:00Z');
/** 09:00 on the birthday in Jamaica. */
export const BIRTHDAY_MORNING = new Date('2026-10-24T14:00:00Z');
