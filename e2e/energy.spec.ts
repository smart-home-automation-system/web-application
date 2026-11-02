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
