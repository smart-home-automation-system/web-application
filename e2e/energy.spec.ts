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

  await expect(main.locator('.chart__plot svg')).toHaveCount(3);
  await expect(page.getByTestId('in-the-grid')).toBeVisible();
  // the net-metering in kWh, never money
  await expect(main).not.toContainText('zł');
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

test('shows the energy on the overview, leading to the page', async ({ page }) => {
  await page.goto('/overview');
  const tile = page.getByTestId('tile-energy');

  await expect(tile.locator('[data-energy="production"]')).toContainText('5.32 kW');
  await expect(tile.locator('[data-energy="battery"]')).toContainText('68 %');
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
  await page.getByTestId('charge-start').click();
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
  await expect(page.getByTestId('card-charge')).toContainText('The charge could not be started.');
  await expect(page.getByTestId('charge-none')).toBeVisible();
});
