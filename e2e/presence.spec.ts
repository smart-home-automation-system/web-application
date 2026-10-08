import { expect, test, useScenario } from './support';

/**
 * The presence dashboard, fed by the mock API. The mock household lives by a routine worked out
 * from the time of the call, so every test pins the clock: a Thursday, 15:30 on the clocks of
 * the house. The history of the mock begins twelve days earlier, in the morning of 26 September.
 */
const THURSDAY_AFTERNOON = new Date('2026-10-08T13:30:00Z');

test.describe('presence', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(THURSDAY_AFTERNOON);
  });

  test('says who is at home now, since when, and when that was last checked', async ({ page }) => {
    await page.goto('/presence');

    await expect(page.getByRole('heading', { level: 1, name: 'Presence' })).toBeVisible();
    const now = page.getByTestId('now');
    const resident = (name: string) => now.getByRole('listitem').filter({ hasText: name });

    await expect(resident('Borys')).toContainText('At home');
    await expect(resident('Borys')).toContainText('since 8 Oct 2026, 15:05');
    await expect(resident('Aurelia')).toContainText('Away');
    await expect(resident('Aurelia')).toContainText('since 8 Oct 2026, 07:40');
    await expect(resident('Aurelia')).toContainText('checked 40 sec ago');
    // listed by the registry, never seen by the detection: that is not "away"
    await expect(resident('Damian')).toContainText('Not observed yet');
    await expect(resident('Damian')).not.toContainText('Away');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('draws the days of the first resident for the last seven days, the newest first', async ({
    page,
  }) => {
    await page.goto('/presence');
    const card = page.getByTestId('resident');
    const days = card.locator('.day');

    await expect(days).toHaveCount(7);
    await expect(days.first()).toHaveAttribute('data-date', '2026-10-08');
    await expect(days.last()).toHaveAttribute('data-date', '2026-10-02');

    // yesterday, a whole day: out from 07:40 to 16:30
    const yesterday = card.locator('.day[data-date="2026-10-07"]');
    await expect(yesterday).toContainText('Wed 7 Oct');
    await expect(yesterday).toContainText('15 h 10 min');
    await expect(yesterday).toContainText('63.2 %');
    await expect(yesterday).toContainText('First arrival 16:30');
    await expect(yesterday).toContainText('Last departure 07:40');
    await expect(yesterday.getByRole('img')).toHaveAccessibleName(
      'At home: 00:00–07:40, 16:30–24:00',
    );
  });

  test('marks the period that is still going on', async ({ page }) => {
    await page.goto('/presence');
    const card = page.getByTestId('resident');

    await card.getByRole('radio', { name: 'Borys' }).click();

    const today = card.locator('.day[data-date="2026-10-08"]');
    await expect(today).toContainText('Still at home');
    await expect(today.locator('.lane__block--open')).toHaveCount(1);
    // an evening that ran on into the night is not open on the day it began
    await expect(card.locator('.day[data-date="2026-10-07"] .lane__block--open')).toHaveCount(0);
    await expect(card.locator('.day[data-date="2026-10-07"]')).not.toContainText('Still at home');
  });

  test('draws only the observed part of today, and the rest of the day as not observed', async ({
    page,
  }) => {
    await page.goto('/presence');
    const lane = page.getByTestId('house').locator('.day[data-date="2026-10-08"] .lane');
    await expect(lane).toBeVisible();

    const [whole, observed] = await Promise.all([
      lane.boundingBox(),
      lane.locator('.lane__observed').boundingBox(),
    ]);

    // the last check was at 15:29:20: 64.5 % of the day
    expect(observed!.width / whole!.width).toBeGreaterThan(0.63);
    expect(observed!.width / whole!.width).toBeLessThan(0.66);
  });

  test('says when the house stood empty', async ({ page }) => {
    await page.goto('/presence');
    const house = page.getByTestId('house');

    // a weekday: everybody is out from 08:15 to 15:05
    const today = house.locator('.day[data-date="2026-10-08"]');
    await expect(today).toContainText('Stood empty');
    await expect(today).toContainText('Empty 6 h 50 min');
    await expect(today.getByRole('img')).toHaveAccessibleName(
      'Somebody at home: 00:00–08:15, 15:05–15:29',
    );
    // a Sunday with somebody in all day
    const sunday = house.locator('.day[data-date="2026-10-04"]');
    await expect(sunday).toContainText('Never empty');
    await expect(sunday).toContainText('Occupied 24 h 0 min');
  });

  // the history of the mock begins on 26 September: thirty days reach back before it
  test('shows no days before the history begins, and says where it does', async ({ page }) => {
    await page.goto('/presence');

    await page.getByTestId('period').getByRole('radio', { name: '30 days' }).click();

    const house = page.getByTestId('house');
    await expect(house.locator('.day')).toHaveCount(13);
    await expect(house.locator('.day').last()).toHaveAttribute('data-date', '2026-09-26');
    await expect(house.getByTestId('house-observed-since')).toContainText(
      'Observed since 26 Sept 2026, 09:20',
    );
    // of the first day only the part after 09:20 is drawn as observed
    const lane = house.locator('.day[data-date="2026-09-26"] .lane');
    const [whole, observed] = await Promise.all([
      lane.boundingBox(),
      lane.locator('.lane__observed').boundingBox(),
    ]);
    expect(observed!.x - whole!.x).toBeGreaterThan(whole!.width * 0.38);
    await expect(page.getByTestId('resident').locator('.day')).toHaveCount(13);
  });

  test('takes a period from the calendar, and shows it in the date field', async ({ page }) => {
    await page.goto('/presence');
    const period = page.getByTestId('period');
    await expect(period.getByLabel('First day')).toHaveValue('02/10/2026');
    await expect(period.getByLabel('Last day')).toHaveValue('08/10/2026');

    await period.getByLabel('First day').click();
    const calendar = page.getByRole('dialog');
    await calendar.getByRole('button', { name: '5 October 2026', exact: true }).click();
    await calendar.getByRole('button', { name: '6 October 2026', exact: true }).click();

    const days = page.getByTestId('house').locator('.day');
    await expect(days).toHaveCount(2);
    await expect(days.first()).toHaveAttribute('data-date', '2026-10-06');
    await expect(period.getByLabel('First day')).toHaveValue('05/10/2026');
    await expect(period.getByLabel('Last day')).toHaveValue('06/10/2026');
    // none of the presets is the period any more
    await expect(period.getByRole('radio', { checked: true })).toHaveCount(0);

    await period.getByRole('radio', { name: 'Today' }).click();

    await expect(days).toHaveCount(1);
    await expect(period.getByLabel('First day')).toHaveValue('08/10/2026');
  });

  test('says that nothing was observed for a resident the detection has never seen', async ({
    page,
  }) => {
    await page.goto('/presence');
    const card = page.getByTestId('resident');

    await card.getByRole('radio', { name: 'Damian' }).click();

    await expect(card.getByTestId('resident-nothing')).toHaveText(
      'Nothing was observed for this resident in this period.',
    );
    await expect(card.locator('.day')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // nothing is stored about anybody yet
  test('says that nothing was observed just after the first start of the service', async ({
    page,
  }) => {
    await useScenario(page, 'no-readings');

    await page.goto('/presence');

    await expect(page.getByTestId('now').getByText('Not observed yet')).toHaveCount(4);
    await expect(page.getByTestId('house-nothing')).toHaveText(
      'Nothing was observed in this period.',
    );
    await expect(page.getByTestId('resident-nothing')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // three resources feed the page: each failure is told once, in its card
  test('says in each card that the service is failing', async ({ page }) => {
    await useScenario(page, 'server-error');

    await page.goto('/presence');

    await expect(page.getByTestId('now').getByRole('alert')).toContainText('(error 502)');
    await expect(page.getByTestId('house').getByRole('alert')).toContainText('(error 502)');
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(2);
    // without the list of who lives here there is nobody to ask a history of
    await expect(page.getByTestId('resident')).toContainText(
      'There is nobody to show the history of.',
    );
    await expect(page.locator('.day')).toHaveCount(0);
  });

  test('fits a phone without horizontal scrolling', async ({ page }) => {
    await page.goto('/presence');
    await expect(page.getByTestId('house').locator('.day')).toHaveCount(7);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });

  test('speaks Polish, except for the names', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('smart-home.language.Aurelia', 'pl'));

    await page.goto('/presence');

    await expect(page.getByRole('heading', { level: 1, name: 'Obecność' })).toBeVisible();
    await expect(
      page.getByTestId('now').getByRole('listitem').filter({ hasText: 'Borys' }),
    ).toContainText('W domu');
    const yesterday = page.getByTestId('resident').locator('.day[data-date="2026-10-07"]');
    await expect(yesterday).toContainText('15 godz. 10 min');
    await expect(yesterday).toContainText('63,2 %');
    await expect(yesterday).toContainText('Pierwsze przyjście 16:30');
    await expect(page.getByTestId('house').locator('.day[data-date="2026-10-08"]')).toContainText(
      'Stał pusty',
    );
  });
});
