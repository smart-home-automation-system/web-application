import { Locator, Page } from '@playwright/test';

import { expect, startIn, test, useScenario } from './support';

/**
 * The histories of the temperatures - of the hot water, and of a room on the heating page - fed
 * by the mock API, whose sensor was silent for an hour yesterday. The mock dates its answers
 * from the time of the call, so every test pins the clock: a Thursday, 14:30 on the clocks of
 * the house.
 */
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
});

/** The picture of a history, once the library has arrived and drawn into it. */
async function drawn(card: Locator): Promise<Locator> {
  const plot = card.locator('.chart__plot');
  await expect(plot.locator('svg')).toBeVisible();
  return plot;
}

test.describe('the history of the hot water', () => {
  test('draws both temperatures of the last 24 hours, with what they ranged between', async ({
    page,
  }) => {
    await page.goto('/water');
    const card = page.getByTestId('water-history');

    await expect(card.locator('mat-card-title')).toHaveText('Temperature history');
    const plot = await drawn(card);
    await expect(plot).toHaveAttribute(
      'aria-label',
      'Chart of the temperature of the tank and of the circulation over the chosen period',
    );
    // the legend is part of the picture: both lines are named in it
    await expect(plot).toContainText('Tank');
    await expect(plot).toContainText('Circulation');
    await expect(card.getByTestId('history-facts')).toContainText(/Tank\s+37\.0\s+–\s+45\.0 °C/);
    await expect(card.getByTestId('history-facts')).toContainText(
      /Circulation\s+25\.0\s+–\s+31\.0 °C/,
    );
    await expect(card.getByRole('radio', { name: '24 hours' })).toBeChecked();
    await expect(card.getByRole('alert')).toHaveCount(0);
  });

  test('offers 7 and 30 days, and draws each', async ({ page }) => {
    await page.goto('/water');
    const card = page.getByTestId('water-history');
    await drawn(card);

    await card.getByRole('radio', { name: '7 days' }).click();
    await expect(card.getByRole('radio', { name: '7 days' })).toBeChecked();
    await drawn(card);
    // dates on the axis now - which of them fit depends on the width of the screen
    await expect(card.locator('.chart__plot')).toContainText(' Oct');

    await card.getByRole('radio', { name: '30 days' }).click();
    await drawn(card);
    await expect(card.locator('.chart__plot')).toContainText('Sept');
  });

  test('says that a period has no reading just after the first start of the service', async ({
    page,
  }) => {
    await useScenario(page, 'no-readings');
    await page.goto('/water');
    const card = page.getByTestId('water-history');

    await expect(card.getByTestId('history-empty')).toHaveText('No reading in this period.');
    await expect(card.locator('.chart__plot')).toHaveCount(0);
    await expect(card.getByRole('alert')).toHaveCount(0);
  });

  test('says that the service is failing in place of the chart, and keeps the choice of the period', async ({
    page,
  }) => {
    await useScenario(page, 'server-error');
    await page.goto('/water');
    const card = page.getByTestId('water-history');

    await expect(card.getByRole('alert')).toContainText('(error 502)');
    await expect(card.locator('.chart__plot')).toHaveCount(0);
    await expect(card.getByTestId('history-empty')).toHaveCount(0);
    await expect(card.getByRole('radio', { name: '7 days' })).toBeVisible();
  });

  test('fits a phone without horizontal scrolling, the chart included', async ({ page }) => {
    await page.goto('/water');
    await drawn(page.getByTestId('water-history'));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });

  test('speaks Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/water');
    const card = page.getByTestId('water-history');

    const plot = await drawn(card);
    await expect(card.locator('mat-card-title')).toHaveText('Historia temperatur');
    await expect(plot).toContainText('Zasobnik');
    await expect(card.getByRole('radio', { name: '24 godziny' })).toBeChecked();
    await expect(card.getByTestId('history-facts')).toContainText(/Zasobnik\s+37,0\s+–\s+45,0 °C/);
  });
});

test.describe('the age of the hot-water reading', () => {
  test('says when the sensors were read, next to the freshness of the call', async ({ page }) => {
    await page.goto('/water');

    await expect(page.getByTestId('measured')).toHaveText(/Measured 1 min\.? ago/);
    await expect(page.getByTestId('temperatures')).toContainText(/Updated/);
  });
});

test.describe('the history of a room', () => {
  async function open(page: Page, room: string): Promise<Locator> {
    await page.goto('/heating');
    const entry = page.getByTestId('rooms').locator(`[data-room="${room}"]`);
    await entry.getByRole('button').click();
    return entry.getByTestId('room-history');
  }

  test('is drawn in the panel of the room, with the schedule the room has today', async ({
    page,
  }) => {
    const history = await open(page, 'living room');

    const plot = await drawn(history);
    await expect(plot).toHaveAttribute(
      'aria-label',
      'Chart of the temperature of the room over the chosen period',
    );
    await expect(plot).toContainText('Temperature');
    await expect(plot).toContainText('Current schedule');
    await expect(history.getByTestId('history-facts')).toContainText(
      /Temperature\s+\d+\.\d\s+–\s+\d+\.\d °C/,
    );
    // the target of a past day is stored nowhere: the page says what the dashed line is not
    await expect(history).toContainText(
      'The dashed line is the schedule the room has today, laid over every day - not what was in force on a past day.',
    );
  });

  test('draws no schedule for a room without one', async ({ page }) => {
    const history = await open(page, 'bathroom down');

    const plot = await drawn(history);
    await expect(plot).not.toContainText('Current schedule');
    await expect(history).not.toContainText('dashed line');
  });

  test('fits a phone with a room open, without horizontal scrolling', async ({ page }) => {
    await drawn(await open(page, 'living room'));

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });
});
