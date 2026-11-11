import { expect, test, useScenario } from './support';

/**
 * The energy of the house (HAS-341), fed by the mock API: a bright afternoon - the panels give
 * more than the house takes, the battery charges, the rest goes to the grid; phase B above its
 * warning current, one fault of the SOFAR, the SolaX cloud silent.
 */

test('shows where the energy goes now, the devices, the alarms and the history', async ({
  page,
}) => {
  await page.goto('/energy');
  const main = page.getByRole('main');

  const flow = page.getByTestId('card-flow');
  await expect(flow.locator('[data-node="panels"]')).toContainText('5.32 kW');
  await expect(
    flow.getByRole('img', { name: 'The house returns energy to the grid' }),
  ).toBeVisible();
  await expect(flow.getByRole('img', { name: 'The house charges the battery' })).toBeVisible();

  await expect(page.getByTestId('grid-state')).toHaveText('power The grid is there');
  await expect(
    page.getByTestId('card-sources').locator('[data-source="solaxCloud"]'),
  ).toContainText('silent');

  await expect(page.getByTestId('card-solax').locator('[data-field="runMode"]')).toContainText(
    'normal',
  );
  await expect(page.getByTestId('card-sofar').locator('[data-field="faults"]')).toContainText(
    'GridOVP',
  );
  await expect(page.getByTestId('card-grid').locator('[data-phase="b"]')).toContainText(
    'overloaded',
  );
  await expect(page.getByTestId('card-alerts').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('outage')).toHaveCount(2);

  // the power, the battery, the days and the 48 hours of the forecast (HAS-373)
  await expect(main.locator('.chart__plot svg')).toHaveCount(4);
  await expect(page.getByTestId('in-the-grid')).toBeVisible();
  // the net-metering in kWh, never money
  await expect(main).not.toContainText('zł');
});

// HAS-417: the meter of Tauron beside the 3EM, the hours of a day - the night the clocks went back with its 25 hours -
// and its side of the settlement
test('sets the meter of Tauron beside the 3EM and opens the hours of a day', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T10:00:00+01:00'));
  await page.goto('/energy');
  const operator = page.getByTestId('energy-operator');

  // the portal serves a day the morning after it: yesterday stands without it, never 0
  await expect(operator.locator('[data-day="2026-10-27"]')).toContainText('not yet');
  await expect(operator.locator('[data-day="2026-10-26"] [data-apart="import"]')).toHaveText(
    '+0.8 %',
  );
  await expect(operator.getByTestId('operator-total')).toBeVisible();

  await operator.locator('[data-day="2026-10-25"]').getByTestId('operator-hours').click();
  const window = page.getByRole('dialog');
  await expect(window.getByTestId('elicznik-day-title')).toContainText('25 Oct');
  await expect(window.locator('.chart__plot svg')).toBeVisible();
  await expect(window).toContainText('The clocks went back that night');
  await window.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect(page.getByTestId('operator-settlement')).toBeVisible();
  await expect(page.getByTestId('operator-in-the-grid')).toContainText('kWh');
});

test('goes back a billing year, and not past the one of today', async ({ page }) => {
  await page.goto('/energy');
  const settlement = page.getByTestId('energy-settlement');
  await expect(settlement.getByTestId('year-after')).toBeDisabled();

  await settlement.getByTestId('year-before').click();

  await expect(settlement.getByTestId('billing-year')).toContainText('/');
  await expect(settlement.getByTestId('year-after')).toBeEnabled();
});

test('says what is not known just after the service started', async ({ page }) => {
  await useScenario(page, 'no-readings');
  await page.goto('/energy');

  await expect(page.getByTestId('grid-state')).toHaveAttribute('data-state', 'unknown');
  await expect(page.getByTestId('card-flow').locator('[data-node="house"]')).toContainText(
    'not known',
  );
  await expect(page.getByTestId('no-alerts')).toBeVisible();
});

