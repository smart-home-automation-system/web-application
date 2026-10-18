import { Locator, Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The editor of a schedule of the blinds (HAS-253), fed by the mock API: its schedules can be made,
 * changed and removed in the memory of the page, and it refuses what `blinds-service` refuses.
 * Nothing here reaches a real device.
 */
// a load of a page is the mock house as it started: after a change the page is left by its links
async function openRoomSchedules(page: Page, room: string, load = true): Promise<Locator> {
  if (load) {
    await page.goto('/blinds');
  }
  await page.locator(`[data-room="${room}"] [data-testid="room-schedules"]`).click();
  const window = page.getByRole('dialog');
  await expect(window).toBeVisible();
  return window;
}

const editor = (page: Page) => page.getByTestId('schedule-editor');

test('makes a schedule for a room, from the window of its schedules', async ({ page }) => {
  const window = await openRoomSchedules(page, 'office');
  await window.getByTestId('room-new-schedule').click();

  // the window goes with the link; the room is chosen already
  await expect(page).toHaveURL(/\/blinds\/schedules\/new\?room=office$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'New schedule' })).toBeVisible();
  await expect(editor(page).getByTestId('schedule-targets')).toContainText('Every blind of office');

  await editor(page).getByLabel('Name').fill('Evening dusk');
  await page.getByTestId('schedule-day-type').getByRole('radio', { name: 'Workdays' }).click();
  const from = page.getByTestId('schedule-from');
  await from.getByRole('radio', { name: 'Sunset' }).click();
  await from.getByLabel('Moved by').fill('-15');
  await from.getByLabel('At the earliest').fill('16:00');
  await page.getByTestId('schedule-to').getByLabel('Time').fill('23:00');
  await page.getByTestId('condition-add').click();
  await page.getByTestId('condition-operator').getByRole('radio', { name: 'below' }).click();
  await page.getByTestId('condition-threshold').fill('30');
  await page.getByTestId('condition-hold').fill('10');
  await page.getByTestId('schedule-action').getByRole('radio', { name: 'Close' }).click();
  await page.getByTestId('schedule-save').click();

  // read again at its own address, with what the engine makes of it today
  await expect(page).toHaveURL(/\/blinds\/schedules\/4$/);
  await expect(page.getByTestId('schedule-today-line')).toContainText('07:12–23:00');
  await expect(editor(page).getByLabel('Name')).toHaveValue('Evening dusk');
  await expect(page.getByTestId('schedule-from').getByLabel('Moved by')).toHaveValue('-15');
  await expect(page.getByTestId('condition-threshold')).toHaveValue('30');

  // and it moves the office now
  await page.getByTestId('schedule-back').click();
  const office = await openRoomSchedules(page, 'office', false);
  await expect(office.locator('[data-testid="schedule"][data-schedule="4"]')).toContainText(
    'Evening dusk',
  );
});

test('changes a schedule from its card, and shows it as the service stored it', async ({
  page,
}) => {
  const window = await openRoomSchedules(page, 'office');
  await window
    .locator('[data-testid="schedule"][data-schedule="2"]')
    .getByTestId('schedule-edit')
    .click();

  await expect(page).toHaveURL(/\/blinds\/schedules\/2$/);
  await expect(page.getByTestId('schedule-today-line')).toContainText('11:00–17:00');
  await expect(editor(page).getByLabel('Name')).toHaveValue('Summer shade');
  await expect(page.getByTestId('condition-row')).toHaveCount(2);

  await editor(page).getByLabel('Name').fill('Summer shade, west');
  await page.getByTestId('condition-remove').last().click();
  await page.getByTestId('schedule-targets').click();
  await page.getByRole('option', { name: 'Door' }).click();
  await page.keyboard.press('Escape');
  await page.getByTestId('schedule-save').click();

  await expect(page.getByTestId('schedule-saved')).toContainText('Saved');
  await expect(editor(page).getByLabel('Name')).toHaveValue('Summer shade, west');
  await expect(page.getByTestId('condition-row')).toHaveCount(1);
  await expect(page.getByTestId('schedule-targets')).toContainText(
    'Office window blinds, Office door blinds',
  );
});

test('removes a schedule after asking, and goes back to the blinds', async ({ page }) => {
  await page.goto('/blinds/schedules/3');
  await expect(editor(page).getByLabel('Name')).toHaveValue('Night close');

  await page.getByTestId('schedule-remove').click();
  await expect(page.getByTestId('remove-question')).toContainText('Remove this schedule for good?');
  await expect(page.getByTestId('schedule-remove-cancel')).toBeFocused();
  await page.getByTestId('schedule-remove-confirm').click();

  await expect(page).toHaveURL(/\/blinds$/);
  const living = await openRoomSchedules(page, 'living room', false);
  await expect(living.getByTestId('no-schedules')).toBeVisible();
});

test('refuses what the service would refuse, field by field, and sends nothing', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/home/blinds/schedules')) {
      writes.push(request.url());
    }
  });
  await page.goto('/blinds/schedules/new');
  await page.getByTestId('schedule-save').click();

  await expect(editor(page).locator('mat-error')).toHaveText([
    'Give the schedule a name.',
    'Give a time.',
    'Give a time.',
    'Choose at least one room or blind.',
  ]);
  await expect(editor(page).locator('.problem')).toHaveText([
    'Choose the days.',
    'Choose what the schedule does.',
  ]);

  await editor(page).getByLabel('Name').fill('ab');
  await page.getByTestId('schedule-from').getByLabel('Time').fill('07:00');
  await page.getByTestId('schedule-to').getByLabel('Time').fill('07:00');
  await page.getByTestId('condition-add').click();
  await page.getByTestId('condition-threshold').fill('250000');
  await page.getByTestId('schedule-save').click();

  await expect(editor(page).locator('mat-error')).toContainText([
    'A name has 3 to 60 characters.',
    'Outside what the weather station can report.',
  ]);
  await expect(page.getByTestId('window-problem')).toContainText('the window would be empty');
  expect(writes).toEqual([]);
});

test('keeps the form as entered when a save fails', async ({ page }) => {
  await useScenario(page, 'writes-fail');
  await page.goto('/blinds/schedules/1');
  await expect(editor(page).getByLabel('Name')).toHaveValue('Morning light');

  await editor(page).getByLabel('Name').fill('Morning light, later');
  await page.getByTestId('schedule-save').click();

  await expect(editor(page).getByRole('alert')).toContainText('The schedule was not saved.');
  await expect(editor(page).getByLabel('Name')).toHaveValue('Morning light, later');
  await expect(page.getByTestId('schedule-saved')).toHaveText('');
});
