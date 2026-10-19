/**
 * The Correspondence Desk end to end on phone-sized Chromium against the
 * local PostgreSQL rehearsal API (in-memory data, SMS_SENDING_ENABLED off,
 * no provider): compose → schedule → preview → send now → delivery by the
 * round → Alise's collection → envelope → thanks → a word → owner inbox.
 * No SMS is sent by any of this; the tests assert that it says so.
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

/** Any one of the Butler's scripted lines for a moment. */
const oneOf = (lines: readonly string[]) =>
  new RegExp(
    lines.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  );

const OWNER_PASSWORD = 'thirty-club-local-rehearsal-only';
const BASE = 'http://127.0.0.1:4181';
const headers = {
  'content-type': 'application/json',
  'x-concierge-request': '1',
};
const CAPTURE = process.env.CORRESPONDENCE_CAPTURE;
if (CAPTURE) mkdirSync(CAPTURE, { recursive: true });
const shot = async (page: Page, name: string) => {
  if (!CAPTURE) return;
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${CAPTURE}/${name}.png`, fullPage: true });
};

// One owner sign-in for the whole file: the office rate-limits sign-ins from
// one address (eight per fifteen minutes) and the other office specs share it.
let ownerCookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const login = await context.request.post('/api/v1/auth/owner', {
    headers,
    data: { password: OWNER_PASSWORD },
  });
  expect(login.status()).toBe(200);
  ownerCookies = await context.cookies();
  await context.close();
});

async function signIn(page: Page) {
  await page.context().addCookies(ownerCookies);
  await page.goto('/owner');
  await page
    .getByRole('button', { name: 'correspondence', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'The Correspondence Desk' }),
  ).toBeVisible();
}

async function compose(
  page: Page,
  title: string,
  body: string,
  options: { jamaica?: boolean; wall?: string } = {},
) {
  await page.getByRole('button', { name: 'Compose a new letter' }).click();
  const editor = page.getByRole('form', { name: 'Letter editor' });
  await editor.getByLabel('Title').fill(title);
  await editor.getByLabel('Letter', { exact: true }).fill(body);
  if (options.jamaica) await editor.getByLabel('Jamaica').check();
  if (options.wall) await editor.getByLabel(/Arrives at/).fill(options.wall);
  return editor;
}

async function invitation(page: Page): Promise<string> {
  const response = await page.request.post('/api/v1/owner/invitations', {
    headers,
    data: {},
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { token: string }).token;
}

async function phone(browser: Browser) {
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

const inTwoDays = () =>
  new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

test('Arron writes, schedules and sends; Alise opens, thanks and replies; Arron reads it', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await expect(page.getByText(/SMS sending is off/)).toBeVisible();

  // A letter for 09:00 Jamaica time in two days: the Butler's morning invitation.
  const editor = await compose(
    page,
    'A letter for the morning',
    'The sea was very blue today.\n\nI thought of you, as I always do.',
    { jamaica: true, wall: `${inTwoDays()}T09:00` },
  );
  // 09:00 in Jamaica, shown with its UK equivalent (15:00 BST, 14:00 GMT).
  const uk = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(`${inTwoDays()}T14:00:00Z`));
  await expect(
    editor.getByText(new RegExp(`09:00 Jamaica time \\(${uk} UK\\)`)),
  ).toBeVisible();
  await expect(
    editor.getByText(/The Butler will send his morning invitation/),
  ).toBeVisible();
  await shot(page, 'owner-editor');
  await editor.getByRole('button', { name: 'Schedule delivery' }).click();
  await expect(page.getByText(/is scheduled for/)).toBeVisible();
  const scheduled = page
    .locator('.desk-card')
    .filter({ hasText: 'A letter for the morning' });
  await expect(scheduled.getByText('Scheduled', { exact: true })).toBeVisible();
  await expect(scheduled.getByText(/09:00 Jamaica time/)).toBeVisible();

  // Preview: the real presentation, inert.
  await scheduled.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('dialog', { name: 'Letter preview' });
  await preview.getByRole('button', { name: /Break the seal/ }).click();
  await expect(
    preview.getByRole('heading', { name: 'A letter for the morning' }),
  ).toBeVisible();
  await expect(
    preview.getByText(/record nothing and send nothing/),
  ).toBeVisible();
  await shot(page, 'owner-preview');
  await preview.getByRole('button', { name: 'Close preview' }).click();

  // A second letter goes now, with an inline confirmation (no browser alert).
  const second = await compose(page, 'This afternoon', 'Look up at the sky.');
  await second.getByRole('button', { name: 'Save draft' }).click();
  const draft = page
    .locator('.desk-card')
    .filter({ hasText: 'This afternoon' });
  await draft.getByRole('button', { name: 'Send now' }).click();
  await draft.getByRole('button', { name: 'Yes, deliver now' }).click();
  await expect(page.getByText(/has been delivered to Alise/)).toBeVisible();
  const sent = page.locator('.desk-card').filter({ hasText: 'This afternoon' });
  await expect(
    sent.getByText(/Queued, not sent — SMS sending is switched off/),
  ).toBeVisible();

  // The round reaches the first letter's moment.
  const due = await page.request.post('/api/v1/__local/correspondence-due', {
    data: {},
  });
  expect(await due.json()).toEqual({ published: 1 });
  await page.getByRole('button', { name: 'Refresh the Desk' }).click();
  await expect(page.getByText('Delivered · unread')).toHaveCount(2);
  await shot(page, 'owner-desk');

  // Alise follows Arron's one-time introduction link.
  const token = await invitation(page);
  const alise = await phone(browser);
  const her = await alise.newPage();
  await her.goto(`/correspondence#invitation=${token}`);
  await expect(her).toHaveURL(/\/correspondence$/);
  await expect(
    her.getByText('2 letters await your attention, Madam', { exact: false }),
  ).toBeVisible();
  await expect(her.getByText('Unread', { exact: true })).toHaveCount(2);
  await shot(her, 'member-collection');

  await her.getByRole('link', { name: /A letter for the morning/ }).click();
  await shot(her, 'member-envelope');
  await her.getByRole('button', { name: /Break the seal/ }).click();
  if (CAPTURE) {
    await her.waitForTimeout(950);
    await her.screenshot({ path: `${CAPTURE}/member-unfolding.png` });
  }
  await expect(
    her.getByRole('heading', { name: 'A letter for the morning' }),
  ).toBeVisible();
  await expect(her.getByText('Dearest Alise,')).toBeVisible();
  await expect(
    her.getByText('I thought of you, as I always do.'),
  ).toBeVisible();
  await shot(her, 'member-letter');

  await her.getByRole('button', { name: 'Thank You, Butler' }).click();
  await expect(her.locator('.cd-butler__speech')).toHaveText(
    oneOf(BUTLER_LINES.thanks),
  );
  await her.getByRole('button', { name: 'Thank You, Butler' }).click();
  await expect(her.getByText(/already been far too kind/)).toBeVisible();

  await her.getByRole('button', { name: 'A Word, Butler' }).click();
  await expect(her.getByText(/You have my undivided attention/)).toBeVisible();
  await her
    .getByLabel('Your message to the Butler')
    .fill('Please tell Arron I loved it.');
  await her.getByRole('button', { name: 'Hand it to the Butler' }).click();
  await expect(her.locator('.cd-butler__speech')).toHaveText(
    oneOf(BUTLER_LINES['request-received']),
  );
  await expect(her.getByText('Please tell Arron I loved it.')).toBeVisible();
  await shot(her, 'member-replied');

  // Back in the collection: one unread, one opened. A reload keeps it opened.
  await her
    .getByRole('button', { name: 'Back to your correspondence' })
    .click();
  await expect(her.getByText('Unread', { exact: true })).toHaveCount(1);
  await expect(her.getByText('Thanked', { exact: true })).toHaveCount(1);
  await her.getByRole('link', { name: /A letter for the morning/ }).click();
  await expect(
    her.getByRole('heading', { name: 'A letter for the morning' }),
  ).toBeVisible();
  await expect(her.getByRole('button', { name: /Break the seal/ })).toHaveCount(
    0,
  );
  // Correspondence never stamps a club room or the induction.
  expect(
    await her.evaluate(() => localStorage.getItem('thirty-club:membership')),
  ).toBeNull();

  // Arron's inbox and the letter's history, truthfully.
  await page.getByRole('button', { name: 'Refresh the Desk' }).click();
  const inbox = page.locator('.desk__inbox');
  await expect(inbox.getByText('Please tell Arron I loved it.')).toBeVisible();
  await expect(
    inbox.getByText(
      /SMS to you: Queued, not sent — SMS sending is switched off/,
    ),
  ).toBeVisible();
  const read = page
    .locator('.desk-card')
    .filter({ hasText: 'A letter for the morning' });
  await expect(read.getByText('Opened · thanked')).toBeVisible();
  await expect(
    read.getByText(/Not sent — Not needed: Madam opened the letter/),
  ).toBeVisible();
  await shot(page, 'owner-inbox');
  await alise.close();
});

