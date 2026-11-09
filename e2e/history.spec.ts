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
  test('draws the tank and the circulation of the last 24 hours, each in its card', async ({
    page,
  }) => {
    await page.goto('/water');
    const card = page.getByTestId('water-history');

    await expect(card.locator('mat-card-title')).toHaveText('Temperature of the tank');
    const plot = await drawn(card);
    await expect(plot).toHaveAttribute(
      'aria-label',
      'Chart of the temperature of the tank over the chosen period',
    );
    // the legend is part of the picture
    await expect(plot).toContainText('Tank');
    await expect(card.getByTestId('history-facts')).toContainText(/Tank\s+37\.0\s+–\s+45\.0 °C/);
    await expect(card.getByRole('radio', { name: '24 hours' })).toBeChecked();
    await expect(card.getByRole('alert')).toHaveCount(0);

    // the circulation in a card of its own, in the same row (owner, 2026-11-09)
    const circulation = page.getByTestId('circulation-history');
    await expect(circulation.locator('mat-card-title')).toHaveText('Temperature of the circulation');
    await expect(await drawn(circulation)).toContainText('Circulation');
    await expect(circulation.getByTestId('history-facts')).toContainText(
      /Circulation\s+25\.0\s+–\s+31\.0 °C/,
    );
  });

  // a card waiting for another period keeps its place: nothing under it moves (owner, 2026-11-09)
  test('keeps the cards in place while another period is asked for', async ({ page }) => {
    await page.goto('/water');
    const card = page.getByTestId('water-history');
    await drawn(card);
    // where the card under the history stands on the page - measured from the title, since the shell scrolls a
    // container of its own - read in the frame the progress bar is shown in
    const runsTop = () =>
      document.querySelector('app-circulation-runs')!.getBoundingClientRect().top -
      document.querySelector('.page-header')!.getBoundingClientRect().top;
    const before = await page.evaluate(runsTop);
    const whileWaiting = page.waitForFunction(
      () =>
        document.querySelector('[data-testid="water-history"] mat-progress-bar')
          ? document.querySelector('app-circulation-runs')!.getBoundingClientRect().top -
            document.querySelector('.page-header')!.getBoundingClientRect().top
          : false,
      undefined,
      { polling: 'raf' },
    );

    await card.getByRole('radio', { name: '7 days' }).click();

    expect(await (await whileWaiting).jsonValue()).toBe(before);
    await drawn(card);
    expect(await page.evaluate(runsTop)).toBe(before);
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
    await expect(card.locator('mat-card-title')).toHaveText('Temperatura zasobnika');
    await expect(plot).toContainText('Zasobnik');
    await expect(card.getByRole('radio', { name: '24 godziny' })).toBeChecked();
    await expect(card.getByTestId('history-facts')).toContainText(/Zasobnik\s+37,0\s+–\s+45,0 °C/);
  });
});

test.describe('the age of the hot-water reading', () => {
  test('says when the sensors were read, next to the freshness of the call', async ({ page }) => {
    await page.goto('/water');

    // the card of the tank says when the sensors were read; the circulation reads its pump since HAS-406
    await expect(page.getByTestId('measured')).toHaveText([/Measured 1 min\.? ago/]);
    await expect(page.getByTestId('temperatures')).toContainText(/Updated/);
  });
});

test.describe('the history of a room', () => {
  async function open(page: Page, room: string): Promise<Locator> {
    await page.goto('/heating');
    const entry = page.getByTestId('rooms').locator(`[data-room="${room}"]`);
    // the history is in the window of the schedule of the room (HAS-266)
    await entry.getByTestId('room-schedule').click();
    return page.getByRole('dialog').getByTestId('room-history');
  }

  test('is drawn in the window of the room, with the schedule the room has today', async ({
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
