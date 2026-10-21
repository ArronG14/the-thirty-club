import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

// The concierge journey on an iPhone-sized viewport, against the production
// build and the local concierge API (real handlers, in-memory store, FAKE
// channels: every "notification" lands in an outbox the test reads).

const OPENS = Date.parse('2026-10-22T13:00:00Z'); // Thursday 14:00 UK
const DEPARTURE_LINK = '/c/departure-test-token-0001';
const MEMBERSHIP_LINK = '/c/membership-test-token-0001';
const OWNER_KEY = 'test-owner-key-0001';

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  // The poster entrance: the 3D scene is not under test here, and fake-clock
  // ceremonies run reliably without the software renderer in the loop.
  launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] },
});

async function serverClock(request: APIRequestContext, now: number | null) {
  await request.post('/api/__local/clock', { data: { now } });
}

async function outbox(request: APIRequestContext) {
  const response = await request.get('/api/__local/outbox');
  return (await response.json()) as {
    channel: string;
    realm: string;
    text: string;
  }[];
}

async function requests(request: APIRequestContext) {
  return (await outbox(request)).filter((m) =>
    m.text.includes('CONCIERGE REQUEST'),
  );
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectTouchTarget(page: Page, name: string | RegExp) {
  const box = await page.getByRole('button', { name }).first().boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test.beforeEach(async ({ request }) => {
  await request.post('/api/__local/reset');
  await serverClock(request, OPENS + 5 * 60_000);
});

test('Thursday: the NFC credential, a redemption and Arron’s notification', async ({
  page,
  request,
}) => {
  await page.goto(DEPARTURE_LINK);
  await expect(page).toHaveURL(/\/departure$/);
  await expect(
    page.getByText('Your travel credentials are in order'),
  ).toBeVisible();
  await expect(page.getByLabel('Boarding pass')).toContainText(
    'Madam Alise Khera',
  );
  await page.getByRole('button', { name: 'Enter the lounge' }).click();
  await expect(page.getByText('Your privileges')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTouchTarget(page, 'Break the seal: Duty-Free Indulgence');

  await page
    .getByRole('button', { name: 'Break the seal: Duty-Free Indulgence' })
    .click();
  const card = page.getByRole('dialog');
  await expect(card).toContainText('a little shopping before departure');
  await card
    .getByLabel(/boutique you have in mind/)
    .fill('Something from Jo Malone');
  await expectTouchTarget(page, 'Inform Arron');
  await card.getByRole('button', { name: 'Inform Arron' }).click();
  await expect(
    card.getByText('Your privilege has been granted.'),
  ).toBeVisible();
  await expect(card.getByText('Arron has been informed.')).toBeVisible();

  const sent = await requests(request);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.text).toContain(
    'Alise has redeemed her Duty-Free Indulgence.',
  );
  expect(sent[0]?.text).toContain('Something from Jo Malone');
  expect(sent[0]?.realm).toBe('live');

  // Persistent: a refresh shows it redeemed, and the device needs no tag.
  await page.reload();
  await expect(
    page.getByRole('button', { name: /Duty-Free Indulgence\. Redeemed/ }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a second device sees the redemption and cannot redeem again', async ({
  page,
  browser,
  request,
}) => {
  await page.goto(DEPARTURE_LINK);
  await page.getByRole('button', { name: 'Enter the lounge' }).click();
  await page
    .getByRole('button', { name: 'Break the seal: Duty-Free Indulgence' })
    .click();
  await page.getByRole('button', { name: 'Inform Arron' }).click();
  await expect(page.getByText('Arron has been informed.')).toBeVisible();

  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const second = await other.newPage();
  await second.goto(DEPARTURE_LINK);
  await second.getByRole('button', { name: 'Enter the lounge' }).click();
  await expect(
    second.getByRole('button', { name: /Duty-Free Indulgence\. Redeemed/ }),
  ).toBeVisible();
  await expect(
    second.getByRole('button', {
      name: 'Break the seal: Duty-Free Indulgence',
    }),
  ).toHaveCount(0);
  expect(await requests(request)).toHaveLength(1);
  await other.close();
});

test('the manual code works when the tag will not scan', async ({ page }) => {
  await page.goto('/departure');
  await expect(
    page.getByText(/never once complained about the weight/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Present it by hand' }).click();
  await page
    .getByLabel('The code printed on your credential')
    .fill('wrong-code');
  await page.getByRole('button', { name: 'Present credential' }).click();
  await expect(
    page.getByText(/does not recognise that credential/),
  ).toBeVisible();
  await page
    .getByLabel('The code printed on your credential')
    .fill('brass 2210');
  await page.getByRole('button', { name: 'Present credential' }).click();
  await expect(
    page.getByText('Your travel credentials are in order'),
  ).toBeVisible();
});

test('a failed notification is never shown as delivered', async ({
  page,
  request,
}) => {
  await page.goto(DEPARTURE_LINK);
  await page.getByRole('button', { name: 'Enter the lounge' }).click();
  await request.post('/api/__local/fail', {
    data: { channel: 'arron', times: 20 },
  });
  await page
    .getByRole('button', { name: 'Break the seal: Duty-Free Indulgence' })
    .click();
  await page.getByRole('button', { name: 'Inform Arron' }).click();
  await expect(
    page.getByText('Your request is recorded. Word is on its way to Arron.'),
  ).toBeVisible();
  await expect(page.getByText('Arron has been informed.')).toHaveCount(0);
});

test('mobile navigation: the letter on the step leads to the lounge and back', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(OPENS + 5 * 60_000));
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Your Departure Lounge is ready' })
    .click();
  await page
    .getByRole('link', { name: 'Proceed to the Departure Lounge' })
    .click();
  await expect(page).toHaveURL(/\/departure$/);
  await expect(
    page.getByRole('heading', { name: /Departure Lounge/ }),
  ).toBeVisible();
  const back = page.getByRole('link', { name: 'The Thirty Club' });
  expect((await back.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await back.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: 'The Thirty Club' }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the owner rehearses in isolation, at in-flight time', async ({
  page,
  request,
}) => {
  // Rehearsal time is relative to the real clock, as in production.
  await serverClock(request, null);
  await page.goto('/concierge/owner?section=concierge');
  await page.getByLabel('Owner key').fill(OWNER_KEY);
  await page.getByRole('button', { name: 'Open the console' }).click();
  await expect(page.getByText('Telegram to Arron')).toBeVisible();
  await page
    .getByLabel('Start with the travel credential already presented')
    .check();
  await page
    .getByRole('button', { name: /In flight \(default release/ })
    .click();
  await expect(page).toHaveURL(/\/departure$/);
  await expect(page.getByLabel('Rehearsal')).toBeVisible();
  await page.getByRole('button', { name: 'Enter the lounge' }).click();
  await page
    .getByRole('button', { name: 'Break the seal: In-Flight Refreshment' })
    .click();
  const card = page.getByRole('dialog');
  await card.getByLabel('Champagne').check();
  await card.getByRole('button', { name: 'Inform Arron' }).click();
  await expect(
    card.getByText('Rehearsal recorded. No notification was sent.'),
  ).toBeVisible();

  expect(await requests(request)).toHaveLength(0);

  // The live journey is untouched.
  const live = await request.get('/api/owner/overview?realm=live', {
    headers: { 'x-owner-key': OWNER_KEY },
  });
  expect((await live.json()).redemptions).toEqual([]);

  // Ending the rehearsal returns this device to the live journey.
  await page.getByRole('button', { name: 'Close' }).click();
  await page
    .getByLabel('Rehearsal')
    .getByRole('button', { name: 'End' })
    .click();
  await expect(page).toHaveURL(/\/concierge\/owner$/);
  await expect(page.getByLabel('Rehearsal')).toHaveCount(0);
});

test.describe('the membership card on the birthday', () => {
  test.use({ timezoneId: 'America/Jamaica' });

  // One entrance only (ADR-023, amended 21 Oct): 21 October at 19:00 UK,
  // authorised by the server. That ceremony, the scan and the printed number
  // are rehearsed end to end in tests/release.spec.ts.
  test('the card is recognised, but on the birthday it opens nothing by itself', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-10-24T06:00:00Z') });
    await page.goto('/');
    const club = page.locator('.club');
    await expect(club).not.toHaveAttribute(
      'data-stage',
      /unlocking|opening|foyer|awaiting/,
    );

    await page.goto(MEMBERSHIP_LINK);
    await expect(page).toHaveURL(/\/$/);
    // The concierge recognised it: this device now holds the card.
    expect(
      await page.evaluate(() =>
        localStorage.getItem('thirty-club:concierge-session'),
      ),
    ).toBeTruthy();
    await page.clock.runFor(15_000);
    await expect(club).not.toHaveAttribute(
      'data-stage',
      /unlocking|opening|foyer/,
    );
    await expect(
      page.getByRole('button', { name: 'Enter the club' }),
    ).toHaveCount(0);
  });
});
