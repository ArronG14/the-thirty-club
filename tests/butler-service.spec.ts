/**
 * The Butler's Service end to end on an iPhone-sized Chromium, against the
 * in-memory PostgreSQL rehearsal API (SMS_SENDING_ENABLED off, no provider):
 *
 *   letter at the locked doors → greeting → seal → thanks → acknowledgement
 *   bell → menu → a word → acknowledgement → Arron's inbox → SMS / letter → resolved
 *   Arron's direct SMS: schedule in Jamaica time → cancel → send now (queued, SMS off)
 *   Departure Lounge from the locked doors and back, doors still locked
 *   Dev Mode rehearsal of all of it, touching no server record
 *
 * Every step is screenshotted to docs/butlers-service/screenshots for review.
 * The journeys share one database, so they run in order.
 */
import { mkdirSync } from 'node:fs';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { BUTLER_LINES } from '../src/features/butler-service/domain/dialogue.ts';
import type {
  OwnerCorrespondence,
  OwnerDirectSms,
  OwnerRequests,
} from '../src/shared/concierge/types.ts';

const BASE = 'http://127.0.0.1:4183';
const OWNER_PASSWORD = 'thirty-club-local-rehearsal-only';
const headers = {
  'content-type': 'application/json',
  'x-concierge-request': '1',
};
const SHOTS = process.env.BUTLER_SHOTS ?? 'docs/butlers-service/screenshots';
mkdirSync(SHOTS, { recursive: true });

const oneOf = (lines: readonly string[]) =>
  new RegExp(
    lines.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  );

async function shot(page: Page, name: string, settle = 900) {
  await page.waitForTimeout(settle);
  await page.screenshot({
    path: `${SHOTS}/${name}.jpg`,
    type: 'jpeg',
    quality: 82,
  });
}

/** Before the birthday, whatever day the suite runs. */
const PRE_BIRTHDAY = Date.now() < Date.parse('2026-10-24T05:00:00Z');

async function phone(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'thirty-club:first-visit-verified',
      '2026-10-18T00:00:00.000Z',
    );
  });
  return context;
}

async function lockedClock(page: Page) {
  if (!PRE_BIRTHDAY)
    await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'));
}

/** The software-rendered 3D scene is slow in CI; the poster is the same entrance. */
async function poster(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
}

let owner: BrowserContext;
let arron: Page;
let alise: BrowserContext;

