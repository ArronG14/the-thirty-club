import { expect, test, type Page } from '@playwright/test';

// Captures the real-time Grand Casino at full quality for visual review.
// Software rendering is slow, so timings are generous and this asserts only
// that each station renders and plays; the pictures are the product.
// Output: docs/casino/*.png (override with CAPTURE_DIR).

const OUT = process.env.CAPTURE_DIR ?? 'docs/casino';
const SEEN = new Date(2026, 9, 24, 0, 0, 5).toISOString();

async function arrive(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-25T01:00:00Z'));
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
  await page.goto('/rooms/casino');
  await expect(page.locator('.casino')).toHaveAttribute(
    'data-render',
    'scene',
    {
      timeout: 180_000,
    },
  );
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${OUT}/${name}.png` });

test.describe('casino look development', () => {
  test('portrait: lobby, roulette, slots', async ({ page }) => {
    test.setTimeout(900_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await arrive(page);
    await page.waitForTimeout(2500);
    await shot(page, 'portrait-lobby');

    await page.getByRole('button', { name: /^Roulette/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, 'portrait-travel-to-roulette');
    const roulette = page.getByRole('region', { name: 'Roulette' });
    await expect(roulette).toBeVisible({ timeout: 240_000 });
    await page.waitForTimeout(1000);
    await shot(page, 'portrait-roulette');
    await roulette.getByRole('button', { name: 'Red' }).click();
    await shot(page, 'portrait-roulette-bet');
    await roulette.getByRole('button', { name: /^Spin/ }).click();
    await page.waitForTimeout(4000);
    await shot(page, 'portrait-roulette-spin-a');
    await page.waitForTimeout(12_000);
    await shot(page, 'portrait-roulette-spin-b');
    await expect(page.locator('.outcome')).toBeVisible({ timeout: 300_000 });
    await shot(page, 'portrait-roulette-result');
    const reveal = page.getByRole('dialog', { name: 'The First Fortune' });
    await expect(reveal).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3500);
    await shot(page, 'portrait-reveal');
    await reveal.getByRole('button', { name: 'Add to my collection' }).click();
    await reveal.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: /Lobby/ }).click();
    await expect(
      page.getByRole('navigation', { name: 'Choose a game' }),
    ).toBeVisible({
      timeout: 240_000,
    });
    await page.getByRole('button', { name: /^The Machine/ }).click();
    const slots = page.getByRole('region', { name: 'Slot machine' });
    await expect(slots).toBeVisible({ timeout: 240_000 });
    await page.waitForTimeout(1000);
    await shot(page, 'portrait-slots');
    await slots.getByRole('button', { name: /Pull the lever/ }).click();
    await page.waitForTimeout(3000);
    await shot(page, 'portrait-slots-spin');
    await expect(slots.locator('.outcome')).toBeVisible({ timeout: 300_000 });
    await shot(page, 'portrait-slots-result');
    // Put the prize reveal aside to see the reels at rest on the engine's line.
    const prize = page.getByRole('dialog');
    await expect(prize).toBeVisible({ timeout: 60_000 });
    await prize.getByRole('button', { name: 'Skip', exact: true }).click();
    await prize.getByRole('button', { name: 'Keep it for later' }).click();
    await page.waitForTimeout(6000);
    await shot(page, 'portrait-slots-settled');
    console.log(
      'render info',
      JSON.stringify(
        await page.evaluate(
          () => (window as unknown as { __casinoInfo?: unknown }).__casinoInfo,
        ),
      ),
    );
  });

  test('landscape: lobby and roulette', async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 844, height: 390 });
    await arrive(page);
    await page.waitForTimeout(2500);
    await shot(page, 'landscape-lobby');
    await page.getByRole('button', { name: /^Roulette/ }).click();
    await expect(page.getByRole('region', { name: 'Roulette' })).toBeVisible({
      timeout: 240_000,
    });
    await page.waitForTimeout(1000);
    await shot(page, 'landscape-roulette');
  });
});
