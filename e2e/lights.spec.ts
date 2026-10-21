import { Locator, Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The lights page (HAS-266), fed by the mock API: the lights of the mock light-service, which can
 * be switched in the memory of the page, the occupancy of their rooms, the rules and the empty
 * house. Nothing here reaches a real device.
 */
const room = (page: Page, name: string): Locator =>
  page.locator(`[data-testid="light-room"][data-room="${name}"]`);
const light = (page: Page, id: number): Locator =>
  page.locator(`[data-testid="light"][data-light="${id}"]`);

test('shows the lights room by room with the occupancy, the rules and the empty house', async ({
  page,
}) => {
  await page.goto('/lights');

  await expect(page.getByRole('heading', { name: 'Lights', level: 1 })).toBeVisible();
  await expect(room(page, 'office').getByTestId('occupancy')).toContainText('Occupied');
  await expect(room(page, 'living room').getByTestId('occupancy')).toContainText(
    'Occupancy not known',
  );
  await expect(room(page, 'office').getByTestId('room-rule')).toContainText(
    'off 15 min after empty',
  );
  await expect(room(page, 'living room').getByTestId('rule-resident-off')).toBeVisible();
  await expect(light(page, 13).getByTestId('light-state')).toHaveText('not known yet');
  await expect(light(page, 43).getByTestId('light-unreachable')).toBeVisible();
  await expect(page.getByTestId('empty-house-state')).toHaveText('Somebody at home');
  await expect(page.getByTestId('empty-house-lit')).toContainText('Living room dimmer');
});

// a Shelly relay reports at once, and the page shows it with the read after the command
test('switches a light and shows the state the light service reads back', async ({ page }) => {
  await page.goto('/lights');
  const main = light(page, 3);

  await expect(main.getByTestId('light-state')).toHaveText('off');
  await main.getByRole('button', { name: 'Switch on Office main light' }).click();
  await expect(main.getByTestId('light-state')).toHaveText('on');
  // a change by hand: the rules of the room leave it alone for a while
  await expect(main.getByTestId('light-held')).toBeVisible();
});

// the desk lamp is an Eaton light, which reports a second late (HAS-293): it is seen within the
// expectation timeout only thanks to the second read - the poll alone would take 10 s
test('sets the brightness of a light from the window of its room', async ({ page }) => {
  await page.goto('/lights');
  await room(page, 'office').getByRole('button', { name: 'Details office' }).click();
  const window = page.getByRole('dialog');
  const lamp = window.locator('[data-testid="window-light"][data-light="40"]');

  await expect(lamp.getByTestId('window-light-state')).toHaveText('off');
  await lamp.getByRole('slider').fill('75');
  await lamp.getByRole('button', { name: 'Set Brightness Office desk lamp' }).click();

  await expect(lamp.getByTestId('window-light-state')).toHaveText('on · 75 %');
  // the card behind the window follows the same read
  await expect(light(page, 40).getByTestId('light-state')).toHaveText('on · 75 %');
});

test('switches a room off, and names the light it could not reach', async ({ page }) => {
  await page.goto('/lights');
  const kitchen = room(page, 'kitchen');
  await kitchen.getByRole('button', { name: 'Switch on Kitchen hood light' }).click();
  await expect(light(page, 44).getByTestId('light-state')).toHaveText('on · 100 %');

  await kitchen.getByRole('button', { name: 'All off kitchen' }).click();

  await expect(light(page, 44).getByTestId('light-state')).toHaveText('off');
  await expect(kitchen.getByTestId('room-status')).toContainText(
    'Not switched: 1 - Kitchen counter light',
  );
});

test('tells a light that did not take the command, and leaves it as it was', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/lights');

  await light(page, 3).getByRole('button', { name: 'Switch on Office main light' }).click();

  await expect(room(page, 'office').getByTestId('room-status')).toContainText('Main:');
  await expect(light(page, 3).getByTestId('light-state')).toHaveText('off');
});
