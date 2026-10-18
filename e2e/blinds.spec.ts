import { Locator, Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The blinds page (HAS-252), fed by the mock API: the blinds of the mock house - which can be
 * moved and paused, a room at once too, in the memory of the page - its schedules, which can be
 * switched on and off, and the calendar with the holidays of a fixed date. Nothing here reaches a
 * real device.
 */
const room = (page: Page, name: string): Locator =>
  page.locator(`[data-testid="blind-room"][data-room="${name}"]`);
const schedule = (page: Page, id: number): Locator =>
  page.locator(`[data-testid="schedule"][data-schedule="${id}"]`);

test('shows every blind by room, the rooms in the order of the floors', async ({ page }) => {
  await page.goto('/blinds');

  await expect(page.getByRole('heading', { level: 1, name: 'Blinds' })).toBeVisible();
  await expect(page.getByTestId('blind-room')).toHaveCount(2);
  await expect(page.getByTestId('blind-room').first()).toHaveAttribute('data-room', 'living room');
  // the door first, then the windows; each by its short name
  const office = room(page, 'office');
  await expect(office.locator('.blind__name')).toHaveText(['Door', 'Window']);
  await expect(office.locator('[data-blind="1"] [data-testid="blind-position"]')).toHaveText(
    '40 %',
  );
  // an Eaton blind nothing was heard of: no position, no slider, not known - never closed
  const terrace = room(page, 'living room').locator('[data-blind="7"]');
  await expect(terrace.getByTestId('blind-position')).toHaveText('not known');
  await expect(terrace.getByRole('slider')).toHaveCount(0);
});

test('moves a blind and a room, reading the blinds back', async ({ page }) => {
  await page.goto('/blinds');
  const office = room(page, 'office');
  const window = office.locator('[data-blind="1"]');

  await window.getByRole('button', { name: 'Close Office window blinds' }).click();
  await expect(window.getByTestId('blind-position')).toHaveText('0 %');
  await expect(window.getByTestId('blind-moved')).toContainText('from the dashboard');

  await office.getByRole('button', { name: 'Open every blind of office' }).click();
  await expect(office.getByTestId('blind-position')).toHaveText(['100 %', '100 %']);
  await expect(office.getByTestId('room-skipped')).toHaveCount(0);
});

// no optimistic state: what the page shows is what the service answers after the command
test('tells a command that failed and leaves the blind as the service says', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/blinds');
  const window = room(page, 'office').locator('[data-blind="1"]');

  await window.getByRole('button', { name: 'Close Office window blinds' }).click();

  await expect(window.getByRole('alert')).toContainText('The command was not confirmed');
  await expect(window.getByTestId('blind-position')).toHaveText('40 %');
});

test('lists the schedules with their day, and switches one off', async ({ page }) => {
  await page.goto('/blinds');
  const morning = schedule(page, 1);

  await expect(morning.getByTestId('schedule-today')).toContainText('06:30–08:12');
  await expect(morning.getByTestId('schedule-decision')).toHaveText('ran today');
  await expect(morning.getByTestId('schedule-condition')).toContainText('Illuminance > 50 lx');
  await expect(morning.getByTestId('schedule-target')).toHaveCount(2);
  await expect(schedule(page, 3).getByTestId('schedule-today')).toContainText('next day');

  const enabled = morning.getByTestId('schedule-enabled').getByRole('switch');
  await expect(enabled).toHaveAttribute('aria-checked', 'true');
  await enabled.click();
  await expect(enabled).toHaveAttribute('aria-checked', 'false');
  await expect(morning.getByTestId('schedule-decision')).toHaveText('switched off');
});

test('pauses the schedules of a blind from its schedule', async ({ page }) => {
  await page.goto('/blinds');
  const target = schedule(page, 2).getByTestId('schedule-target');
  const pause = target.getByRole('switch');

  await expect(pause).toHaveAttribute('aria-checked', 'false');
  await pause.click();
  await expect(pause).toHaveAttribute('aria-checked', 'true');
  // the same pause, told at the blind
  await expect(
    room(page, 'office').locator('[data-blind="1"]').getByTestId('blind-paused'),
  ).toContainText('Paused');
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