test('a waiting letter appears at the locked entrance and the Butler greets once', async ({
  page,
  browser,
}) => {
  await signIn(page);
  const editor = await compose(page, 'Before the birthday', 'Not long now.');
  await editor.getByRole('button', { name: 'Save draft' }).click();
  const card = page
    .locator('.desk-card')
    .filter({ hasText: 'Before the birthday' });
  await card.getByRole('button', { name: 'Send now' }).click();
  await card.getByRole('button', { name: 'Yes, deliver now' }).click();
  await expect(page.getByText(/has been delivered to Alise/)).toBeVisible();
  const token = await invitation(page);

  const alise = await phone(browser);
  const exchange = await alise.request.post('/api/v1/auth/member', {
    headers,
    data: { token },
  });
  expect(exchange.status()).toBe(200);
  const her = await alise.newPage();
  await her.goto('/');
  // The newest unread letter waits on the step; the Butler greets once.
  const envelope = her.getByRole('button', {
    name: /Open your new letter: Before the birthday/,
  });
  await expect(envelope).toBeVisible({ timeout: 30_000 });
  await expect(her.locator('.service__speech')).toHaveText(
    oneOf(BUTLER_LINES['unread-greeting']),
    { timeout: 10_000 },
  );
  await shot(her, 'entrance-notice');
  await her.reload();
  await expect(envelope).toBeVisible({ timeout: 30_000 });
  await her.waitForTimeout(1500);
  await expect(her.locator('.service__words')).toHaveCount(0);
  await envelope.click();
  await expect(
    her.getByRole('button', { name: /Break the seal.*Before the birthday/ }),
  ).toBeVisible();
  await alise.close();
});

test('a stranger is not handed letters, and an introduction works only once', async ({
  page,
  browser,
}) => {
  await signIn(page);
  const token = await invitation(page);
  const first = await phone(browser);
  const firstPage = await first.newPage();
  await firstPage.goto(`/correspondence#invitation=${token}`);
  // Introduced: the collection itself (earlier tests' letters may be there).
  await expect(firstPage).toHaveURL(/\/correspondence$/);
  await expect(firstPage.locator('.cd-room__line')).toBeVisible();
  await expect(firstPage.getByText(/not yet had the pleasure/)).toHaveCount(0);

  const stranger = await phone(browser);
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`/correspondence#invitation=${token}`);
  await expect(
    strangerPage.getByText(/not yet had the pleasure/),
  ).toBeVisible();
  await expect(
    strangerPage.getByText(/already been used or has expired/),
  ).toBeVisible();
  // No membership-card entry here: it would complete the birthday ceremony early.
  await expect(
    strangerPage.getByLabel('The number on your membership card'),
  ).toHaveCount(0);
  expect((await stranger.request.get('/api/v1/correspondence')).status()).toBe(
    401,
  );
  await shot(strangerPage, 'member-needs-introduction');
  await first.close();
  await stranger.close();
});
