import { Locator, Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The editor of the rule of a room (HAS-267), fed by the mock API: the rules of the mock
 * light-service, which a save changes in the memory of the page - so after a write the page is left
 * by its links, never by `page.goto`, which would start the mock house anew. The rules are judged
 * by the lights and sensors of the mock registry, as the service judges them.
 */
const room = (page: Page, name: string): Locator =>
  page.locator(`[data-testid="light-room"][data-room="${name}"]`);

/** From the lights page, through the window of the room, to the editor of its rule. */
async function openEditor(page: Page, name: string): Promise<void> {
  await page.goto('/lights');
  await room(page, name)
    .getByRole('button', { name: `Details ${name}` })
    .click();
  await page.getByRole('dialog').getByTestId('window-rule-edit').click();
  await expect(page).toHaveURL(`/lights/rooms/${encodeURIComponent(name)}/rules`);
  // the window closes itself on the way
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('rule-stored')).toBeVisible();
}

test('writes a rule for a room without one, and the lights page shows it', async ({ page }) => {
  await openEditor(page, 'bedroom');
  await expect(page.getByTestId('rule-stored')).toContainText('The room has no rule yet');
  await expect(page.getByTestId('rule-light')).toContainText('Bedroom light strip');

  await page.getByTestId('manual-hold').fill('30');
  await page.getByTestId('rule-save').click();

  await expect(page.getByTestId('rule-saved')).toContainText('Saved');
  await expect(page.getByTestId('rule-stored')).toContainText('Written');
  await page.getByTestId('rule-back').click();
  await expect(room(page, 'bedroom').getByTestId('room-rule')).toContainText(
    'nothing automatic · by hand left 30 min',
  );
});

test('changes a rule and fills the form from what the service stored', async ({ page }) => {
  await openEditor(page, 'office');
  await expect(page.getByTestId('auto-off-delay')).toHaveValue('15');

  await page.getByTestId('auto-off-delay').fill('25');
  await page.getByTestId('rule-save').click();

  await expect(page.getByTestId('rule-saved')).toContainText('Saved');
  await expect(page.getByTestId('auto-off-delay')).toHaveValue('25');
  await page.getByTestId('rule-back').click();
  await expect(room(page, 'office').getByTestId('room-rule')).toContainText(
    'off 25 min after empty',
  );
});

test('writes motion-on with periods and a colour for a room with an rgbw light', async ({
  page,
}) => {
  await openEditor(page, 'living room');
  await page.getByTestId('motion-on-enabled').getByRole('switch').click();
  await page.getByTestId('motion-off-after').fill('4');
  await page.getByTestId('period-add').click();
  const period = page.getByTestId('period-row').first();
  await period.getByTestId('period-from').fill('21:00');
  await period.getByTestId('period-to').fill('06:30');
  await period.getByTestId('period-brightness').fill('15');
  await period.getByTestId('period-color-on').getByRole('checkbox').check();
  await period.getByTestId('period-color').fill('#ff8800');
  await page.getByTestId('rule-save').click();

  await expect(page.getByTestId('rule-saved')).toContainText('Saved');
  await expect(page.getByTestId('period-color')).toHaveValue('#ff8800');
  // the switch of the resident is kept by a save: the living room's stays off
  await expect(page.getByTestId('resident-switch').getByRole('switch')).not.toBeChecked();
});

test('removes a rule after asking, and the room has none', async ({ page }) => {
  await openEditor(page, 'hall up');

  await page.getByTestId('rule-remove').click();
  await expect(page.getByTestId('rule-remove-cancel')).toBeFocused();
  await page.getByTestId('rule-remove-confirm').click();

  await expect(page).toHaveURL('/lights');
  await expect(room(page, 'hall up').getByTestId('room-rule')).toContainText('No rule');
});

test('refuses what the rule breaks before anything is sent', async ({ page }) => {
  await openEditor(page, 'living room');

  await page.getByTestId('motion-on-enabled').getByRole('switch').click();
  await page.getByTestId('rule-save').click();

  await expect(
    page.getByTestId('motion-off-after').locator('xpath=ancestor::mat-form-field'),
  ).toContainText('Enter the minutes.');
  await expect(page.getByTestId('periods-missing')).toContainText('Motion-on needs a period');
  await expect(page.getByTestId('rule-saved')).toHaveText('');
});

// the halls on Eaton PIRs stay with NetLinx (owner, HAS-262)
test('tells a room on Eaton PIRs only that it gets no rule', async ({ page }) => {
  await openEditor(page, 'hall down');

  await expect(page.getByTestId('room-blocked')).toContainText('Eaton PIR sensors only');
  await expect(page.getByTestId('rule-sensor')).toContainText('an Eaton PIR');
});

test('keeps the form as entered when the save fails', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await openEditor(page, 'office');

  await page.getByTestId('manual-hold').fill('90');
  await page.getByTestId('rule-save').click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'The rule was not saved.' }),
  ).toBeVisible();
  await expect(page.getByTestId('manual-hold')).toHaveValue('90');
});
