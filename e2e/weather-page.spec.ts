import { Locator, Page } from '@playwright/test';

import { expect, startIn, test, useScenario } from './support';

/**
 * The weather page: the cards of the metrics and the nine charts of their history, fed by the
 * mock API, whose station was silent for an hour yesterday. The mock dates its answers from the
 * time of the call, so every test pins the clock: a Friday, 14:30 on the clocks of the house.
 */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-16T12:30:00Z'));
});

const CHARTS = [
  'temperature',
  'humidity',
  'wind',
  'illuminance',
  'precipitation',
  'pressure',
  'pm1',
  'pm25',
  'pm10',
];

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

  test('draws the nine charts over the last 24 hours, with what they ranged between', async ({
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

  // the page is one look at the weather: one period for all nine
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

  // HAS-431: the air quality sensor of the garden - a moderate evening in the mock house
  test('tells the air quality, its level in words, and a chart per fraction with its thresholds', async ({
    page,
  }) => {
    await page.goto('/weather');

    const air = page.getByTestId('card-air');
    await expect(air.getByTestId('air-level')).toHaveText('Moderate');
    await expect(air).toContainText(/PM2\.5\s+Moderate\s+42 µg\/m³/);
    await expect(air).toContainText(/PM10\s+Moderate\s+58 µg\/m³/);
    await expect(air).toContainText(/PM1\s+31 µg\/m³/);
    await expect(air.getByTestId('air-smog')).toHaveCount(0);
    await expect(page.getByTestId('card-station')).toContainText(/Air quality sensor\s+Answers/);
    for (const key of ['pm25', 'pm10']) {
      const plot = await drawn(chart(page, key));
      await expect(plot).toContainText('Moderate from');
      await expect(plot).toContainText('Bad from');
    }
    await expect(await drawn(chart(page, 'pm1'))).not.toContainText('Moderate from');
  });

  test('warns of the smog of an open episode', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mock-smog', 'on'));
    await page.goto('/weather');

    const air = page.getByTestId('card-air');
    await expect(air.getByTestId('air-level')).toHaveText('Very bad');
    await expect(air.getByTestId('air-smog')).toContainText(
      'Smog outside since 13:15 - the household was told.',
    );
  });

  // seven cards: in one row, or the air quality two places wide in rows of four or of two - never a short row
  for (const width of [2560, 1440, 1100, 700]) {
    test(`keeps every row of cards full at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/weather');
      await expect(page.getByTestId('card-air').getByTestId('air-level')).toBeVisible();

      const rows = await page.evaluate(() => {
        const section = document.querySelector('section.cards') as HTMLElement;
        const box = section.getBoundingClientRect();
        const byTop = new Map<number, number>();
        for (const card of section.children) {
          const rect = card.getBoundingClientRect();
          const top = Math.round(rect.top);
          byTop.set(top, (byTop.get(top) ?? 0) + rect.width);
        }
        return { width: box.width, rows: [...byTop.values()] };
      });
      for (const used of rows.rows) {
        // the gaps between the cards are what is left
        expect(rows.width - used).toBeLessThan(80);
      }
    });
  }

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
