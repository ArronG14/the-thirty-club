import { expect, test } from '@playwright/test';

const SEEN = '2026-10-24T00:00:05.000Z';
const EVENING = new Date('2026-10-25T01:00:00Z');

test.describe('authoritative Casino presentation', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('reveals only the committed server prize and survives a reload', async ({
    page,
  }) => {
    await page.clock.setFixedTime(EVENING);
    await page.addInitScript((seen) => {
      localStorage.setItem(
        'thirty-club:entrance',
        JSON.stringify({ version: 1, unlockedAt: seen, ceremonySeenAt: seen }),
      );
      localStorage.setItem(
        'thirty-club:membership',
        JSON.stringify({ version: 1, inductedAt: seen, rooms: {} }),
      );
    }, SEEN);
    let played = false;
    const prize = {
      title: 'Two cocktails',
      description: 'At the bar',
      presentation: 'A toast for Alise.',
      kind: 'VOUCHER',
    };
    const spin = {
      id: 'spin-1',
      batchId: 'batch-1',
      position: 1,
      prize,
      entitlementId: 'voucher-1',
      createdAt: EVENING.toISOString(),
      idempotencyKey: '',
    };
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/auth/session')
        return route.fulfill({
          json: {
            session: {
              role: 'member',
              memberId: 'member-1',
              expiresAt: '2026-11-01T00:00:00Z',
            },
          },
        });
      if (path === '/api/v1/casino' && route.request().method() === 'GET')
        return route.fulfill({
          json: { available: played ? 0 : 1, spins: played ? [spin] : [] },
        });
      if (path === '/api/v1/casino/spins') {
        played = true;
        spin.idempotencyKey = (
          route.request().postDataJSON() as { idempotencyKey: string }
        ).idempotencyKey;
        return route.fulfill({ status: 201, json: spin });
      }
      return route.fulfill({
        status: 404,
        json: { error: 'not-found', message: 'Unavailable' },
      });
    });
    await page.goto('/rooms/casino');
    await expect(
      page.getByRole('heading', { name: 'The Grand Casino' }),
    ).toBeVisible();
    await expect(page.getByText('1 spin at your pleasure')).toBeVisible();
    await expect(page.getByText('Two cocktails')).toHaveCount(0);
    const committed = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/casino/spins'),
    );
    await page.getByRole('button', { name: 'Spin the wheel' }).click();
    await committed;
    // Close the page before the 1.6 s ceremony finishes: the pending key
    // must recover this already committed result without another spin.
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Two cocktails' }),
    ).toBeVisible();
    await expect(page.getByText('0 spins at your pleasure')).toBeVisible();
    await page.screenshot({
      path: 'test-results/casino-authoritative-mobile.png',
      fullPage: true,
    });
    await page.getByText('Your recent spins').click();
    await expect(page.locator('.casino-live__history li')).toContainText(
      'Two cocktails',
    );
  });
});
