/**
 * The Owner Control Centre (LIVE / TEST) and the universal rehearsal engine
 * on an iPhone-sized browser. TEST runs the real backend handlers and
 * migrations in the browser (PGlite); every API call is checked to stay in
 * the tab. Screenshots go to docs/rehearsal/screenshots for review.
 */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type Request } from '@playwright/test';

const SHOTS = process.env.REHEARSAL_SHOTS ?? 'docs/rehearsal/screenshots';
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string, settle = 700) {
  await page.waitForTimeout(settle);
  await page.screenshot({
    path: `${SHOTS}/${name}.jpg`,
    type: 'jpeg',
    quality: 80,
  });
}

/** Every request that reached the preview server's API. */
function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on('request', (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/'))
      calls.push(`${request.method()} ${url.pathname}`);
  });
  return calls;
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      'thirty-club:first-visit-verified',
      '2026-10-18T00:00:00.000Z',
    );
    // Poster entrance: software WebGL is far too slow for timing checks.
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
});

async function unlock(page: Page) {
  await page.goto('/');
  for (let i = 0; i < 5; i++) await page.locator('.timepiece').tap();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Dev Mode' }),
  ).toBeVisible();
}

async function devMenu(page: Page) {
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await expect(page.getByRole('dialog', { name: 'Dev Mode' })).toBeVisible();
}

async function launch(page: Page, name: string | RegExp) {
  await devMenu(page);
  await page.getByRole('button', { name }).first().click();
  await page.waitForLoadState('load');
}

test('TEST control centre: simulated office, letter, request, SMS, all in the tab', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.goto('/concierge/owner/test');
  await expect(
    page.getByRole('heading', { name: 'Simulated clock' }),
  ).toBeVisible();
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90000 },
  );
  await shot(page, '01-test-rehearsal');

  await page
    .getByRole('button', { name: /Deliver a rehearsal letter now/ })
    .click();
  await expect(page.getByText(/A rehearsal letter was delivered/)).toBeVisible({
    timeout: 30000,
  });
  await page
    .getByLabel('A word with the Butler, as Alise')
    .fill('Rehearsal: may I have breakfast on the terrace?');
  await page
    .getByRole('button', { name: 'Submit a simulated request' })
    .click();
  await expect(page.getByText(/request arrived in Butler/)).toBeVisible({
    timeout: 30000,
  });

  await page.getByRole('button', { name: 'Butler’s Office' }).click();
  await expect(page.getByText('Recent activity')).toBeVisible({
    timeout: 30000,
  });
  await shot(page, '02-test-office-overview');
  await page.getByRole('button', { name: 'requests', exact: true }).click();
  await expect(
    page.getByText('may I have breakfast on the terrace'),
  ).toBeVisible();
  await shot(page, '03-test-office-requests');
  await page
    .getByRole('button', { name: 'correspondence', exact: true })
    .click();
  await expect(
    page.getByText('Rehearsal · A word before Thursday').first(),
  ).toBeVisible();
  await shot(page, '04-test-office-correspondence');

  await page.getByRole('button', { name: 'Concierge & privileges' }).click();
  await expect(page.getByText('Shopping Privilege')).toBeVisible({
    timeout: 30000,
  });
  await shot(page, '05-test-concierge');
  expect(calls).toEqual([]);
});

test('Dev Menu launches every room into a coherent rehearsal', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);

  await launch(page, /^The Gift Vault/);
  await expect(page.locator('.gift-vault')).toBeVisible({ timeout: 60000 });
  const plaque = page.locator('.vault-plaque').first();
  await expect(plaque).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.vault-plaque')).toHaveCount(3);
  await shot(page, '10-vault-chamber', 1500);
  await plaque.click();
  await expect(page.locator('.vault-clue__text')).toContainText(
    'Rehearsal clue',
  );
  await shot(page, '11-vault-clue');
  await page.getByRole('button', { name: 'Simulate finding the key' }).click();
  await page.getByRole('button', { name: 'Turn the key' }).click();
  await expect(page.getByText(/Rehearsal location/)).toBeVisible({
    timeout: 30000,
  });
  await shot(page, '12-vault-revealed');

  await page.goto('/');
  await launch(page, /^The Grand Casino/);
  await expect(page.locator('.casino')).toBeVisible({ timeout: 60000 });
  await shot(page, '13-casino', 1500);

  await page.goto('/');
  await launch(page, /^The Private Screening Room/);
  await expect(page.locator('.cinema').first()).toBeVisible({
    timeout: 60000,
  });
  await shot(page, '14-screening', 1200);

  await page.goto('/');
  await launch(page, /^The Members’ Lounge/);
  await expect(page.locator('.lounge')).toBeVisible({ timeout: 60000 });
  await shot(page, '15-lounge', 1500);

  await launch(page, /^The Departure Lounge\b(?! \(find)/);
  await expect(page.locator('.departure').first()).toBeVisible({
    timeout: 60000,
  });
  await shot(page, '16-departure', 1500);

  await launch(page, /^The Grand Entrance/);
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  await shot(page, '17-entrance-locked', 1200);
  expect(calls).toEqual([]);
});

