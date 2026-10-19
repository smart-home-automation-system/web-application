import { Locator, Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The room view (HAS-232), fed by the mock API: the device registry of the mock house, its
 * heating with the windows of its rooms, its blinds - which can be moved and paused, in the memory
 * of the page - and its lights (light-service, HAS-292), which are switched the same way. Nothing
 * here reaches a real device.
 */
const tile = (page: Page, room: string): Locator => page.locator(`[data-room-tile="${room}"]`);
const dialog = (page: Page): Locator => page.getByRole('dialog');

async function openRoom(page: Page, room: string): Promise<Locator> {
  await tile(page, room).getByRole('button', { name: 'Details' }).click();
  await expect(dialog(page)).toBeVisible();
  return dialog(page);
}

test('shows every room floor by floor, each with the rows of the owner', async ({ page }) => {
  await page.goto('/rooms');

  await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
  const office = tile(page, 'office');
  await expect(office.locator('[data-row]')).toHaveCount(8);
  await expect(office.locator('[data-row="temperature"] dd')).toHaveText('21.3 °C');
  await expect(office.locator('[data-row="blinds"] dd')).toContainText('40 %');
  await expect(office.locator('[data-row="openingSensors"] dd')).toHaveText('closed');
  // the bedroom: a door open for twelve minutes holds its heating
  await expect(tile(page, 'bedroom').getByTestId('tile-held')).toHaveText('held');
});

test('moves a blind and pauses its schedules, reading the blinds back', async ({ page }) => {
  await page.goto('/rooms');
  const window = await openRoom(page, 'office');
  const blind = window.locator('[data-blind="1"]');

  await expect(blind.getByTestId('blind-position')).toHaveText('40 %');
  await blind.getByRole('button', { name: 'Close Office window blinds' }).click();
  await expect(blind.getByTestId('blind-position')).toHaveText('0 %');

  await expect(blind.getByTestId('blind-paused')).toHaveCount(0);
  await blind.getByRole('switch').click();
  await expect(blind.getByTestId('blind-paused')).toContainText('Paused');
  // the schedules have a page of their own (owner, 2026-10-18)
  await expect(window.getByTestId('blind-schedules')).toHaveCount(0);
});

// no optimistic state: the switch shows what the blinds service says, not the click (found in review)
test('leaves the pause switch as it was when the pause failed', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/rooms');
  const window = await openRoom(page, 'office');
  const blind = window.locator('[data-blind="1"]');

  await blind.getByRole('switch').click();

  await expect(blind.getByRole('alert')).toBeVisible();
  await expect(blind.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(blind.getByTestId('blind-paused')).toHaveCount(0);
});

// HAS-292: a light is switched through light-service and shown as the service reads it back
test('switches a light and shows the state the light service reads back', async ({ page }) => {
  await page.goto('/rooms');
  const window = await openRoom(page, 'living room');
  const light = window.locator('[data-light="5"]');
  const state = light.getByTestId('light-state');

  await expect(state).toHaveText('on · 60 %');
  await expect(light.getByTestId('light-held')).toContainText('leave it alone until');
  await light.getByRole('button', { name: 'Off Living room dimmer' }).click();
  await expect(state).toHaveText('off');
  await expect(
    tile(page, 'living room').locator('[data-row="lights"] [data-state="off"]'),
  ).toHaveCount(1);

  await light.getByRole('button', { name: 'Set Living room dimmer' }).click();
  await expect(state).toHaveText('on · 60 %');
});

test('switches a Shelly light too, and tells a light not heard of as not known', async ({
  page,
}) => {
  await page.goto('/rooms');
  const office = await openRoom(page, 'office');
  const relay = office.locator('[data-light="3"]');

  await expect(relay.getByTestId('light-state')).toHaveText('off');
  await relay.getByRole('button', { name: 'On Office main light' }).click();
  await expect(relay.getByTestId('light-state')).toHaveText('on');
  // a relay does not dim
  await expect(relay.getByRole('slider')).toHaveCount(0);
  await office.getByRole('button', { name: 'Close', exact: true }).click();

  const bedroom = await openRoom(page, 'bedroom');
  await expect(bedroom.locator('[data-light="13"]').getByTestId('light-state')).toHaveText(
    'not known yet',
  );
});

test('tells a light that did not take the command, and leaves it as it was', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/rooms');
  const window = await openRoom(page, 'living room');
  const light = window.locator('[data-light="5"]');

  await light.getByRole('button', { name: 'Off Living room dimmer' }).click();

  await expect(light.getByRole('alert')).toBeVisible();
  await expect(light.getByTestId('light-state')).toHaveText('on · 60 %');
});

test('tells the open window that holds the heating on the heating page', async ({ page }) => {
  await page.goto('/heating');

  const bedroom = page.getByTestId('rooms').locator('[data-room="bedroom"]');
  await expect(bedroom.getByTestId('room-window')).toContainText('Window open');
  await expect(bedroom.getByTestId('room-held')).toHaveText('Heating held - window open');
  await expect(
    page.getByTestId('rooms').locator('[data-room="office"]').getByTestId('room-window'),
  ).toContainText('Windows closed');
});
