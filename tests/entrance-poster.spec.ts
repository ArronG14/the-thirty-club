import { expect, test } from '@playwright/test';
import {
  BIRTHDAY_MORNING,
  presentMembershipCard,
  unlockedEarlier,
} from './concierge-helpers';

// The SVG entrance: what a browser without WebGL gets, and the poster the
// 3D scene dissolves from. It must keep its bell and never fetch the chunk.
//
// Fake-clock ceremony tests also live here: Playwright's clock drives every
// animation frame, and headless Chromium renders WebGL in software, so the
// stage machine is exercised without the renderer in the loop.
test.use({
  launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] },
});

test('keeps the SVG entrance and never requests the 3D chunk', async ({
  page,
}) => {
  const sceneRequests: string[] = [];
  page.on('request', (request) => {
    if (/EntranceCanvas|LoungeCanvas|three/i.test(request.url())) {
      sceneRequests.push(request.url());
    }
  });
  await page.clock.setFixedTime(new Date(2026, 9, 20, 21, 0, 0));
  await page.goto('/');
  await expect(page.locator('.facade')).toHaveAttribute(
    'data-render',
    'poster',
  );
  await expect(page.locator('.portal')).toBeVisible();
  await page.getByRole('button', { name: 'Ring for service' }).click();
  await expect(
    page.getByText(/Your membership has been approved/),
  ).toBeVisible();
  expect(sceneRequests).toEqual([]);
});

test('reduced motion keeps the poster doors still and the ceremony brief', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await presentMembershipCard(page);
  await unlockedEarlier(page);
  await page.clock.install({ time: BIRTHDAY_MORNING });
  await page.goto('/');
  const club = page.locator('.club');
  await expect(club).toHaveAttribute('data-motion', 'reduced');
  await page.getByRole('button', { name: 'Enter the club' }).click();
  await expect(club).toHaveAttribute('data-stage', 'opening');
  const door = page.locator('.door--left');
  expect(await door.evaluate((el) => getComputedStyle(el).transform)).toBe(
    'none',
  );
  await page.clock.runFor(1_000);
  await expect(club).toHaveAttribute('data-stage', 'foyer');
});

test('reduced motion keeps the lounge still and its ceremony intact', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await presentMembershipCard(page);
  await unlockedEarlier(page);
  // The Screening Room admission, as the device remembers it (ADR-020).
  await page.addInitScript(() =>
    localStorage.setItem(
      'thirty-club:journey',
      JSON.stringify({ version: 1, admitted: ['screening-room'], pending: [] }),
    ),
  );
  await page.clock.install({ time: BIRTHDAY_MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the club' }).click();
  await page.clock.runFor(1_000);
  const lounge = page.locator('.lounge');
  await expect(lounge).toBeVisible();
  expect(
    await page
      .locator('.lounge__flare')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Skip to your card' }).click();
  expect(
    await page
      .locator('.member-card__turn')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Accept your membership' }).click();
  await expect(
    page.getByText('The Private Screening Room', { exact: true }),
  ).toBeVisible();
});

test.describe('in Jamaica (UTC−5, no daylight saving)', () => {
  test.use({ timezoneId: 'America/Jamaica' });

  test('Jamaica midnight on the birthday opens nothing: the one entrance is 21 Oct, 19:00 UK', async ({
    page,
  }) => {
    await presentMembershipCard(page);
    // 23:59:57 on 23 October in Kingston; already 05:59:57 on the 24th in London.
    await page.clock.install({ time: new Date('2026-10-24T04:59:57Z') });
    await page.goto('/');
    const club = page.locator('.club');
    await expect(club).toHaveAttribute('data-stage', 'final-minute');
    await expect(page.getByRole('timer')).toContainText(
      '0 days, 0 hours, 0 minutes, 3 seconds',
    );
    // Midnight passes with the card on the device: no second ceremony, and
    // no clock opens the doors (ADR-023).
    await page.clock.runFor(60_000);
    await expect(club).toHaveAttribute('data-stage', 'final-minute');
    await expect(
      page.getByRole('button', { name: 'Enter the club' }),
    ).toHaveCount(0);
    await expect(page.locator('.lounge')).toHaveCount(0);
  });
});

test.describe('in London (UTC+1 in October)', () => {
  test.use({ timezoneId: 'Europe/London' });

  test('a phone still on London time counts down to Jamaica midnight too', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-24T04:59:57Z'));
    await page.goto('/');
    await expect(page.locator('.club')).toHaveAttribute(
      'data-stage',
      'final-minute',
    );
    await expect(page.getByRole('timer')).toContainText(
      '0 days, 0 hours, 0 minutes, 3 seconds',
    );
  });
});

test.describe('the membership card (ADR-012)', () => {
  test.use({ timezoneId: 'America/Jamaica' });

  test('the birthday alone does not open the doors', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-24T04:59:58Z') });
    await page.goto('/');
    const club = page.locator('.club');
    await page.clock.runFor(3_000);
    await expect(club).toHaveAttribute('data-stage', 'final-minute');
    await expect(
      page.getByRole('button', { name: 'Enter the club' }),
    ).toHaveCount(0);
    await page.clock.runFor(60 * 60_000);
    await expect(club).toHaveAttribute('data-stage', 'final-minute');
    // A direct visit to a room is refused too, and names nothing (ADR-020).
    await page.goto('/rooms/screening-room');
    await expect(
      page.getByRole('heading', { name: 'Not this way, Madam.' }),
    ).toBeVisible();
    await expect(page.getByText(/Screening Room/)).toHaveCount(0);
  });
});