test('Entrance letters: unread on the step, gone once opened, kept in My Correspondence', async ({
  page,
}) => {
  await unlock(page);
  await page.goto('/concierge/owner/test');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90000 },
  );
  await page.getByRole('button', { name: /Before departure/ }).click();
  await page.waitForURL('**/');
  const step = page.locator('.step-letter:not(.arrived-letter)');
  await expect(step).toBeVisible();
  await shot(page, '20-step-letter-unread');
  await step.click();
  await expect(
    page.getByText('Your membership has been approved.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(step).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.club')).toHaveAttribute('data-stage', 'locked');
  await expect(step).toHaveCount(0);
  await shot(page, '21-step-letter-opened');

  // A Desk letter: envelope at the doors until opened.
  await page.goto('/concierge/owner/test');
  await page
    .getByRole('button', { name: /Deliver a rehearsal letter now/ })
    .click();
  await expect(page.getByText(/A rehearsal letter was delivered/)).toBeVisible({
    timeout: 30000,
  });
  await page.goto('/');
  const envelope = page.locator('.arrived-letter');
  await expect(envelope).toBeVisible({ timeout: 20000 });
  await shot(page, '22-desk-letter-at-doors');
  await envelope.click();
  await page
    .getByRole('button', { name: /Break the seal|Open the letter/ })
    .first()
    .click();
  await expect(page.locator('.cd-paper__body')).toBeVisible({ timeout: 10000 });
  await shot(page, '23-desk-letter-open');
  await page.locator('.bs-return').click();
  // The Desk letter has been read. "Before departure" (21 Oct) is after the
  // default early-membership milestone (20 Oct 13:00 Jamaica, ADR-020), so
  // the only letter still waiting is the Butler's Lounge invitation.
  await expect(envelope).toHaveAttribute(
    'aria-label',
    'Open your new letter: The Members’ Lounge is open to you',
  );

  // Both remain in My Correspondence.
  await page.getByRole('button', { name: 'Ring for service' }).first().click();
  await page.getByRole('button', { name: /My Correspondence/ }).click();
  await expect(page.locator('.bs-subhead')).toHaveText('From the concierge');
  await expect(page.getByText('A letter from the concierge')).toBeVisible();
  await shot(page, '24-my-correspondence');
});

test('A letter that mentions a Casino she has not been admitted to names nothing to her', async ({
  page,
}) => {
  await unlock(page);
  await page.goto('/concierge/owner/test');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90000 },
  );
  await page.getByRole('button', { name: /Before departure/ }).click();
  await page.waitForURL('**/');
  await page.goto('/concierge/owner/test');
  // The second sample letter mentions the Grand Casino.
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole('button', { name: /Deliver a rehearsal letter now/ })
      .click();
    await expect(
      page.getByText(/A rehearsal letter was delivered/),
    ).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(400);
  }
  await page.goto('/correspondence');
  await page.getByText('Rehearsal · An evening at the tables').click();
  await page
    .getByRole('button', { name: /Break the seal|Open the letter/ })
    .first()
    .click();
  await expect(page.locator('.cd-paper__body')).toBeVisible({
    timeout: 10000,
  });
  // ADR-020: not admitted, so no way in and no opening time; only the
  // owner's rehearsal launch is offered in Dev Mode.
  await expect(page.getByText(/is not open yet/)).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /Enter the Grand Casino/ }),
  ).toHaveCount(0);
  await shot(page, '30-casino-invitation-locked');
  await page
    .getByRole('button', { name: /Rehearsal: launch The Grand Casino/ })
    .click();
  await expect(page.locator('.casino')).toBeVisible({ timeout: 60000 });
});

test('Scenario: birthday midnight plays the door ceremony into the induction', async ({
  page,
}) => {
  await unlock(page);
  await devMenu(page);
  await page.getByRole('button', { name: /^Birthday midnight/ }).click();
  await page.waitForURL('**/');
  await expect(page.locator('.club')).toHaveAttribute(
    'data-stage',
    /locked|final-minute/,
  );
  await shot(page, '40-midnight-before', 300);
  await expect(page.locator('.lounge')).toBeVisible({ timeout: 30000 });
  await shot(page, '41-midnight-lounge', 1500);
});

