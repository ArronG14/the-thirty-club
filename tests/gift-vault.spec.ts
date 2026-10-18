/**
 * The Gift Vault vertical slice, end to end on a phone-sized Chromium
 * against the local PostgreSQL rehearsal API (no SMS provider, in-memory
 * data): office → compartment → ready → NFC deep link → membership →
 * opening → reload → revisit, plus a non-destructive owner preview.
 */
import { expect, test, type Page } from '@playwright/test';

const OWNER_PASSWORD = 'thirty-club-local-rehearsal-only';
// The local concierge API's test membership code (netlify/concierge/testing.ts).
const MEMBERSHIP_CODE = 'TC-3010-2410';
const CLUE = 'A place where dreams begin and mornings are reluctant to arrive.';
const LOCATION = 'Inside the black suitcase, beneath the folded clothes.';

async function signIn(page: Page) {
  await page.goto('/owner');
  await page.getByLabel('Password', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Enter the office' }).click();
  await page.getByRole('button', { name: 'vault', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'The Private Gift Vault' }),
  ).toBeVisible();
}

async function createCompartment(page: Page, clue: string, location: string) {
  await page.getByRole('button', { name: 'Create a compartment' }).click();
  await page.getByLabel(/NFC clue/).fill(clue);
  await page.getByLabel(/Gift location/).fill(location);
  await page.getByRole('button', { name: 'Save compartment' }).click();
  await expect(page.getByText(/Compartment \d{3} saved\./)).toBeVisible();
}

test('owner configures a compartment; Alise scans, authenticates, opens and revisits it', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await createCompartment(page, CLUE, LOCATION);
  const card = page.locator('.office-vault__card').first();
  await expect(card.locator('.office-vault__state')).toHaveText('Locked');
  const nfcUrl = (await card.locator('.office-vault__url').textContent())!;
  expect(nfcUrl).toMatch(/\/v\/[A-Za-z0-9_-]{43}$/);
  await card.getByRole('button', { name: 'Make ready' }).click();
  await expect(card.locator('.office-vault__state')).toHaveText('Ready');
  // Local-only switch: the birthday time-lock is otherwise 24 October.
  await page.request.post('/api/v1/__local/vault-gate', {
    data: { open: true },
  });

  const alise = await browser.newContext({
    baseURL: 'http://127.0.0.1:4180',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await alise.newPage();
  // The tag opens Safari straight onto its URL: no entrance, no lounge.
  await phone.goto(new URL(nfcUrl).pathname);
  await expect(phone).toHaveURL(/\/vault$/);
  await expect(phone.getByText(/asks to see your membership/)).toBeVisible();
  // The found key survives a reload while she fetches her card.
  await phone.reload();
  await expect(phone.getByLabel('Membership number')).toBeVisible();
  await phone.getByLabel('Membership number').fill(MEMBERSHIP_CODE);
  await phone.getByRole('button', { name: 'Present my membership' }).click();
  await expect(
    phone.getByText(/The key is genuine, and it fits/),
  ).toBeVisible();
  await expect(
    phone.getByRole('button', { name: 'Turn the key' }),
  ).toBeVisible();
  expect(
    await phone.evaluate(() => localStorage.getItem('thirty-club:vault-key')),
  ).toBeNull();

  // Interrupt before the ceremony: the opening is already recorded.
  await phone.reload();
  const plaque = phone.getByRole('button', { name: /No\. 001/ });
  await expect(plaque).toContainText('Opened');
  await plaque.click();
  const letter = phone.getByRole('dialog', { name: /A gift awaits you/ });
  await expect(letter).toBeVisible();
  await expect(letter.getByText(LOCATION)).toBeVisible();
  await letter.getByRole('button', { name: 'Return to the vault' }).click();

  // A second scan answers with the standing record, never a second opening.
  await phone.goto(new URL(nfcUrl).pathname);
  await expect(phone.getByText(/this key has been here before/)).toBeVisible();
  await phone.getByRole('button', { name: 'Open the compartment' }).click();
  await expect(phone.getByRole('dialog').getByText(LOCATION)).toBeVisible({
    timeout: 15000,
  });

  // The owner corrects the location after opening; Alise sees the new one.
  await page.getByRole('button', { name: 'Refresh vault' }).click();
  await expect(card.getByText(/by NFC tag/)).toBeVisible();
  await card.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel(/Gift location/).fill('In the wardrobe, top shelf.');
  await page.getByRole('button', { name: 'Save compartment' }).click();
  await expect(card.locator('.office-vault__state')).toHaveText('Opened');
  await phone.goto('/vault');
  await phone.getByRole('button', { name: /No\. 001/ }).click();
  await expect(
    phone.getByRole('dialog').getByText('In the wardrobe, top shelf.'),
  ).toBeVisible();
  await alise.close();
});

test('owner preview rehearses the whole journey without changing the compartment', async ({
  page,
}) => {
  await signIn(page);
  await createCompartment(page, 'Where the ocean is framed.', 'Under the bed.');
  const card = page.locator('.office-vault__card').last();
  await card.getByRole('link', { name: /Preview vault/ }).click();
  await expect(page.getByText(/Owner rehearsal/)).toBeVisible();
  await expect(page.getByText('Where the ocean is framed.')).toBeVisible();
  await page.getByRole('button', { name: 'Simulate finding the key' }).click();
  await page.getByRole('button', { name: 'Turn the key' }).click();
  await expect(
    page.getByRole('dialog').getByText('Under the bed.'),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Return to the vault' }).click();
  await page.getByRole('link', { name: /Butler’s Office/ }).click();
  await page.getByRole('button', { name: 'vault', exact: true }).click();
  await expect(
    page.locator('.office-vault__card').last().locator('.office-vault__state'),
  ).toHaveText('Locked');
});

test('a malformed vault link is explained, not crashed', async ({ page }) => {
  await page.goto('/v/not-a-real-key');
  await expect(page).toHaveURL(/\/vault$/);
  // Without a membership the Butler asks for it first; the bad key is dropped.
  await expect(page.getByText(/asks to see your membership/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem('thirty-club:vault-key')),
  ).toBeNull();
});
