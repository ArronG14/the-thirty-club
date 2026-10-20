import { expect, test } from '@playwright/test';
const headers = {
  'content-type': 'application/json',
  'x-concierge-request': '1',
};
test('mobile office signs in, issues membership, redeems beauty and fulfils the claim', async ({
  page,
  browser,
}) => {
  await page.goto('/owner');
  await expect(
    page.getByRole('heading', { name: 'Owner access' }),
  ).toBeVisible();
  await page
    .getByLabel('Password', { exact: true })
    .fill('thirty-club-local-rehearsal-only');
  await page.getByRole('button', { name: 'Enter the office' }).click();
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('SMS paused · all new messages require approval'),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === 'thirty-session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Strict');
  await page.getByRole('button', { name: 'membership', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create invitation', exact: true })
    .click();
  const token = await page.getByLabel('Invitation token').inputValue();
  expect(token).toHaveLength(43);
  const member = await browser.newContext({ baseURL: 'http://127.0.0.1:4180' });
  const exchange = await member.request.post('/api/v1/auth/member', {
    headers,
    data: { token },
  });
  expect(exchange.status()).toBe(200);
  const privileges = await (
    await member.request.get('/api/v1/privileges')
  ).json();
  const nail = privileges.privileges.find(
    (p: { slug: string }) => p.slug === 'nail-appointment',
  );
  const payload = {
    privilegeId: nail.id,
    amountPence: 4250,
    idempotencyKey: crypto.randomUUID(),
  };
  const claim = await member.request.post('/api/v1/redemptions', {
    headers,
    data: payload,
  });
  expect(claim.status()).toBe(201);
  const { redemption } = await claim.json();
  expect(redemption.state).toBe('pending');
  expect(
    (
      await member.request.post('/api/v1/redemptions', {
        headers,
        data: payload,
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'redemptions', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh records' }).click();
  const card = page.locator('.office-card').filter({
    has: page.getByRole('heading', { name: 'Nail Appointment', exact: true }),
  });
  await expect(card.getByText('£42.50')).toBeVisible();
  await card.getByRole('button', { name: 'Mark as fulfilled' }).click();
  await expect(card.getByText('fulfilled', { exact: true })).toBeVisible();
  const status = await (
    await member.request.get(`/api/v1/redemptions/${redemption.id}`)
  ).json();
  expect(status.redemption.state).toBe('fulfilled');
  await page.getByRole('button', { name: 'messages', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Scheduled correspondence' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Approve this SMS' }),
  ).toHaveCount(6); // Three timed drafts, the 21 Oct teaser draft and this claim; Friday stays disabled.
  await page.screenshot({
    path: '/private/tmp/thirty-office-mobile.png',
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Owner access' }),
  ).toBeVisible();
  await member.close();
});
test('owner drafts a timezone-specific SMS without approving it', async ({
  page,
}) => {
  await page.goto('/owner');
  await page
    .getByLabel('Password', { exact: true })
    .fill('thirty-club-local-rehearsal-only');
  await page.getByRole('button', { name: 'Enter the office' }).click();
  await page.getByRole('button', { name: 'messages', exact: true }).click();
  await page
    .getByLabel('Label', { exact: true })
    .fill('Jamaica timezone rehearsal');
  await page.getByLabel('Message to Alise').fill('A local rehearsal only.');
  await page
    .getByRole('combobox', { name: 'Timezone', exact: true })
    .selectOption('America/Jamaica');
  await page.getByLabel('Local date and time').fill('2026-10-24T00:00');
  await expect(page.getByText(/2026-10-24T05:00:00.000Z/)).toBeVisible();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const card = page.locator('.office-card').filter({
    has: page.getByRole('heading', {
      name: 'Jamaica timezone rehearsal',
      exact: true,
    }),
  });
  await expect(card.getByText('To Alise · draft')).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Approve this SMS' }),
  ).toBeVisible();
});