async function api<T>(path: string, data?: unknown): Promise<T> {
  const response =
    data === undefined
      ? await owner.request.get(`/api/v1${path}`)
      : await owner.request.post(`/api/v1${path}`, { headers, data });
  expect(response.ok(), `${path} → ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

async function letter(title: string, body: string) {
  const { letter } = await api<{ letter: { id: string } }>(
    '/owner/correspondence',
    {
      title,
      salutation: 'Dearest Alise,',
      body,
      timezone: 'America/Jamaica',
      deliverAt: null,
    },
  );
  await api(`/owner/correspondence/${letter.id}/send-now`, {});
}

test.describe.serial('the Butler’s service', () => {
  test.beforeAll(async ({ browser }) => {
    owner = await phone(browser);
    const login = await owner.request.post('/api/v1/auth/owner', {
      headers,
      data: { password: OWNER_PASSWORD },
    });
    expect(login.status()).toBe(200);
    arron = await owner.newPage();
    await letter(
      'A few words before the holiday',
      'The cases are nearly packed, and the Butler has opinions about all of them.\n\nI cannot wait to see the sea with you.',
    );
    await new Promise((r) => setTimeout(r, 1100));
    await letter(
      'On the subject of Thursday',
      'Something is being arranged for Thursday afternoon.\n\nI am saying nothing further. The Butler has been sworn to secrecy, and takes it very seriously.',
    );
    const { token } = await api<{ token: string }>('/owner/invitations', {});
    alise = await phone(browser);
    const exchange = await alise.request.post('/api/v1/auth/member', {
      headers,
      data: { token },
    });
    expect(exchange.status()).toBe(200);
  });
  test.afterAll(async () => {
    await alise?.close();
    await owner?.close();
  });

  test('pre-birthday correspondence: envelope, greeting, seal, thanks, acknowledgement', async () => {
    const her = await alise.newPage();
    await poster(her);
    await lockedClock(her);
    await her.goto('/');
    await expect(her.locator('.club')).toHaveAttribute('data-stage', 'locked');
    const envelope = her.getByRole('button', {
      name: /Open your new letter: On the subject of Thursday\. 1 more unread/,
    });
    await expect(envelope).toBeVisible({ timeout: 20_000 });
    await shot(her, '01-locked-entrance-unread', 200);
    await expect(her.locator('.service__speech')).toHaveText(
      oneOf(BUTLER_LINES['unread-greeting']),
      { timeout: 10_000 },
    );
    await shot(her, '02-butler-greeting');

    await envelope.click();
    const seal = her.getByRole('button', {
      name: /Break the seal and open the letter: On the subject of Thursday/,
    });
    await expect(seal).toBeVisible();
    // The doors remain visible behind the translucent veil.
    await expect(her.locator('.portal')).toBeVisible();
    await shot(her, '05a-envelope-in-overlay');
    await seal.click();
    await her.waitForTimeout(700);
    await shot(her, '05b-seal-breaking', 0);
    await expect(
      her.getByRole('heading', { name: 'On the subject of Thursday' }),
    ).toBeVisible();
    await shot(her, '05-opened-letter');

    await her.getByRole('button', { name: 'Thank You, Butler' }).click();
    // The letter closes and the Butler answers at the doors.
    await expect(her.locator('.bs-overlay')).toHaveCount(0);
    await expect(her.locator('.service__speech')).toHaveText(
      oneOf(BUTLER_LINES.thanks),
    );
    await shot(her, '07a-thanks-acknowledgement');
    await expect(her.locator('.club')).toHaveAttribute('data-stage', 'locked');

    // The server recorded the thanks once and queued one SMS reply, unsent.
    const desk = await api<OwnerCorrespondence>('/owner/correspondence');
    const thanked = desk.letters.find(
      (l) => l.title === 'On the subject of Thursday',
    )!;
    expect(thanked.status).toBe('thanked');
    expect(thanked.thanksSms?.state).toBe('approved');
    expect(desk.smsEnabled).toBe(false);

    // The remaining unread letter now waits on the step.
    await expect(
      her.getByRole('button', {
        name: /Open your new letter: A few words before the holiday/,
      }),
    ).toBeVisible();

    // Thanking again from the collection records nothing new.
    await her.getByRole('button', { name: 'Ring for service' }).click();
    await her.getByRole('button', { name: /My Correspondence/ }).click();
    await expect(
      her.getByRole('heading', { name: 'Your Correspondence' }),
    ).toBeVisible();
    await expect(her.getByText('Unread', { exact: true })).toHaveCount(1);
    await expect(her.getByText('Thanked', { exact: true })).toHaveCount(1);
    await shot(her, '04-translucent-collection');
    await her
      .getByRole('button', { name: /On the subject of Thursday/ })
      .click();
    await her.getByRole('button', { name: 'Thank You, Butler' }).click();
    await expect(her.locator('.service__speech')).toHaveText(
      /already been far too kind/,
    );
    const again = await api<OwnerCorrespondence>('/owner/correspondence');
    expect(again.letters.find((l) => l.id === thanked.id)!.thanksSms?.id).toBe(
      thanked.thanksSms?.id,
    );
    // Correspondence never stamps a club room or the membership ceremony.
    expect(
      await her.evaluate(() => localStorage.getItem('thirty-club:membership')),
    ).toBeNull();
    await her.close();
  });

  test('the service bell: menu, a word with the Butler, acknowledgement', async () => {
    const her = await alise.newPage();
    await poster(her);
    await lockedClock(her);
    await her.goto('/');
    await expect(her.locator('.club')).toHaveAttribute('data-stage', 'locked');
    await her.getByRole('button', { name: 'Ring for service' }).click();
    const menu = her.getByRole('dialog');
    await expect(menu.getByRole('heading')).toHaveText(
      oneOf(BUTLER_LINES.ring),
    );
    await expect(
      menu.getByRole('button', { name: /My Correspondence/ }),
    ).toBeVisible();
    await expect(
      menu.getByRole('button', { name: /A Word with the Butler/ }),
    ).toBeVisible();
    await shot(her, '03-service-bell-menu');
    await menu.getByRole('button', { name: /A Word with the Butler/ }).click();
    await expect(
      her.getByText(/You have my undivided attention/),
    ).toBeVisible();
    await her
      .getByLabel('Your message to the Butler')
      .fill(
        'Butler, could you please arrange a cocktail for me this afternoon?',
      );
    await shot(her, '06-request-composer');
    await her.getByRole('button', { name: 'Hand it to the Butler' }).click();
    const sent = her.locator('.bs-sent');
    await expect(sent.locator('.bs-butler-line p')).toHaveText(
      oneOf(BUTLER_LINES['request-received']),
    );
    await expect(
      sent.getByText(/Arron will see it in the Butler’s Office/),
    ).toBeVisible();
    await shot(her, '07-butler-acknowledgement');
    await sent.getByRole('button', { name: 'Thank you, Butler' }).click();
    await expect(her.locator('.bs-overlay')).toHaveCount(0);

    const inbox = await api<OwnerRequests>('/owner/requests');
    expect(inbox.requests[0]).toMatchObject({
      source: 'service',
      body: 'Butler, could you please arrange a cocktail for me this afternoon?',
      resolvedAt: null,
    });
    expect(inbox.requests[0]!.notificationSms?.state).toBe('approved');
    await her.close();
  });

  test('owner communications: schedule in Jamaica time, cancel, send now with SMS off', async () => {
    await arron.goto('/owner');
    await arron.getByRole('button', { name: 'messages', exact: true }).click();
    await expect(
      arron.getByRole('heading', { name: 'Write to Alise' }),
    ).toBeVisible();
    await expect(arron.getByText(/SMS sending is off/).first()).toBeVisible();

    const form = arron.locator('form.desk-editor').first();
    await form
      .getByLabel('The Butler’s message')
      .fill('Madam, a car will collect you at ten o’clock. Do bring a hat.');
    await form.getByLabel('Schedule for later').check();
    await form.getByLabel('Time zone').selectOption('America/Jamaica');
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    await form.getByLabel('Date and time').fill(`${tomorrow}T10:00`);
    await expect(form.getByText(/Sends .* 10:00 Jamaica time/)).toBeVisible();
    await expect(form.locator('.desk__bubble')).toHaveText(
      'Madam, a car will collect you at ten o’clock. Do bring a hat.',
    );
    await shot(arron, '08a-owner-messages-compose');
    await form.getByRole('button', { name: 'Schedule SMS' }).click();
    await form.getByRole('button', { name: 'Yes, schedule it' }).click();
    await expect(
      arron.getByText(/^Scheduled for .*10:00 Jamaica time/),
    ).toBeVisible();
    const card = arron.locator('.desk-card[data-stage]').first();
    await expect(card.getByText('Scheduled', { exact: true })).toBeVisible();
    await expect(card.getByText(/10:00 Jamaica time/)).toBeVisible();
    await shot(arron, '08b-owner-messages-scheduled');

    await card.getByRole('button', { name: 'Cancel message' }).click();
    await card.getByRole('button', { name: 'Yes, cancel it' }).click();
    await expect(
      arron.getByText('Cancelled. It will not be sent.'),
    ).toBeVisible();
    await expect(
      arron.locator('.desk-card[data-stage]').first(),
    ).toHaveAttribute('data-stage', 'cancelled');

    await form
      .getByLabel('The Butler’s message')
      .fill('Madam, a test from the Butler.');
    await form.getByRole('button', { name: 'Send now' }).click();
    await form.getByRole('button', { name: 'Yes, send it now' }).click();
    await expect(
      arron.getByText('Queued, not sent — SMS sending is switched off.'),
    ).toBeVisible();
    const queued = arron.locator('.desk-card[data-stage]').first();
    await expect(queued).toHaveAttribute('data-stage', 'queued');
    await expect(
      queued.getByText(/Queued, not sent — SMS sending is switched off/),
    ).toBeVisible();
    await shot(arron, '08-owner-messages');

    const book = await api<OwnerDirectSms>('/owner/butler-sms');
    expect(book.messages.map((m) => m.state)).toEqual([
      'approved',
      'cancelled',
    ]);
    expect(book.messages[1]!.timezone).toBe('America/Jamaica');

    await arron
      .getByRole('button', { name: 'correspondence', exact: true })
      .click();
    await expect(
      arron.getByRole('heading', { name: 'The Correspondence Desk' }),
    ).toBeVisible();
    await expect(arron.getByText('Opened · thanked')).toBeVisible();
    await shot(arron, '09-owner-correspondence');
  });

  test('request lifecycle: inbox → SMS reply → letter reply → resolved → Butler delivers it', async () => {
    await arron.getByRole('button', { name: 'requests', exact: true }).click();
    await expect(
      arron.getByRole('heading', { name: 'Member Requests' }),
    ).toBeVisible();
    const card = arron
      .locator('.desk-request')
      .filter({ hasText: 'arrange a cocktail' });
    await expect(
      card.getByText('Rang for the Butler', { exact: false }),
    ).toBeVisible();
    await expect(card.getByText(/SMS to you: Queued, not sent/)).toBeVisible();

    await card.getByRole('button', { name: 'Reply with a Butler SMS' }).click();
    await card
      .getByLabel('The Butler’s SMS to Alise')
      .fill('Certainly, Madam. A cocktail will find you by the pool at four.');
    await card.getByRole('button', { name: 'Send the Butler’s SMS' }).click();
    await expect(
      arron.getByText(/queued, not sent — SMS sending is switched off/),
    ).toBeVisible();
    await expect(
      card.getByText('A cocktail will find you by the pool at four.', {
        exact: false,
      }),
    ).toBeVisible();

    await card
      .getByRole('button', { name: 'Write a letter in response' })
      .click();
    await card
      .getByLabel('Letter', { exact: true })
      .fill(
        'Your cocktail has been ordered, my love. The Butler insists on a cherry.',
      );
    await card.getByRole('button', { name: 'Deliver the letter now' }).click();
    await expect(
      arron.getByText(/has been delivered to Alise’s correspondence/),
    ).toBeVisible();
    await expect(
      card.getByText(/“In answer to your request” · Delivered · unread/),
    ).toBeVisible();
    await shot(arron, '10a-owner-request-answered');
    await card.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(arron.getByText('Marked resolved.')).toBeVisible();
    const resolved = arron
      .locator('.desk-request[data-resolved="true"]')
      .filter({
        hasText: 'arrange a cocktail',
      });
    await expect(resolved.getByText(/^Resolved /)).toBeVisible();
    await shot(arron, '10-owner-requests');

    const inbox = await api<OwnerRequests>('/owner/requests');
    const answered = inbox.requests.find((r) => r.body.includes('cocktail'))!;
    expect(answered.resolvedAt).not.toBeNull();
    expect(answered.responses.map((r) => r.kind)).toEqual(['sms', 'letter']);

    // The Butler delivers Arron's letter at the doors.
    const her = await alise.newPage();
    await poster(her);
    await lockedClock(her);
    await her.goto('/');
    await expect(
      her.getByRole('button', {
        name: /Open your new letter: In answer to your request/,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await her.close();
  });

  test('the real-time 3D entrance shows the waiting letter and the greeting', async () => {
    const her = await alise.newPage();
    await lockedClock(her);
    await her.goto('/');
    await expect(her.locator('.facade')).toHaveAttribute(
      'data-render',
      /scene|fading/,
      {
        timeout: 60_000,
      },
    );
    await expect(
      her.getByRole('button', {
        name: /Open your new letter: In answer to your request/,
      }),
    ).toBeVisible({ timeout: 20_000 });
    const words = her.locator('.service__words');
    // He speaks only once the 3D scene has settled.
    await expect(her.locator('.facade')).toHaveAttribute(
      'data-render',
      'scene',
      {
        timeout: 60_000,
      },
    );
    await expect(words).toHaveText(oneOf(BUTLER_LINES['unread-greeting']), {
      timeout: 10_000,
    });
    // On the 3D plinth his words are on screen without scrolling.
    const box = (await words.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await shot(her, '02b-3d-entrance-greeting', 300);
    // Safari with its toolbars (390×664): the doors' timepiece stays clear.
    await her.setViewportSize({ width: 390, height: 664 });
    await shot(her, '02c-3d-entrance-safari-viewport', 1500);
    await her.close();
  });

  test('Departure Lounge from the locked doors and back, doors still locked', async () => {
    const her = await alise.newPage();
    await poster(her);
    await lockedClock(her);
    await her.goto('/');
    await expect(her.locator('.club')).toHaveAttribute('data-stage', 'locked');
    await her.getByRole('button', { name: 'Your Departure Lounge' }).click();
    const invite = her.getByRole('dialog');
    await expect(invite.getByRole('heading')).toHaveText(
      oneOf(BUTLER_LINES.departure),
    );
    await shot(her, '12-departure-invitation');
    await invite.getByRole('button', { name: 'Please escort me' }).click();
    await expect(her).toHaveURL(/\/departure$/);
    await expect(
      her.getByRole('heading', { name: /Departure Lounge/ }),
    ).toBeVisible();
    await shot(her, '12b-departure-lounge', 1500);
    await her.getByRole('link', { name: 'The Thirty Club' }).click();
    await expect(her).toHaveURL(/\/$/);
    await expect(her.locator('.club')).toHaveAttribute('data-stage', 'locked');
    expect(
      await her.evaluate(() => localStorage.getItem('thirty-club:membership')),
    ).toBeNull();
    await her.close();
  });

  test('Dev Mode rehearses letters, thanks, the bell and requests without touching the server', async ({
    browser,
  }) => {
    const before = await api<OwnerRequests>('/owner/requests');
    const desk = await api<OwnerCorrespondence>('/owner/correspondence');
    const context = await phone(browser);
    const page = await context.newPage();
    const calls: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/^\/api\/v1\/(correspondence|service)/.test(url.pathname))
        calls.push(`${request.method()} ${url.pathname}`);
    });
    await poster(page);
    await lockedClock(page);
    await page.goto('/');
    for (let i = 0; i < 5; i++) await page.locator('.timepiece').tap();
    await page.getByLabel('Private access code').fill('1414');
    await page.getByRole('button', { name: 'Unlock private office' }).click();
    const toggle = page.getByRole('button', {
      name: 'Open Dev Mode',
    });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const panel = page.getByRole('dialog', { name: 'Dev Mode' });
    await panel
      .getByRole('button', { name: 'Simulate three unread letters' })
      .click();
    await expect(
      panel.getByText('3 unread of 3 simulated letters'),
    ).toBeVisible();
    await shot(page, '11-dev-mode-controls', 300);
    await panel
      .getByRole('button', { name: 'See the letter at the locked doors' })
      .click();
    await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
    const envelope = page.getByRole('button', {
      name: /Open your new letter: Rehearsal/,
    });
    await expect(envelope).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.arrived-letter')).toContainText(
      '3 letters have arrived',
    );
    await expect(page.locator('.service__speech')).toHaveText(
      oneOf(BUTLER_LINES['unread-greeting']),
      { timeout: 10_000 },
    );
    await shot(page, '11b-dev-mode-envelope');
    await envelope.click();
    await page.getByRole('button', { name: /Break the seal/ }).click();
    await expect(
      page.getByText(/Dev Mode rehearsal · nothing is recorded/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Thank You, Butler' }).click();
    await expect(page.locator('.service__speech')).toHaveText(
      oneOf(BUTLER_LINES.thanks),
    );

    await page.getByRole('button', { name: 'Ring for service' }).click();
    await page.getByRole('button', { name: /A Word with the Butler/ }).click();
    await page
      .getByLabel('Your message to the Butler')
      .fill('A rehearsal request.');
    await page.getByRole('button', { name: 'Hand it to the Butler' }).click();
    await expect(
      page.getByText(/Dev Mode rehearsal: nothing was recorded for Alise/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Thank you, Butler' }).click();

    // Nothing left the device; the club's records are exactly as they were.
    expect(calls).toEqual([]);
    expect((await api<OwnerRequests>('/owner/requests')).requests).toHaveLength(
      before.requests.length,
    );
    expect(
      (await api<OwnerCorrespondence>('/owner/correspondence')).letters,
    ).toEqual(desk.letters);
    expect(
      await page.evaluate(() => localStorage.getItem('thirty-club:entrance')),
    ).toBeNull();

    // The lounge rehearsal: the toggle sits clear of the heading.
    await toggle.click();
    await page
      .getByRole('dialog', { name: 'Dev Mode' })
      .getByRole('button', { name: 'Enter Club' })
      .click();
    await expect(page.locator('.club')).toHaveAttribute('data-stage', 'foyer', {
      timeout: 20_000,
    });
    const heading = page.getByRole('heading', { name: 'The Members’ Lounge' });
    await expect(heading).toBeVisible();
    const a = (await toggle.boundingBox())!;
    // The heading's text, not its full-width block.
    const b = await heading.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const overlaps =
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    expect(overlaps).toBe(false);
    await shot(page, '11c-dev-mode-lounge', 1500);

    // Ring for service in the lounge opens the same Butler, over the lounge.
    await page.getByRole('button', { name: 'Ring for service' }).click();
    await page.getByRole('button', { name: /My Correspondence/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Your Correspondence' }),
    ).toBeVisible();
    await expect(page.locator('.lounge')).toBeVisible();
    await shot(page, '04b-collection-over-lounge');
    await page
      .getByRole('button', { name: 'Return to the lounge', exact: true })
      .click();
    await expect(page.locator('.bs-overlay')).toHaveCount(0);

    // The Members' Directory lists the Departure Lounge with a way in.
    await page.getByRole('button', { name: 'Members’ Directory' }).click();
    const directory = page.getByRole('dialog', { name: 'Members’ Directory' });
    await expect(
      directory.getByRole('button', { name: 'Enter: The Departure Lounge' }),
    ).toBeVisible();
    await shot(page, '13-members-directory');
    expect(calls).toEqual([]);
    await context.close();
  });
});
