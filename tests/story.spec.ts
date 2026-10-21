/** One continuous TEST recipient record, 22–25 October. Never contacts a provider. */
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const centre = '/concierge/owner/test';
async function ownerPage(page: Page) {
  if (!page.url().includes(`${centre}?section=office&tab=journey`))
    await page.goto(`${centre}?section=office&tab=journey`);
}
async function call(page: Page, path: string, body?: unknown, method?: string) {
  return page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch(`/api/v1${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: {
          'content-type': 'application/json',
          'x-concierge-request': '1',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${path}: ${JSON.stringify(data)}`);
      return data;
    },
    { path, body, method },
  );
}
async function clock(page: Page, wall: string, zone = 'America/Jamaica') {
  await page.goto(`${centre}?section=rehearsal`);
  await page.getByLabel('Date and time', { exact: true }).fill(wall);
  await page
    .getByRole('combobox', { name: 'Time zone', exact: true })
    .selectOption(zone);
  await page
    .getByRole('button', { name: 'Set the clock', exact: true })
    .click();
  await expect(page.locator('.rehearsal-desk .cc-notice')).toContainText(
    `Clock set to ${wall}`,
    { timeout: 90000 },
  );
}
async function approve(
  page: Page,
  key: string,
  setup: Record<string, unknown> = {},
) {
  await ownerPage(page);
  await call(page, `/owner/journey/milestones/${key}`, setup, 'PATCH');
  await call(
    page,
    `/owner/journey/milestones/${key}`,
    { storyApproved: true },
    'PATCH',
  );
}
async function fire(page: Page, key: string) {
  const result = await call(page, `/owner/journey/milestones/${key}/fire`, {});
  expect(result.milestone.state, result.milestone.lastError).toBe('fired');
}
async function gift(
  page: Page,
  number: number,
  clue: string,
  location: string,
  trigger = 'manual',
) {
  await ownerPage(page);
  const result = await call(page, '/owner/vaults', {
    displayNumber: number,
    clue,
    giftLocation: location,
    trigger,
    availableAt: null,
    casinoRewardId: trigger === 'casino' ? 'casino.evening-jackpot' : null,
    opensAt: '2026-10-22T07:00:00Z',
  });
  if (trigger === 'manual')
    await call(page, `/owner/vaults/${result.vault.id}/ready`, {});
  return result.vault;
}
async function screenshot(page: Page, name: string) {
  mkdirSync('test-results/story', { recursive: true });
  await page.screenshot({
    path: `test-results/story/${test.info().project.name}-${name}.png`,
    fullPage: true,
  });
}
async function machine(page: Page, beforePrize?: () => Promise<void>) {
  if (!new URL(page.url()).pathname.includes('/rooms/casino'))
    await page.goto('/rooms/casino');
  await expect(page.locator('.casino[data-house="true"]')).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: /The Machine/ }).click();
  await expect(page.locator('.panel--slots .panel__fine')).toHaveText(
    '3 complimentary spins at your pleasure',
    { timeout: 60000 },
  );
  await beforePrize?.();
  const lever = page.getByRole('button', { name: /Pull the lever/ });
  for (const remaining of ['2 complimentary spins', 'One complimentary spin']) {
    await lever.click();
    await expect(page.locator('.panel--slots .panel__fine')).toHaveText(
      `${remaining} at your pleasure`,
      { timeout: 30000 },
    );
    await expect(page.locator('.house-prize')).toHaveCount(0);
    await beforePrize?.();
  }
  await lever.click();
  await expect(page.locator('.house-prize')).toBeVisible({ timeout: 30000 });
}