test('LIVE is the real Owner Console; /owner resolves to it', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.goto('/owner?tab=vault');
  await expect(page).toHaveURL(/\/concierge\/owner\?.*section=office/);
  await expect(page.getByRole('link', { name: /LIVE/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page.getByText('Sign in with your private office password.'),
  ).toBeVisible();
  await shot(page, '50-live-sign-in');
  // LIVE went to the real (here: local) server, not the simulation.
  expect(calls).toContain('GET /api/v1/auth/session');
  await page.getByRole('button', { name: 'Concierge & privileges' }).click();
  await expect(page.getByLabel('Owner key')).toBeVisible();
});

test('A scheduled Butler SMS becomes due when the rehearsal clock reaches it', async ({
  page,
}) => {
  await unlock(page);
  const calls = apiCalls(page);
  await page.goto('/concierge/owner/test?section=office&tab=messages');
  await expect(
    page.getByRole('heading', { name: 'Write to Alise' }),
  ).toBeVisible({
    timeout: 90000,
  });
  const form = page.locator('form.desk-editor').first();
  await form
    .getByLabel('The Butler’s message')
    .fill('Rehearsal: a car will collect you at ten o’clock.');
  await form.getByLabel('Schedule for later').check();
  await form.getByLabel('Time zone').selectOption('America/Jamaica');
  await form.getByLabel('Date and time').fill('2026-10-24T10:00');
  await form.getByRole('button', { name: 'Schedule SMS' }).click();
  await form.getByRole('button', { name: 'Yes, schedule it' }).click();
  const card = page.locator('.desk-card[data-stage]').first();
  await expect(card).toHaveAttribute('data-stage', 'scheduled');
  await shot(page, '60-sms-scheduled');

  // The timeline lists it; jump there and let the round run.
  await page.getByRole('button', { name: 'Rehearsal' }).click();
  const item = page
    .locator('.cc-timeline li')
    .filter({ hasText: 'Butler SMS: Rehearsal: a car' });
  await expect(item).toBeVisible({ timeout: 30000 });
  await shot(page, '61-timeline-with-sms');
  await item.getByRole('button', { name: 'Jump to 10 s before' }).click();
  await page.getByRole('button', { name: '+1 min' }).click();
  await expect(page.getByText(/Advanced \+1 min/)).toBeVisible({
    timeout: 30000,
  });

  await page.getByRole('button', { name: 'Butler’s Office' }).click();
  await page.getByRole('button', { name: 'messages', exact: true }).click();
  await expect(page.locator('.desk-card[data-stage]').first()).toHaveAttribute(
    'data-stage',
    'delivered',
    { timeout: 30000 },
  );
  await shot(page, '62-sms-delivered-simulated');
  expect(calls).toEqual([]);
});

test('A simulated Casino jackpot creates the prize and releases its compartment', async ({
  page,
}) => {
  await unlock(page);
  await page.goto('/concierge/owner/test');
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    { timeout: 90000 },
  );
  await page.getByRole('button', { name: /Simulate a Casino jackpot/ }).click();
  await expect(page.getByText(/Jackpot recorded/)).toContainText(
    '1 compartment(s) were released',
    { timeout: 30000 },
  );
  await expect(page.locator('.cc-codes')).toContainText(
    'Vault No. 3 · ready · casino',
  );
  await shot(page, '70-jackpot-recorded');
  const ledger = await page.evaluate(() =>
    sessionStorage.getItem('thirty-club:owner:thirty-club:prizes'),
  );
  expect(ledger).toContain('casino.vault-key-one');
  // Alise's own ledger is untouched.
  expect(
    await page.evaluate(() => localStorage.getItem('thirty-club:prizes')),
  ).toBeNull();
});

test('TEST control centre starts the simulated office in the tab', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await unlock(page);
  const calls = apiCalls(page);
  await page.goto('/concierge/owner/test');
  await expect(
    page.getByRole('heading', { name: 'Simulated clock' }),
  ).toBeVisible();
  await expect(page.getByText('Starting the simulated club office')).toBeHidden(
    {
      timeout: 90000,
    },
  );
  await shot(page, '00-test-start');
  console.log(errors.join('\n'));
  console.log((await page.locator('.rehearsal-desk').innerText()).slice(-1500));
  expect(calls).toEqual([]);
});
