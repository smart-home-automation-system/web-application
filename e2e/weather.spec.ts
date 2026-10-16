import { expect, startIn, test, useScenario } from './support';

/**
 * The weather strip of the panel: on every page, for everybody, fed by the mock API. The tile of
 * the overview is tested with the other tiles, in `overview.spec`.
 */
test.describe('weather strip', () => {
  const strip = (page: import('@playwright/test').Page) => page.getByTestId('weather-strip');

  test('shows the temperature, the humidity and the age of the reading', async ({ page }) => {
    await page.goto('/overview');

    await expect(strip(page)).toBeVisible();
    await expect(strip(page).getByTestId('weather-temperature')).toHaveText('14.3 °C');
    await expect(strip(page).getByTestId('weather-humidity')).toHaveText(/63 %/);
    await expect(strip(page).getByTestId('weather-age')).toHaveText(/1 min\.? ago/);
    // a dry calm afternoon: the thermometer leads
    await expect(strip(page).locator('.weather__icon')).toHaveText('device_thermostat');
  });

  test('stays inside the panel without pushing the page sideways', async ({ page }) => {
    await page.goto('/overview');
    await expect(strip(page).getByTestId('weather-temperature')).toBeVisible();

    const panel = await page.locator('.shell__panel').boundingBox();
    const shown = await strip(page).boundingBox();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
    expect(shown && panel).toBeTruthy();
    if (shown && panel) {
      expect(shown.x).toBeGreaterThanOrEqual(panel.x);
      expect(shown.x + shown.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(shown.y + shown.height).toBeLessThanOrEqual(panel.y + panel.height);
    }
  });

  // the bar across the top lasts up to 840 px, and the brand keeps its name from 480 px
  for (const width of [480, 600, 839]) {
    test(`fits the bar of a window ${width} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/overview');
      await expect(strip(page).getByTestId('weather-temperature')).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      const panel = await page.locator('.shell__panel').boundingBox();
      const language = await page.getByRole('button', { name: /Change language/ }).boundingBox();

      expect(overflow).toBe(0);
      expect(language!.x + language!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
      // the bar stays one row: nothing was pushed under the brand
      expect(panel!.height).toBeLessThan(80);
    });
  }

  test.describe('for nobody chosen yet', () => {
    test.use({ profile: 'none' });

    test('is on the picker too', async ({ page }) => {
      await page.goto('/profiles');

      await expect(strip(page).getByTestId('weather-temperature')).toHaveText('14.3 °C');
    });
  });

  test.describe('for a resident', () => {
    test.use({ profile: 'resident' });

    test('is on their room', async ({ page }) => {
      await page.goto('/room');

      await expect(strip(page).getByTestId('weather-temperature')).toHaveText('14.3 °C');
    });
  });

  // a failure is no card: the strip shrinks to an icon, and a tap tells why
  test('collapses to an icon whose tooltip tells the failure', async ({ page }) => {
    await useScenario(page, 'server-error');
    await page.goto('/overview');

    const button = page.getByRole('button', { name: 'Weather outside' });
    await expect(button).toBeVisible();
    await expect(strip(page).getByTestId('weather-temperature')).toHaveCount(0);

    await button.click();

    await expect(page.locator('.mat-mdc-tooltip-surface')).toHaveText(
      'The weather could not be read. The service is not available right now (error 502).',
    );
  });

  test('collapses when the station was heard of nothing yet', async ({ page }) => {
    await useScenario(page, 'no-readings');
    await page.goto('/overview');

    await page.getByRole('button', { name: 'Weather outside' }).click();

    await expect(page.locator('.mat-mdc-tooltip-surface')).toHaveText(
      'No reading from the weather station yet.',
    );
  });

  test('speaks Polish, with a decimal comma', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/overview');

    await expect(page.getByRole('group', { name: 'Pogoda na zewnątrz' })).toBeVisible();
    await expect(strip(page).getByTestId('weather-temperature')).toHaveText('14,3 °C');
  });
});
