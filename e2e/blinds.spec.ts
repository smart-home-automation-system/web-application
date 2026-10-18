import { Locator, Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The blinds page (HAS-252), fed by the mock API: the blinds of the mock house - which can be
 * moved and paused, a room and the whole house at once too, in the memory of the page - its
 * schedules, which can be switched on and off, and the calendar with the holidays of a fixed date.
 * Nothing here reaches a real device.
 */
const room = (page: Page, name: string): Locator =>
  page.locator(`[data-testid="blind-room"][data-room="${name}"]`);

async function openSchedules(page: Page, name: string): Promise<Locator> {
  await room(page, name).getByTestId('room-schedules').click();
  const window = page.getByRole('dialog');
  await expect(window).toBeVisible();
  return window;
}

test('shows the rooms with blinds floor by floor, in cards of one size', async ({ page }) => {
  await page.goto('/blinds');

  await expect(page.getByRole('heading', { level: 1, name: 'Blinds' })).toBeVisible();
  await expect(page.locator('[data-testid="floor"]')).toHaveCount(2);
  // the office and the living room downstairs, the bedroom of a resident upstairs (HAS-254)
  await expect(page.getByTestId('blind-room')).toHaveCount(3);
  // the door first, then the windows; each by its short name
  await expect(room(page, 'office').locator('.blind__text')).toHaveText(['Door', 'Window']);
  await expect(
    room(page, 'office').locator('[data-blind="1"] [data-testid="blind-position"]'),
  ).toContainText('40 %');
  // an Eaton blind nothing was heard of: no position, not known - never closed
  await expect(
    room(page, 'living room').locator('[data-blind="7"] [data-testid="blind-position"]'),
  ).toHaveText('not known');
  // a room of one blind and a room of two: one size
  const office = await room(page, 'office').boundingBox();
  const living = await room(page, 'living room').boundingBox();
  expect(living?.height).toBe(office?.height);
  expect(living?.width).toBe(office?.width);
});

test('moves a blind, sends one to a position and moves a room, reading the blinds back', async ({
  page,
}) => {
  await page.goto('/blinds');
  const office = room(page, 'office');
  const window = office.locator('[data-blind="1"]');

  await window.getByRole('button', { name: 'Close Office window blinds' }).click();
  await expect(window.getByTestId('blind-position')).toContainText('0 %');

  await window.getByTestId('blind-position').click();
  await page.getByRole('menuitem', { name: '75 %' }).click();
  await expect(window.getByTestId('blind-position')).toContainText('75 %');

  await office.getByRole('button', { name: 'Open every blind of office' }).click();
  await expect(office.getByTestId('blind-position')).toContainText(['100 %', '100 %']);
  await expect(office.getByTestId('room-status')).toHaveText('');
});

test('opens and closes every blind of the house', async ({ page }) => {
  await page.goto('/blinds');
  const house = page.getByTestId('house');

  await expect(house).toContainText('Blinds: 4 in rooms: 3');
  await house.getByRole('button', { name: 'Close every blind of the house' }).click();
  await expect(
    room(page, 'office').locator('[data-blind="2"] [data-testid="blind-position"]'),
  ).toContainText('0 %');
  await expect(
    room(page, 'living room').locator('[data-blind="7"] [data-testid="blind-position"]'),
  ).toHaveText('closed');
  await expect(house.getByTestId('house-status')).toHaveText('');
});

// no optimistic state: what the page shows is what the service answers after the command
test('tells a command that failed and leaves the blind as the service says', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/blinds');
  const office = room(page, 'office');

  await office.getByRole('button', { name: 'Close Office window blinds' }).click();

  await expect(office.getByTestId('room-status')).toContainText('Window:');
  await expect(office.locator('[data-blind="1"] [data-testid="blind-position"]')).toContainText(
    '40 %',
  );
});

test('shows the schedules of a room in a window, and switches one off', async ({ page }) => {
  await page.goto('/blinds');
  await expect(room(page, 'office').getByTestId('room-schedules')).toContainText('Schedules: 2');
  const window = await openSchedules(page, 'office');
  const morning = window.locator('[data-testid="schedule"][data-schedule="1"]');

  await expect(window.getByTestId('schedule')).toHaveCount(2);
  await expect(morning.getByTestId('schedule-today')).toContainText('06:30–08:12');
  await expect(morning.getByTestId('schedule-decision')).toHaveText('ran today');
  await expect(morning.getByTestId('schedule-condition')).toContainText('Illuminance > 50 lx');
  await expect(morning.getByTestId('schedule-target')).toHaveCount(2);

  const enabled = morning.getByTestId('schedule-enabled').getByRole('switch');
  await expect(enabled).toHaveAttribute('aria-checked', 'true');
  await enabled.click();
  await expect(enabled).toHaveAttribute('aria-checked', 'false');
  await expect(morning.getByTestId('schedule-decision')).toHaveText('switched off');
});

test('pauses the schedules of a blind from the window of its room', async ({ page }) => {
  await page.goto('/blinds');
  const window = await openSchedules(page, 'office');
  const pause = window.locator('[data-blind="1"]').getByRole('switch');

  await expect(pause).toHaveAttribute('aria-checked', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-checked', 'true');
  await expect(window.locator('[data-blind="1"]').getByTestId('pause-since')).toContainText(
    'Paused',
  );
  await window.getByRole('button', { name: 'Close' }).click();
  // the same pause, marked on the card
  await expect(
    room(page, 'office').locator('[data-blind="1"]').getByTestId('blind-paused'),
  ).toBeVisible();
});

// the holidays of the coming 60 days: a holiday on a Sunday is a weekend anyway and not listed
test('lists the holidays on weekdays of the coming days', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await page.goto('/blinds');

  const holidays = page.getByTestId('holidays');
  await expect(holidays.getByTestId('holiday')).toHaveCount(1);
  await expect(holidays.getByTestId('holiday')).toHaveAttribute('data-date', '2026-11-11');
  await expect(holidays.getByTestId('holiday')).toContainText('Independence Day');
});
