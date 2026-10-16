import { Locator, Page } from '@playwright/test';

import { expect, startIn, test, useScenario } from './support';

/**
 * The weather page: the cards of the metrics and the six charts of their history, fed by the
 * mock API, whose station was silent for an hour yesterday. The mock dates its answers from the
 * time of the call, so every test pins the clock: a Friday, 14:30 on the clocks of the house.
 */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T12:30:00Z'));
});

const CHARTS = ['temperature', 'humidity', 'wind', 'illuminance', 'precipitation', 'pressure'];

/** The picture of a chart, once the library has arrived and drawn into it. */
async function drawn(card: Locator): Promise<Locator> {
  const plot = card.locator('.chart__plot');
  await expect(plot.locator('svg')).toBeVisible();
  return plot;
}

const chart = (page: Page, key: string) => page.getByTestId(`chart-${key}`);

test.describe('the weather page', () => {
  test('is in the navigation of the administrator, and opens with its photo', async ({ page }) => {
    await page.goto('/overview');

    await page.getByTestId('tile-weather').getByRole('link', { name: 'Weather' }).click();

    await expect(page).toHaveURL(/\/weather$/);
    await expect(page).toHaveTitle('Weather · Smart Home');
    await expect(page.getByRole('heading', { level: 1, name: 'Weather' })).toBeVisible();
    // the photo of the view the page came from fades out beside it: ask for this one
    await expect(page.locator('img[data-background="weather"]')).toHaveClass(
      /view-background__photo--shown/,
    );
  });

  test('shows every metric in its card', async ({ page }) => {
    await page.goto('/weather');

    await expect(page.getByTestId('card-temperature')).toContainText(/Temperature\s+14\.3 °C/);
    await expect(page.getByTestId('card-temperature')).toContainText(/Humidity\s+63 %/);
    await expect(page.getByTestId('card-wind')).toContainText(/from the south-west\s+\(245°\)/);
    await expect(page.getByTestId('card-rain')).toContainText(/Rain gauge\s+1,287/);
    await expect(page.getByTestId('card-pressure')).toContainText(/1,013\.4 hPa/);
    await expect(page.getByTestId('card-light')).toContainText(/18,450 lx/);
    await expect(page.getByTestId('card-station')).toContainText(/Gateway\s+Answers/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('draws the six charts over the last 24 hours, with what they ranged between', async ({
    page,
  }) => {
    await page.goto('/weather');

    for (const key of CHARTS) {
      await drawn(chart(page, key));
      await expect(chart(page, key).getByRole('radio', { name: '24 hours' })).toBeChecked();
    }
    await expect(chart(page, 'temperature').locator('.chart__plot')).toContainText('Dew point');
    await expect(chart(page, 'wind').locator('.chart__plot')).toContainText('Gusts');
    await expect(chart(page, 'precipitation').getByTestId('history-facts')).toContainText(
      /Rain\s+total\s+\d+/,
    );
    await expect(chart(page, 'illuminance').locator('.chart__plot')).toContainText('10,000 lx');
  });

  // the page is one look at the weather: one period for all six
  test('switches every chart to the period chosen on one of them', async ({ page }) => {
    await page.goto('/weather');
    await drawn(chart(page, 'pressure'));

    await chart(page, 'pressure').getByRole('radio', { name: '7 days' }).click();

    for (const key of CHARTS) {
      await expect(chart(page, key).getByRole('radio', { name: '7 days' })).toBeChecked();
      // dates on the axis now
      await expect(await drawn(chart(page, key))).toContainText(' Oct');
    }

    await chart(page, 'humidity').getByRole('radio', { name: '30 days' }).click();
    await expect(chart(page, 'wind').getByRole('radio', { name: '30 days' })).toBeChecked();
    await expect(await drawn(chart(page, 'wind'))).toContainText('Sept');
  });

  test('tells the failure in every card and chart, and keeps the choice of the period', async ({
    page,
  }) => {
    await useScenario(page, 'server-error');
    await page.goto('/weather');

    for (const key of CHARTS) {
      await expect(chart(page, key).getByRole('alert')).toContainText('(error 502)');
      await expect(chart(page, key).locator('.chart__plot')).toHaveCount(0);
      await expect(chart(page, key).getByRole('radio', { name: '7 days' })).toBeVisible();
    }
    await expect(page.getByTestId('card-temperature').getByRole('alert')).toContainText(
      '(error 502)',
    );
    await expect(page.getByTestId('card-station').getByRole('alert')).toContainText('(error 502)');
  });

  test('says what the station has not reported yet, just after its first start', async ({
    page,
  }) => {
    await useScenario(page, 'no-readings');
    await page.goto('/weather');

    await expect(page.getByTestId('card-temperature')).toContainText(
      'The station has not reported these yet.',
    );
    await expect(page.getByTestId('card-station')).toContainText(
      'The station has not been heard for 30 minutes.',
    );
    for (const key of CHARTS) {
      await expect(chart(page, key).getByTestId('history-empty')).toHaveText(
        'No reading in this period.',
      );
    }
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('fits the screen without horizontal scrolling, the charts included', async ({ page }) => {
    await page.goto('/weather');
    await drawn(chart(page, 'pressure'));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });

  test('speaks Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/weather');

    await expect(page.getByRole('heading', { level: 1, name: 'Pogoda' })).toBeVisible();
    await expect(page.getByTestId('card-temperature')).toContainText(/Temperatura\s+14,3 °C/);
    await expect(page.getByTestId('card-wind')).toContainText('z kierunku południowo-zachodniego');
    await expect(chart(page, 'temperature').locator('mat-card-title')).toHaveText(
      'Temperatura i punkt rosy',
    );
  });

  test.describe('for a resident', () => {
    test.use({ profile: 'resident' });

    test('is not offered, and its address leads to their room', async ({ page }) => {
      await page.goto('/weather');

      await expect(page).toHaveURL(/\/room$/);
    });
  });
});
