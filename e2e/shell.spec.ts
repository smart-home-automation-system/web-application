import { expect, test, useScenario } from './support';

test.describe('application shell', () => {
  test('opens the overview with the heating tile fed by the API', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page).toHaveTitle('Overview · Smart Home');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    const tile = page.locator('mat-card', { hasText: 'Heating system' });
    await expect(tile.getByText('Enabled')).toBeVisible();
    // house wall-clock time of the fixture, shown as sent whatever the zone of the browser
    await expect(tile.getByText('Sep 28, 2026, 6:45 AM')).toBeVisible();
    await expect(tile.getByText(/^Updated/)).toBeVisible();
  });

  test('shows one navigation, matching the width of the screen', async ({ page }, testInfo) => {
    await page.goto('/');

    const side = page.locator('.shell__side-nav');
    const bottom = page.locator('.shell__bottom-nav');
    if (testInfo.project.name === 'phone') {
      await expect(bottom).toBeVisible();
      await expect(side).toBeHidden();
    } else {
      await expect(side).toBeVisible();
      await expect(bottom).toBeHidden();
    }
  });

  test('navigates to the about page, which shows the running version', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'About' }).click();

    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('app-version')).toHaveText('0.0.0-dev');
  });

  test('opens a deep link directly and survives a reload', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  });

  test('shows the not-found page for an unknown address and leads back', async ({ page }) => {
    await page.goto('/no/such/page');

    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();

    await page.getByRole('link', { name: 'Go to the overview' }).click();

    await expect(page).toHaveURL(/\/overview$/);
  });

  test('fits the screen without horizontal scrolling', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Heating system')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });
});

test.describe('when the backend fails', () => {
  test('explains that the server cannot be reached', async ({ page }) => {
    await useScenario(page, 'offline');
    await page.goto('/');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('The server cannot be reached');
    await expect(page.getByText('No data received')).toBeVisible();
    // the shell keeps working without the backend
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
  });

  test('explains that the service is failing, without quoting it', async ({ page }) => {
    await useScenario(page, 'server-error');
    await page.goto('/');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('error 502');
    await expect(alert).not.toContainText('Mock scenario');
  });
});
