import { expect, test, type Page } from '@playwright/test';

// The Grand Casino in the production build. Headless Chromium renders WebGL
// in software, so these use real timers and generous timeouts. They prove
// the flow works end to end; frame rates here say nothing about an iPhone.

const SEEN = new Date(2026, 9, 24, 0, 0, 5).toISOString();
// 8 pm in Jamaica on the birthday: the casino has been open since 2 pm.
const EVENING = new Date('2026-10-25T01:00:00Z');

async function arrive(
  page: Page,
  seed?: { ledger?: unknown; casino?: unknown },
) {
  await page.clock.setFixedTime(EVENING);
  await page.addInitScript(
    ([seen, extra]) => {
      localStorage.setItem(
        'thirty-club:entrance',
        JSON.stringify({ version: 1, unlockedAt: seen, ceremonySeenAt: seen }),
      );
      localStorage.setItem(
        'thirty-club:membership',
        JSON.stringify({ version: 1, inductedAt: seen, rooms: {} }),
      );
      const e = extra as { ledger?: unknown; casino?: unknown } | null;
      if (e?.ledger)
        localStorage.setItem('thirty-club:prizes', JSON.stringify(e.ledger));
      if (e?.casino)
        localStorage.setItem('thirty-club:casino', JSON.stringify(e.casino));
    },
    [SEEN, seed ?? null] as const,
  );
  await page.goto('/rooms/casino');
}

test.describe('grand casino', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens as a 3D lobby, then plays roulette and slots', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await arrive(page);
    const casino = page.locator('.casino');
    await expect(casino).toBeVisible({ timeout: 20_000 });
    await expect(casino).toHaveAttribute('data-render', 'scene', {
      timeout: 120_000,
    });
    await expect(page.locator('canvas.casino__canvas')).toHaveCount(1);
    await expect(page.locator('.casino__voice')).toBeAttached();
    await page.screenshot({ path: 'test-results/casino-lobby.png' });

    // Roulette: the camera travels, then the betting panel opens.
    await page.getByRole('button', { name: /^Roulette/ }).click();
    const roulette = page.getByRole('region', { name: 'Roulette' });
    await expect(roulette).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/casino-roulette.png' });
    await roulette.getByRole('button', { name: 'Red' }).click();
    await expect(
      roulette.getByRole('button', { name: /Red, 10 chips placed/ }),
    ).toBeVisible();
    await roulette.getByRole('button', { name: 'Spin' }).click();
    await expect(
      page.getByText('No more bets. The ball is in play…'),
    ).toBeVisible();
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: 'test-results/casino-roulette-spinning.png',
    });
    // The first scripted spin is a win, which earns the first prize.
    await expect(page.locator('.outcome')).toHaveAttribute('data-won', 'true', {
      timeout: 90_000,
    });
    await page.screenshot({ path: 'test-results/casino-roulette-result.png' });
    const reveal = page.getByRole('dialog', { name: 'The First Fortune' });
    await expect(reveal).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'test-results/casino-reveal.png' });
    await reveal.getByRole('button', { name: 'Skip', exact: true }).click();
    await reveal.getByRole('button', { name: 'Add to my collection' }).click();
    await reveal.getByRole('button', { name: 'Continue' }).click();
    await expect(reveal).toBeHidden();

    // The prize persists across a reload.
    const ledger = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('thirty-club:prizes') ?? '{}'),
    );
    expect(ledger.grants['casino.first-fortune'].status).toBe('claimed');

    // Back to the lobby, then the slot machine.
    await page.getByRole('button', { name: /Lobby/ }).click();
    await expect(
      page.getByRole('navigation', { name: 'Choose a game' }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: /The Machine/ }).click();
    const slots = page.getByRole('region', { name: 'Slot machine' });
    await expect(slots).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/casino-slots.png' });
    await slots.getByRole('button', { name: /Pull the lever/ }).click();
    await expect(slots.getByText('The reels are turning…')).toBeVisible();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'test-results/casino-slots-spinning.png' });
    await expect(slots.locator('.outcome')).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: 'test-results/casino-slots-result.png' });
  });

  test('keeps progress across a reload and never shows dev tools', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const stamp = '2026-10-24T20:00:00.000Z';
    await arrive(page, {
      ledger: {
        version: 1,
        counters: { 'roulette.spins': 1, 'roulette.wins': 1 },
        grants: {
          'casino.first-fortune': {
            awardedAt: stamp,
            status: 'claimed',
            claimedAt: stamp,
          },
        },
      },
      casino: {
        version: 1,
        chips: 777,
        spins: { roulette: 1, slots: 0 },
        visits: 2,
        soundOn: false,
      },
    });
    await expect(page.locator('.casino')).toHaveAttribute(
      'data-render',
      'scene',
      {
        timeout: 120_000,
      },
    );
    await expect(page.locator('.bar__chips')).toContainText('777');
    await expect(page.getByText('DEV · casino')).toHaveCount(0);
    // A claimed prize is not offered again.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.bar__chips')).toContainText('777');
    await page.getByRole('button', { name: 'Your collection' }).click();
    const sheet = page.getByRole('dialog', { name: 'Your collection' });
    await expect(sheet).toContainText('The First Fortune');
    await expect(sheet).toContainText('1 of 6 won');
  });

  test('survives corrupt stored progress', async ({ page }) => {
    test.setTimeout(150_000);
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
      localStorage.setItem('thirty-club:prizes', '{not json');
      localStorage.setItem('thirty-club:casino', '[1,2,3]');
    }, SEEN);
    await page.goto('/rooms/casino');
    await expect(page.locator('.casino')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.bar__chips')).toContainText('1,000');
  });
});
