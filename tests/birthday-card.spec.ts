import { expect, test, type Page } from '@playwright/test';

/**
 * The private birthday card (/birthdaycard, ADR-024) on a phone, against a
 * mocked server: sealed before its time, the seal broken, the card risen
 * and unfolded with the owner's words; a device without her session is
 * asked for the membership card.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function serve(
  page: Page,
  card: Record<string, unknown> | null,
  member = true,
) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/session')
      return member
        ? route.fulfill({
            json: {
              session: {
                role: 'member',
                memberId: 'm',
                expiresAt: '2026-11-01T00:00:00Z',
              },
            },
          })
        : route.fulfill({
            status: 401,
            json: { error: 'unauthorised', message: 'Please sign in.' },
          });
    if (path === '/api/v1/card' && card) return route.fulfill({ json: card });
    return route.fulfill({
      status: 404,
      json: { error: 'not-found', message: 'Unavailable' },
    });
  });
}

test('sealed before the birthday: the date, no words', async ({ page }) => {
  await serve(page, { state: 'sealed', opensAt: '2026-10-24T05:00:00Z' });
  await page.goto('/birthdaycard');
  await expect(page.getByText('Saturday 24 October')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Break the seal' }),
  ).toHaveCount(0);
  await page.screenshot({ path: 'test-results/birthday-card-sealed.png' });
});

test('on the day: the seal, the card rises and unfolds to the owner’s words', async ({
  page,
}) => {
  await serve(page, {
    state: 'open',
    opensAt: '2026-10-24T05:00:00Z',
    message: 'My darling Alise,\n\nThirty suits you beautifully.',
    signature: 'Arron',
  });
  await page.goto('/birthdaycard');
  await page.getByRole('button', { name: 'Break the seal' }).click();
  await expect(page.locator('.bcard')).toHaveAttribute(
    'data-stage',
    'unfolded',
    { timeout: 6000 },
  );
  await expect(page.getByRole('region', { name: 'The card' })).toContainText(
    'Thirty suits you beautifully.',
  );
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'test-results/birthday-card-open.png' });
  // Replayable.
  await page.getByRole('button', { name: 'Fold it away' }).click();
  await expect(
    page.getByRole('button', { name: 'Break the seal' }),
  ).toBeVisible();
  // Kept for a dropped hotel connection.
  await page.unroute('**/api/v1/**');
  await page.route('**/api/v1/**', (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Break the seal' }).click();
  await expect(page.getByRole('region', { name: 'The card' })).toContainText(
    'Thirty suits you beautifully.',
    { timeout: 6000 },
  );
});

test('reduced motion opens straight to the words', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await serve(page, {
    state: 'open',
    opensAt: '2026-10-24T05:00:00Z',
    message: 'Happy birthday.',
    signature: 'A.',
  });
  await page.goto('/birthdaycard');
  await page.getByRole('button', { name: 'Break the seal' }).click();
  await expect(page.locator('.bcard')).toHaveAttribute(
    'data-stage',
    'unfolded',
  );
});

test('another device without her session is asked for the card', async ({
  page,
}) => {
  await serve(page, null, false);
  await page.goto('/birthdaycard');
  await expect(
    page.getByText(/Please present your membership card/),
  ).toBeVisible();
  await expect(page.getByText('Happy birthday')).toHaveCount(0);
});
