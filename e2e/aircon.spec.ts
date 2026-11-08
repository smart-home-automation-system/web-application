import { expect, test, useScenario } from './support';

/**
 * The page of the air conditioners (HAS-395), fed by the mock API: the office cools, the bedroom is off and
 * held by its window, the unit of tobi does not answer, the sanctum heats; the sanctum keeps its room below
 * 25 °C with the frost protection on, the office has a rule that does not keep it cool.
 */

test('lists every unit by room with its filter and its rule, then the plugs and their draw', async ({
  page,
}) => {
  await page.goto('/aircon');
  const units = page.getByTestId('units').locator('[data-unit]');
  await expect(units).toHaveCount(5);
  // the order of the house: the office and the bedroom upstairs, the sanctum outside
  await expect(units.first()).toHaveAttribute('data-unit', '140');
  await expect(units.last()).toHaveAttribute('data-unit', '144');

  const sanctum = page.locator('[data-unit="144"]');
  await expect(sanctum.getByTestId('rule')).toContainText(
    'Keeps the room below 25 °C, cooling at 22 °C · frost protection on',
  );
  await expect(page.locator('[data-unit="141"]').getByTestId('rule')).toContainText('No rule.');

  await expect(page.locator('[data-plug]')).toHaveCount(2);
  await expect(page.getByTestId('power-chart-indoor').locator('.chart__plot svg')).toBeVisible();
  await expect(page.getByTestId('power-chart-sanctum').locator('.chart__plot svg')).toBeVisible();
});

test('writes a rule and shows it as the service stored it', async ({ page }) => {
  await page.goto('/aircon');
  const office = page.locator('[data-unit="140"]');
  await office.getByTestId('rule-edit').click();

  const form = office.getByTestId('rule-form');
  await form.getByTestId('rule-threshold').fill('23');
  await form.getByTestId('rule-target').fill('24');
  await form.getByTestId('rule-save').click();
  await expect(form.getByTestId('rule-problem')).toHaveText(
    'The target must not be above the threshold.',
  );

  await form.getByTestId('rule-target').fill('22');
  await form.getByRole('switch', { name: 'Keep the room below the threshold' }).click();
  await form.getByTestId('rule-save').click();

  await expect(office.getByTestId('rule-form')).toHaveCount(0);
  await expect(office.getByTestId('rule')).toContainText(
    'Keeps the room below 23 °C, cooling at 22 °C',
  );
});

test('marks a filter cleaned after a question', async ({ page }) => {
  await page.goto('/aircon');
  const bedroom = page.locator('[data-unit="143"]');
  await bedroom.getByTestId('filter-cleaned').click();
  const question = bedroom.getByTestId('filter-question');
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await question.getByRole('button', { name: 'Mark cleaned' }).click();

  await expect(bedroom.getByTestId('filter')).toContainText('0 h of work since the cleaning of');
});

test('opens the changes of 24 hours of a unit', async ({ page }) => {
  await page.goto('/aircon');
  const office = page.locator('[data-unit="140"]');
  await office.getByTestId('runs-toggle').click();
  await expect(office.getByTestId('runs').locator('li')).toHaveCount(3);
});

test('offers the power cycle only once no indoor unit is on, and asks first', async ({ page }) => {
  await page.goto('/aircon');
  const cycle = page.getByTestId('power-cycle');
  await expect(cycle.getByTestId('cycle-refused')).toContainText('Not possible now:');
  await expect(cycle.getByTestId('cycle-start')).toHaveCount(0);

  // the office is the one indoor unit on
  await page.locator('[data-unit="140"]').getByTestId('aircon-off').locator('button').click();
  await expect(cycle.getByTestId('cycle-start')).toBeVisible({ timeout: 40_000 });

  await cycle.getByTestId('cycle-start').click();
  await expect(cycle.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await cycle.getByTestId('cycle-confirm').click();
  await expect(cycle.getByTestId('cycle-last')).toContainText('done · Aurelia');
});

test('says what is not known just after the service started', async ({ page }) => {
  await useScenario(page, 'no-readings');
  await page.goto('/aircon');
  // the units of the registry, none of them read yet: no setting offered, nothing about a filter or a rule made up
  const office = page.locator('[data-unit="140"]');
  await expect(office.getByTestId('aircon-not-read')).toBeVisible();
  await expect(office.getByTestId('filter')).toContainText(
    'The hours of the filter are not known.',
  );
  await expect(office.getByTestId('rule')).toContainText('No rule.');
  await expect(page.locator('[data-plug="indoor"]')).toContainText('Now not known');
  await expect(page.getByTestId('power-cycle')).toContainText(
    'Not possible now: The draw of the indoor plug is not known',
  );
});