// HAS-373: the production forecast - the sentence, the closed days beside, seven days, 48 hours
test('shows the production forecast of the coming days', async ({ page }) => {
  await page.goto('/energy');
  const card = page.getByTestId('card-forecast');

  await expect(card.getByTestId('forecast-outlook')).toContainText(
    'Little production for 3 days, better',
  );
  await expect(card.locator('.forecast__day--past')).toHaveCount(2);
  await expect(card.locator('.forecast__day:not(.forecast__day--past)')).toHaveCount(7);
  await expect(card.locator('.forecast__day--pale')).toHaveCount(4);
  await expect(card.getByTestId('forecast-house-load')).toHaveText(
    'House load, mean of 7 days: 24.6 kWh',
  );
  await expect(
    card.getByRole('img', {
      name: 'The power each inverter is expected to give in the next 48 hours',
    }),
  ).toBeVisible();
  await expect(card.getByTestId('forecast-ratios')).toHaveText(
    'Performance ratio: SOLAX 0.62 (9 days), SOFAR 0.80 (initial)',
  );
});

test('shows the energy on the overview, leading to the page', async ({ page }) => {
  await page.goto('/overview');
  const tile = page.getByTestId('tile-energy');

  await expect(tile.locator('[data-energy="production"]')).toContainText('5.32 kW');
  await expect(tile.locator('[data-energy="battery"]')).toContainText('68 %');
  // HAS-373: tomorrow of the forecast
  await expect(tile.getByTestId('energy-tomorrow')).toHaveText('Tomorrow: hardly any, about 2 kWh');
  await tile.getByRole('link').click();

  await expect(page).toHaveURL(/\/energy$/);
});

test('shows an inverter on the devices page with its binding', async ({ page }) => {
  await page.goto('/devices');
  await page
    .locator('[data-room-card="garage"]')
    .getByRole('button', { name: /Details/ })
    .click();

  await expect(page.locator('[data-device="64"] [data-testid="binding"]')).toContainText('SOLAX');
});

// HAS-342: the charge of the battery - against the mock API only, never the real inverter
test('starts and stops a charge from the grid, and keeps it in the history', async ({ page }) => {
  await page.goto('/energy');

  await expect(page.getByTestId('charge-none')).toBeVisible();
  await page.getByTestId('charge-target').fill('90');
  const card = page.getByTestId('card-charge');
  const height = (await card.boundingBox())!.height;
  await page.getByTestId('charge-start').click();
  // a write to the real inverter: asked first in a window over the page, the card keeps its size (owner, 2026-11-11)
  const question = page.getByRole('dialog');
  await expect(question.getByTestId('charge-question')).toContainText(
    'Charge the battery from the grid now?',
  );
  await expect(question.getByRole('button', { name: 'Do not charge' })).toBeFocused();
  expect((await card.boundingBox())!.height).toBe(height);
  await question.getByTestId('confirm-yes').click();
  await expect(question).toHaveCount(0);
  await expect(page.getByTestId('charge-state')).toHaveText('Charging · started by the dashboard');

  await page.getByTestId('charge-cancel').click();
  await expect(page.getByTestId('charge-none')).toBeVisible();
  await expect(page.getByTestId('run').first()).toContainText('stopped');
});

test('turns the automation on and skips a planned outage of the street', async ({ page }) => {
  await page.goto('/energy');

  const automation = page.getByTestId('card-automation');
  await automation.getByRole('switch').click();
  await page.getByTestId('automation-power').fill('9');
  await page.getByTestId('automation-save').click();
  await expect(page.getByTestId('automation-problems')).toContainText('from 1 to 8 kW');
  await page.getByTestId('automation-power').fill('4,5');
  await page.getByTestId('automation-save').click();
  await expect(automation).toContainText('Last changed');
  await expect(automation.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

  const street = page.getByTestId('planned-outage').first();
  await expect(street).toContainText('The charge would start at');
  await street.getByTestId('planned-skip').click();
  await expect(street.getByTestId('planned-skipped')).toBeVisible();
  await expect(page.getByTestId('charge-planned')).toHaveCount(0);
});

test('tells a charge the house did not take', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/energy');

  await page.getByTestId('charge-start').click();
  await page.getByRole('dialog').getByTestId('confirm-yes').click();
  await expect(page.getByTestId('card-charge')).toContainText('The charge could not be started.');
  await expect(page.getByTestId('charge-none')).toBeVisible();
});