// Story Bible: “23 OCTOBER — THREE FIXED CASINO SESSIONS”. These
// are the three documented sessions, not a fabricated quota-filling session.
const casinoPlan = [
  {
    at: '2026-10-23T14:00:00Z',
    next: '2026-10-23T19:30:00Z',
    slug: 'jamaica-drinks',
  },
  {
    at: '2026-10-23T19:30:00Z',
    next: '2026-10-24T01:30:00Z',
    slug: 'nyla-film',
  },
  {
    at: '2026-10-24T01:30:00Z',
    next: '2026-10-24T05:00:00Z',
    slug: 'evening-jackpot',
  },
] as const;
async function casinoLedger(page: Page, released: number) {
  // Read the recipient API as the recipient, preserving any current prize
  // presentation. TEST owner documents deliberately use a separate session.
  if (page.url().includes(centre)) await page.goto('/lounge');
  const status = await call(page, '/casino');
  expect(status.spins).toHaveLength(released * 3);
  expect(new Set(status.spins.map((s: { id: string }) => s.id)).size).toBe(
    released * 3,
  );
  expect(status.available).toBe(0);
  type PlayedSpin = {
    id: string;
    batchId: string;
    position: number;
    createdAt: string;
    prize: { slug: string } | null;
  };
  const groups = new Map<string, PlayedSpin[]>();
  for (const spin of status.spins as PlayedSpin[])
    groups.set(spin.batchId, [...(groups.get(spin.batchId) ?? []), spin]);
  const ordered = [...groups.values()]
    .map((spins) => spins.sort((a, b) => a.position - b.position))
    .sort((a, b) => Date.parse(a[0]!.createdAt) - Date.parse(b[0]!.createdAt));
  expect(ordered).toHaveLength(released);
  for (const [i, spins] of ordered.entries()) {
    expect(spins).toHaveLength(3);
    expect(spins.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(spins[0]!.prize).toBeNull();
    expect(spins[1]!.prize).toBeNull();
    expect(spins[2]!.prize?.slug).toBe(casinoPlan[i]!.slug);
    for (const spin of spins) {
      expect(Date.parse(spin.createdAt)).toBeGreaterThanOrEqual(
        Date.parse(casinoPlan[i]!.at),
      );
      expect(Date.parse(spin.createdAt)).toBeLessThan(
        Date.parse(casinoPlan[i]!.next),
      );
    }
  }
  return status;
}

test('22–25 October: all nine Casino spins, physical actions, invitations and persistence in order', async ({
  page,
  context,
}) => {
  const outbound: string[] = [];
  await context.addInitScript(() => {
    localStorage.setItem(
      'thirty-club:first-visit-verified',
      '2026-10-18T00:00:00Z',
    );
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
  await page.goto('/');
  for (let i = 0; i < 5; i++) await page.locator('.timepiece').tap();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page
    .getByRole('button', { name: /^Casino opening \(admission ceremony\)/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 90000 });
  page.on('request', (r) => {
    if (
      new URL(r.url()).pathname.startsWith('/api/') ||
      /supabase|twilio|telegram/.test(new URL(r.url()).hostname)
    )
      outbound.push(r.url());
  });

  console.log('TEST chronology: 22 Oct gifts and departure');
  await clock(page, '2026-10-22T08:30', 'Europe/London');
  await ownerPage(page);
  await fire(page, 'early-membership');
  const shoes = await gift(
    page,
    1,
    'TEST: beside the pillow',
    'TEST: look in the shoe cupboard.',
  );
  await approve(page, 'departure-ugg', { storyVaultId: shoes.id });
  await fire(page, 'departure-ugg');
  await page.goto(`/v/${shoes.nfcToken}`);
  await expect(page.getByRole('button', { name: 'Turn the key' })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Turn the key' }).click();
  await expect(page.getByText('TEST: look in the shoe cupboard.')).toBeVisible({
    timeout: 30000,
  });
  await page.reload();
  await page.getByRole('button', { name: 'No. 001 Opened' }).click();
  await expect(page.getByText('TEST: look in the shoe cupboard.')).toBeVisible({
    timeout: 60000,
  });
  await screenshot(page, '22-physical-gift');

  await approve(page, 'departure-privileges', {
    storySms: 'TEST departure invitation https://30.ag14.co/departure',
  });
  await fire(page, 'departure-privileges');
  await page.goto('/departure');
  await expect(
    page.getByRole('heading', { name: 'Your Departure Lounge Awaits' }),
  ).toBeVisible({ timeout: 60000 });
  await page
    .getByLabel('Your message to the Butler')
    .fill('TEST: Hello Butler, we are on our way.');
  await page.getByRole('button', { name: 'Hand it to the Butler' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Your introduction is recorded' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(/No further action is needed/)).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByLabel('Your message to the Butler')).toHaveCount(0);
  await approve(page, 'airport-drinks', {
    storySms: 'TEST airport letter https://30.ag14.co/lounge',
  });
  await fire(page, 'airport-drinks');
  await page.goto('/lounge');
  await page.getByRole('button', { name: 'Club Menu', exact: true }).click();
  await page
    .getByRole('button', { name: 'Privileges Collection', exact: true })
    .click();
  await expect(page.getByLabel('2 of 2 drinks remaining')).toBeVisible({
    timeout: 60000,
  });
  await page.getByLabel('What may I bring you?').fill('TEST: a coffee, please');
  await page.getByRole('button', { name: 'Request this drink' }).click();
  await expect(page.getByLabel('1 of 2 drinks remaining')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Club Menu', exact: true }).click();
  await page
    .getByRole('button', { name: 'Privileges Collection', exact: true })
    .click();
  await expect(page.getByLabel('1 of 2 drinks remaining')).toBeVisible({
    timeout: 60000,
  });
  const pods = await gift(
    page,
    2,
    'TEST: Albert is in Arron’s bag',
    'TEST: ask your husband to hand over the present.',
  );
  await approve(page, 'departure-airpods', {
    storyVaultId: pods.id,
    storySms: 'TEST gate letter https://30.ag14.co/lounge',
  });
  await fire(page, 'departure-airpods');
  await page.goto('/correspondence');
  await page
    .getByRole('link', { name: /A Rather Concerning Development/ })
    .click();
  await page.getByRole('button', { name: /Break the seal/ }).click();
  await expect(
    page.getByText("Your husband's bag.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.cd-paper')).not.toContainText('AirPods');

  console.log('TEST chronology: 23 Oct opening');
  await clock(page, '2026-10-23T08:59');
  await casinoLedger(page, 0);
  await approve(page, 'casino-opening-spins');
  await call(page, '/owner/journey/milestones/casino-opening-spins/resume', {});
  await approve(page, 'casino-opening', {
    storySms: 'TEST Casino invitation https://30.ag14.co/lounge',
  });
  await call(page, '/owner/journey/milestones/casino-opening/resume', {});
  await page.goto('/rooms/casino');
  await expect(
    page.getByRole('heading', { name: 'Not this way, Madam.' }),
  ).toBeVisible({ timeout: 60000 });
  await clock(page, '2026-10-23T09:00');
  await page.goto('/lounge');
  const admission = page
    .getByRole('dialog')
    .filter({ hasText: '1,000 complimentary tokens' });
  await expect(admission).toBeVisible({ timeout: 60000 });
  await admission.getByRole('button', { name: 'Keep it for later' }).click();
  await page.reload();
  await expect(admission).toBeVisible({ timeout: 60000 });
  await admission
    .getByRole('button', { name: 'ENTER THE GRAND CASINO', exact: true })
    .click();
  await expect(page.locator('.casino[data-house="true"]')).toBeVisible({
    timeout: 60000,
  });
  await machine(page);
  const morning = await casinoLedger(page, 1);
  expect((await call(page, '/drinks')).jamaica.available).toBe(0);
  await expect(
    page.getByRole('button', { name: 'Claim your 3 drinks' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Claim your 3 drinks' }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Claim your 3 drinks' }).click();
  await expect(
    page.getByText('3 drinks are yours, Madam.', { exact: false }),
  ).toBeVisible();
  await call(page, '/vouchers/claim', {
    id: morning.spins.find((s: { prize: unknown }) => s.prize)?.entitlementId,
  });
  expect((await call(page, '/drinks')).jamaica.available).toBe(3);
  await casinoLedger(page, 1);
  await screenshot(page, '23-claim');

  console.log('TEST chronology: 23 Oct Nyla');
  await clock(page, '2026-10-23T14:29');
  await casinoLedger(page, 1);
  await ownerPage(page);
  const catalogue = await call(page, '/owner/casino/prizes');
  const film = catalogue.prizes.find(
    (p: { slug: string }) => p.slug === 'nyla-film',
  );
  await call(
    page,
    `/owner/casino/prizes/${film.id}`,
    {
      ...Object.fromEntries(
        Object.entries(film).filter(([k]) => !['id'].includes(k)),
      ),
      active: true,
      videoUrl: '/api/v1/media/nyla-film',
    },
    'PATCH',
  );
  await approve(page, 'casino-afternoon-spins', {
    storySms: 'TEST afternoon return https://30.ag14.co/rooms/casino',
  });
  await call(
    page,
    '/owner/journey/milestones/casino-afternoon-spins/resume',
    {},
  );
  await clock(page, '2026-10-23T14:30');
  await machine(page, async () => {
    await expect(call(page, '/media/nyla-film')).rejects.toThrow('forbidden');
  });
  await expect(page.getByText(/Our Head of Security, Miss Nyla/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Watch', exact: true }),
  ).toBeVisible();
  await casinoLedger(page, 2);
  expect((await call(page, '/media/nyla-film')).simulated).toBe(true);
  await screenshot(page, '23-nyla');
  await page.getByRole('button', { name: 'Return to the table' }).click();
  await page.goto('/lounge');
  await page
    .getByRole('button', { name: 'Your Casino vouchers', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog', { name: 'Your vouchers' })
      .getByRole('button', { name: 'Watch again' }),
  ).toBeVisible();
  // Replay remains available after re-entry without buying/consuming a spin.
  await page.reload();
  await page
    .getByRole('button', { name: 'Your Casino vouchers', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Watch again', exact: true }),
  ).toBeVisible();
  await casinoLedger(page, 2);

  console.log('TEST chronology: 23 Oct jackpot');
  await clock(page, '2026-10-23T20:29');
  await casinoLedger(page, 2);
  const breakfast = await gift(
    page,
    3,
    'TEST: where the little things you carry hide',
    'TEST: Birthday Breakfast in Bed, 24 October at 10:30 Jamaica.',
    'casino',
  );
  await call(page, '/owner/casino/prizes', {
    title: 'Mystery Prize',
    description: 'A mystery',
    presentation: 'A mystery awaits',
    kind: 'VAULT_GIFT',
    vaultId: breakfast.id,
    active: true,
    slug: 'evening-jackpot',
    instructions: '',
    ownerNotes: 'TEST only',
    validUntil: null,
    imageUrl: null,
  });
  await approve(page, 'casino-evening-spins', {
    storySms: 'TEST evening return https://30.ag14.co/rooms/casino',
  });
  await call(page, '/owner/journey/milestones/casino-evening-spins/resume', {});
  await clock(page, '2026-10-23T20:30');
  await machine(page);
  await expect(page.locator('.house-prize')).toContainText(
    'Some treasures travel far',
  );
  await expect(page.locator('.house-prize')).not.toContainText('Breakfast');
  const nine = await casinoLedger(page, 3);
  const last = nine.spins.find(
    (s: { prize: { slug: string } | null }) =>
      s.prize?.slug === 'evening-jackpot',
  );
  const retried = await call(page, '/casino/spins', {
    idempotencyKey: last.idempotencyKey,
  });
  expect(retried.id).toBe(last.id);
  expect(retried.duplicate).toBe(true);
  await expect(
    call(page, '/casino/spins', { idempotencyKey: 'TEST-no-tenth-spin' }),
  ).rejects.toThrow('not-open');
  await page.reload();
  await casinoLedger(page, 3);

  await page.goto(`/v/${breakfast.nfcToken}`);
  await page.getByRole('button', { name: 'Turn the key' }).click();
  await expect(
    page.getByText(
      'TEST: Birthday Breakfast in Bed, 24 October at 10:30 Jamaica.',
    ),
  ).toBeVisible({ timeout: 30000 });

  console.log('TEST chronology: 24 Oct midnight');
  await clock(page, '2026-10-23T23:59');
  await approve(page, 'birthday-screening');
  await call(page, '/owner/journey/milestones/birthday-screening/resume', {});
  await page.goto('/rooms/screening-room');
  await expect(
    page.getByRole('heading', { name: 'Not this way, Madam.' }),
  ).toBeVisible({ timeout: 60000 });
  await expect(call(page, '/media/birthday-film')).rejects.toThrow('forbidden');
  await clock(page, '2026-10-24T00:00');
  await page.goto('/lounge');
  const screening = page
    .getByRole('dialog')
    .filter({ hasText: 'The reason for it all has always been you.' });
  await expect(screening).toBeVisible({ timeout: 60000 });
  await screening.getByRole('button', { name: 'Keep it for later' }).click();
  await page.reload();
  await expect(screening).toBeVisible({ timeout: 60000 });
  await expect(call(page, '/media/birthday-film')).rejects.toThrow('forbidden');
  await screenshot(page, '24-pending-midnight-invitation');
  // The protected-media route is integrated; the TEST ticket uses the five-second fixture.
  // Actual prints and storage are checked separately by test:media.
  console.log('TEST chronology: 25 Oct persistence');
  await clock(page, '2026-10-25T18:00');
  await ownerPage(page);
  const journey = await call(page, '/owner/journey');
  for (const key of ['birthday-breakfast', 'birthday-card', 'farewell'])
    expect(
      journey.milestones.find((m: { key: string }) => m.key === key).state,
    ).toBe('held');
  await expect(page.locator('body')).not.toContainText('Seven Mile Beach');
  await casinoLedger(page, 3);
  expect(outbound).toEqual([]);
});

test('owner can review physical setup on an iPhone without releasing a scene', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      'thirty-club:first-visit-verified',
      '2026-10-18T00:00:00Z',
    );
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
  await page.goto('/');
  for (let i = 0; i < 5; i++) await page.locator('.timepiece').tap();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page
    .getByRole('button', { name: /^Casino opening \(admission ceremony\)/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'The Members’ Lounge' }),
  ).toBeVisible({ timeout: 90000 });
  await clock(page, '2026-10-22T08:30', 'Europe/London');
  const drawer = await gift(page, 4, 'TEST physical setup', 'TEST location');
  await page.reload();
  const row = page
    .locator('.office-journey__milestone')
    .filter({ has: page.locator('strong', { hasText: /footwear delivery/i }) })
    .first();
  await expect(row).toBeVisible({ timeout: 60000 });
  await row
    .getByRole('button', { name: 'Edit SMS and physical mapping' })
    .click();
  await row
    .getByLabel('Exact outbound SMS')
    .fill('TEST approved clue: https://30.ag14.co/vault');
  await row.getByLabel('Physical gift compartment').selectOption(drawer.id);
  await row.getByRole('button', { name: 'Save story setup' }).click();
  await expect(row).toContainText('Editorial review: required');
  await expect(
    row.getByRole('button', { name: 'Trigger now', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Approve reviewed story' }).click();
  await expect(row).toContainText('Editorial review: approved');
  await expect(
    row.getByRole('button', { name: 'Resume', exact: true }),
  ).toBeDisabled();
  await expect(
    row.getByRole('button', { name: 'Trigger now', exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(row).toContainText('Editorial review: approved', {
    timeout: 60000,
  });
  await expect(row).toContainText('TEST approved clue');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await screenshot(page, 'owner-mobile-reviewed');
  // A real backend failure must remain visible after the desk reloads.
  await call(
    page,
    `/owner/vaults/${drawer.id}`,
    {
      displayNumber: 4,
      clue: 'TEST physical setup',
      giftLocation: 'TEST location',
      trigger: 'manual',
      availableAt: null,
      casinoRewardId: null,
      opensAt: '2026-10-23T07:00:00Z',
    },
    'PATCH',
  );
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Trigger now', exact: true }).click();
  await expect(row).toContainText('Last error', { timeout: 60000 });
  await expect(page.locator('.office-error[role="alert"]')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('has been triggered.');
});

test('Nyla replay starts a real TEST film twice without another spin or prize', async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    localStorage.setItem(
      'thirty-club:first-visit-verified',
      '2026-10-18T00:00:00Z',
    );
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      value: undefined,
    });
  });
  await page.goto('/');
  for (let i = 0; i < 5; i++) await page.locator('.timepiece').tap();
  await page.getByLabel('Private access code').fill('1414');
  await page.getByRole('button', { name: 'Unlock private office' }).click();
  await page.getByRole('button', { name: 'Open Dev Mode' }).click();
  await page
    .getByRole('button', { name: /^Casino afternoon: Nyla’s film/ })
    .first()
    .click();
  await page.waitForURL('**/rooms/casino');
  await machine(page);
  await page.getByRole('button', { name: 'Return to the table' }).click();
  const before = await call(page, '/casino');
  expect(before.spins).toHaveLength(3);
  expect(before.available).toBe(0);
  const ids = before.spins.map((s: { id: string }) => s.id).sort();
  for (let replay = 0; replay < 2; replay++) {
    await page.goto('/lounge');
    await page
      .getByRole('button', { name: 'Your Casino vouchers', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Watch again', exact: true })
      .click();
    const video = page.locator('.voucher-wallet__film video');
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await video.evaluate((v: HTMLVideoElement) => v.pause());
    const after = await call(page, '/casino');
    expect(after.spins.map((s: { id: string }) => s.id).sort()).toEqual(ids);
    expect(after.available).toBe(0);
    const prizes = await call(page, '/vouchers');
    expect(prizes.entitlements).toHaveLength(1);
    await page.reload();
  }
});
