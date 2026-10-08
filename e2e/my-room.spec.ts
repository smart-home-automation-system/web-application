import { expect, test, useScenario } from './support';

/**
 * "My room", the page of a household member, fed by the mock API: the rooms the registry gives
 * the profile, one at a time, read-only - and the switch of the heating of the whole house, the
 * one control of the page. The mock household has a resident with one room, one with two and
 * one with none.
 */

// Thursday 8 October 2026, 14:30 on the clocks of the house: what a schedule asks for, and which
// day is "today", depend on the day and the hour
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
});

test.describe('a resident with one room', () => {
  test.use({ profile: 'resident' });

  test('sees the room: its temperature and what the heating says about it', async ({ page }) => {
    await page.goto('/room');
    const room = page.getByTestId('room-heating');

    await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
    await expect(room).toContainText('loft');
    await expect(room.getByTestId('room-temperature')).toHaveText('20.2 °C');
    await expect(room).toContainText('Measured 6 min ago');
    await expect(room).toContainText('No heater');
    // one room: nothing to choose among
    await expect(page.getByTestId('room-switcher')).toHaveCount(0);
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // residents view temperatures and schedules; setting them is the administrator's alone
  test('can press nothing but the switch of the house', async ({ page }) => {
    await page.goto('/room');
    await expect(page.getByTestId('room-temperature')).toBeVisible();

    const main = page.getByRole('main');
    await expect(main.getByRole('button')).toHaveText([/Switch off/]);
    await expect(main.locator('a, input, select, textarea')).toHaveCount(0);
    await expect(page.getByTestId('room-heating').locator('button, [tabindex]')).toHaveCount(0);
  });

  test('never reaches a page where a temperature or a schedule could be set', async ({ page }) => {
    for (const path of ['/heating', '/settings', '/presence', '/water', '/boiler', '/']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/room$/);
    }
  });

  test('switches the heating of the house after the question, like the administrator', async ({
    page,
  }) => {
    await page.goto('/room');
    const card = page.getByTestId('heating-switch');

    await card.getByRole('button', { name: 'Switch off' }).click();
    await card.getByRole('group').getByRole('button', { name: 'Switch off' }).click();

    await expect(page.getByTestId('heating-state')).toContainText('Disabled');
  });

  test('fits a phone without horizontal scrolling', async ({ page }) => {
    await page.goto('/room');
    await expect(page.getByTestId('room-temperature')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });
});

test.describe('a resident with two rooms', () => {
  test.use({ profile: 'resident-two-rooms' });

  test('starts in the first and chooses the other, each with its own data', async ({ page }) => {
    await page.goto('/room');
    const switcher = page.getByTestId('room-switcher');
    const room = page.getByTestId('room-heating');

    await expect(switcher.getByRole('radio')).toHaveText(['bedroom', 'wardrobe']);
    await expect(switcher.getByRole('radio', { name: 'bedroom' })).toBeChecked();
    await expect(room.getByTestId('room-temperature')).toHaveText('19.6 °C');
    await expect(room.getByTestId('room-humidity')).toContainText('46 %');
    // 14:30: between the two periods of the bedroom
    await expect(room.getByTestId('room-target')).toContainText('No schedule right now');
    await expect(room).toContainText('Radiator: off');
    await expect(room.locator('.week__day')).toHaveText([
      /Thu\s+\(today\)\s+05:30–07:00\s·\s19\s°C\s+21:00–23:00\s·\s18\s°C/,
    ]);

    await switcher.getByRole('radio', { name: 'wardrobe' }).click();

    await expect(switcher.getByRole('radio', { name: 'wardrobe' })).toBeChecked();
    await expect(page.getByTestId('room-heating')).toHaveCount(1);
    await expect(room).toContainText('wardrobe');
    await expect(room.getByTestId('room-temperature')).toHaveText('20.9 °C');
    await expect(room.getByTestId('room-humidity')).toHaveCount(0);
    await expect(room.getByTestId('room-target')).toContainText('21.5 °C');
    // a relay that has not answered is not "off"
    await expect(room).toContainText('Floor heating: no status yet');
  });

  // heating-service just after a start: it knows its rooms and schedules and nothing else
  test('claims nothing the service has not measured, heard or decided yet', async ({ page }) => {
    await useScenario(page, 'no-readings');

    await page.goto('/room');
    const room = page.getByTestId('room-heating');

    await expect(room).toContainText('No reading yet');
    await expect(room.getByTestId('room-temperature')).toHaveCount(0);
    await expect(room.locator('.heater')).toHaveAttribute('data-state', 'unknown');
    await expect(room.locator('.badge')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('says in each card that the service is failing', async ({ page }) => {
    await useScenario(page, 'server-error');

    await page.goto('/room');

    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(2);
    await expect(page.getByTestId('room-heating').getByRole('alert')).toContainText(
      'The service is not available right now (error 502).',
    );
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
  });

  test('speaks Polish, except for the identifiers of the rooms', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('smart-home.language.Celina', 'pl'));

    await page.goto('/room');
    const room = page.getByTestId('room-heating');

    await expect(page.getByRole('heading', { level: 1, name: 'Mój pokój' })).toBeVisible();
    await expect(page.getByTestId('room-switcher').getByRole('radio')).toHaveText([
      'bedroom',
      'wardrobe',
    ]);
    await expect(room.getByTestId('room-temperature')).toHaveText('19,6 °C');
    await expect(room).toContainText('Wilgotność');
    await expect(room).toContainText('Harmonogram na dziś');
    await expect(room).toContainText('Grzejnik: nie grzeje');
  });
});

test.describe('a resident without a room', () => {
  test.use({ profile: 'resident-no-room' });

  test('is told that none is assigned, and still has the switch of the house', async ({ page }) => {
    await page.goto('/room');

    await expect(page.getByTestId('no-rooms')).toContainText(
      'No room is assigned to your profile yet.',
    );
    await expect(page.getByTestId('room-heating')).toHaveCount(0);
    await expect(page.getByTestId('room-switcher')).toHaveCount(0);
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
  });
});

test.describe('the administrator', () => {
  test('has a room of their own too, with the heaters and the schedule of today', async ({
    page,
  }) => {
    await page.goto('/room');
    await page.getByTestId('room-switcher').getByRole('radio', { name: 'living room' }).click();
    const room = page.getByTestId('room-heating');

    await expect(room.getByTestId('room-temperature')).toHaveText('20.4 °C');
    await expect(room.getByTestId('room-target')).toContainText('21.5 °C');
    await expect(room).toContainText('Radiator: heating');
    await expect(room.locator('.badge')).toHaveText(['Calls for heat']);
    await expect(room).toContainText('Floor heating: off');
    // a row per heater: today alone, with the line of now
    await expect(room.locator('.week__day')).toHaveCount(2);
    await expect(room.locator('.week__now')).toHaveCount(2);
  });
});
