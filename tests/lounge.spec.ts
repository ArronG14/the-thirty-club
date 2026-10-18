import { expect, test } from '@playwright/test';
import { BIRTHDAY_EARLY, presentMembershipCard } from './concierge-helpers';

// The real-time Members' Lounge in the production build. Headless Chromium
// renders WebGL in software (SwiftShader), so these use real timers and
// generous timeouts; timings here say nothing about an iPhone.

const SEEN = new Date(2026, 9, 24, 0, 0, 5).toISOString();

test.describe('real-time lounge', () => {
  test('the doors hand over to the lounge with only one WebGL scene alive', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await presentMembershipCard(page);
    await page.clock.setFixedTime(BIRTHDAY_EARLY);
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter the club' }).click();
    const lounge = page.locator('.lounge');
    await expect(lounge).toBeVisible({ timeout: 15_000 });
    await expect(lounge).toHaveAttribute('data-render', /fading|scene/, {
      timeout: 90_000,
    });
    // The entrance released its canvas before the lounge created one.
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('canvas.lounge__canvas')).toHaveCount(1);
    await expect(page.getByText('Ah, Alise. There you are.')).toBeVisible();
  });

  test('a returning member sees the lounge and can open the directory', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.clock.setFixedTime(new Date(2026, 9, 24, 1, 0, 0));
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
    await page.goto('/');
    await expect(page.locator('.lounge')).toHaveAttribute(
      'data-render',
      'scene',
      { timeout: 90_000 },
    );
    await expect(page.getByText(/Alise\. Welcome back\./)).toBeVisible();
    await page.getByRole('button', { name: 'Members’ Directory' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Members’ Directory' }),
    ).toBeVisible();
  });
});
