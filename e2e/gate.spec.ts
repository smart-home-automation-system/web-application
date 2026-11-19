import { expect, test, useScenario } from './support';

/**
 * The gate page (HAS-454), fed by the mock API: the driveway gate last opened from the indoor screen, the garage gate
 * "Left" closed, "Right" open for 35 minutes with its warning, a month of rings and openings. A press changes what the
 * next reads answer - the mock house moves its gates at once.
 */

test('tells the driveway gate, the garage gates with one button each, the alarm and the timeline', async ({
  page,
}) => {
  await page.goto('/gate');

  await expect(page.getByRole('heading', { level: 1, name: 'Gate' })).toBeVisible();
  await expect(page.getByTestId('gate-last-opening')).toContainText('from the indoor screen');
  await expect(page.getByTestId('gate-bridge')).toHaveText('Connected');
  const left = page.locator('[data-gate="31"]');
  const right = page.locator('[data-gate="32"]');
  await expect(left.getByTestId('garage-state')).toContainText('Closed since');
  await expect(left.getByTestId('garage-pulse')).toHaveText('Open');
  await expect(right.getByTestId('garage-state')).toHaveText('Open for 35 min');
  await expect(right.getByTestId('garage-pulse')).toHaveText('Close');
  await expect(page.getByTestId('gate-alert')).toContainText('Right: Open for long');
  // a month is more than a page: the newest twenty first
  await expect(page.locator('.event')).toHaveCount(20);
});

// owner, 2026-11-16: no question - the gate opens at once; a second press within 15 s is refused by the service
test('opens the driveway gate at once, and words a second press the service refuses', async ({
  page,
}) => {
  await page.goto('/gate');
  const open = page.getByTestId('gate-open');

  await open.click();
  await expect(page.getByTestId('gate-open-sent')).toBeVisible();
  await expect(page.getByTestId('gate-last-opening')).toContainText('Aurelia');
  await open.click();
  await expect(page.getByTestId('gate-open-failure')).toHaveText(
    'The gate was commanded a moment ago - wait a few seconds.',
  );
});

// owner, 2026-11-18: one button whose label follows the state, never disabled after a press
test('closes an open garage gate with one press, its warning gone, and the button stays to press again', async ({
  page,
}) => {
  await page.goto('/gate');
  const right = page.locator('[data-gate="32"]');

  await right.getByTestId('garage-pulse').click();

  await expect(right.getByTestId('garage-state')).toContainText('Closed since');
  await expect(right.getByTestId('garage-pulse')).toHaveText('Open');
  await expect(right.getByTestId('garage-pulse')).toBeEnabled();
  await expect(page.getByTestId('alerts-none')).toBeVisible();
});

test('shows twenty more items of the timeline on request, and twenty again for another period', async ({
  page,
}) => {
  await page.goto('/gate');
  await expect(page.locator('.event')).toHaveCount(20);

  await page.getByRole('radio', { name: '30 days' }).click();
  await expect(page.locator('.events__more')).toContainText('20 of');
  await page.getByTestId('events-more').click();

  await expect(page.locator('.event')).toHaveCount(40);
});

test.describe('a resident', () => {
  test.use({ profile: 'resident' });

  test('opens the gate page from the menu and presses the gates', async ({ page }) => {
    await page.goto('/room');
    // the side panel on a wide screen, the bottom bar on a phone: whichever is shown
    await page
      .getByRole('link', { name: 'Gate', exact: true })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page).toHaveURL(/\/gate$/);
    await page.getByTestId('gate-open').click();
    await expect(page.getByTestId('gate-last-opening')).toContainText('Borys');
  });
});

test('claims nothing the service does not know yet', async ({ page }) => {
  await useScenario(page, 'no-readings');
  await page.goto('/gate');

  await expect(page.getByTestId('gate-bridge')).toHaveText('Not known');
  await expect(page.locator('[data-gate="31"]').getByTestId('garage-state')).toHaveText(
    'Not known',
  );
  await expect(page.locator('[data-gate="31"]').getByTestId('garage-pulse')).toHaveText(
    'Run the gate',
  );
  await expect(page.getByTestId('alerts-none')).toBeVisible();
});

test('tells the failure of every call of the page', async ({ page }) => {
  await useScenario(page, 'server-error');
  await page.goto('/gate');

  await expect(page.getByRole('main').getByRole('alert').first()).toContainText('(error 502)');
});
