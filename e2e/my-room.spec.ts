import { expect, startIn, test, useScenario } from './support';

/**
 * "My room", the page of a household member, fed by the mock API: the rooms the registry gives
 * the profile, one at a time, read-only. The switch of the heating of the whole house is on the
 * page only for a member the registry granted it to. The mock household has a resident with
 * one room, one with two - the one who may switch the heating - and one with none.
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
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // residents view temperatures and schedules; setting them is the administrator's alone
  test('can press nothing about the room: no switch of the house, only "Emptied" and the notifications', async ({
    page,
  }) => {
    await page.goto('/room');
    await expect(page.getByTestId('room-temperature')).toBeVisible();

    const main = page.getByRole('main');
    await expect(page.getByTestId('heating-switch')).toHaveCount(0);
    // the controls of the page are not a room's: the finished dryer of the household (HAS-282),
    // the switch of the notifications of this device (HAS-284) and the form of the requests
    // (HAS-411: the text and "Add"; Borys has nothing waiting, so no line to tick off - but the
    // removal of what he wrote for Aurelia, once the lists of the others are read)
    await expect(
      page.getByTestId('written-requests').getByRole('button', { name: 'Remove the request' }),
    ).toHaveCount(1);
    await expect(main.locator('button, a, input, select, textarea')).toHaveCount(5);
    await expect(
      page.getByTestId('my-requests').locator('button, a, input, select, textarea'),
    ).toHaveCount(3);
    await expect(
      page
        .getByTestId('device-notifications')
        .getByRole('switch', { name: 'Notify me on this device' }),
    ).toBeVisible();
    await expect(page.getByTestId('appliances').getByRole('button')).toHaveText(['Emptied']);
    await expect(page.getByTestId('room-heating').locator('button, [tabindex]')).toHaveCount(0);
  });

  test('never reaches a page where a temperature or a schedule could be set', async ({ page }) => {
    // every page of the application but their own and the error page - the picker and an
    // address that leads nowhere included
    for (const path of [
      '/',
      '/overview',
      '/heating',
      '/water',
      '/boiler',
      '/presence',
      '/settings',
      '/about',
      '/profiles',
      '/no/such/page',
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/room$/);
    }
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
    // HAS-353: the open door holds the heating, and no schedule covers the room now
    await expect(room.getByTestId('room-state')).toHaveAttribute('data-heating-state', 'held');
    await expect(room.getByTestId('room-state')).toContainText('Window open');
    await expect(room.getByTestId('schedule-led')).toHaveAttribute('data-led', 'off');
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
    // so the state of the room is not known either, while its schedule covers it
    await expect(room.getByTestId('room-state')).toHaveAttribute('data-heating-state', 'unknown');
    await expect(room.getByTestId('schedule-led')).toHaveAttribute('data-led', 'on');
  });

  // the one member of the mock household the registry lets switch the heating
  test('has the switch of the heating of the whole house, and it asks before it acts', async ({
    page,
  }) => {
    await page.goto('/room');
    const card = page.getByTestId('heating-switch');

    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    await card.getByRole('button', { name: 'Switch off' }).click();
    await card.getByRole('group').getByRole('button', { name: 'Switch off' }).click();

    await expect(page.getByTestId('heating-state')).toContainText('Disabled');
    // still nothing to press in the room itself
    await expect(page.getByTestId('room-heating').locator('button, [tabindex]')).toHaveCount(0);
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

    // the switch of the house, the four cards of the room and the appliances: each tells its call -
    // the lights card two, its lights and its rule (HAS-268), the sensors card two, the registry and
    // the occupancy (HAS-369); the blinds, the lights, the sensors and the appliances are shown for the
    // failure - nobody knows then if there are any; so is the card of the chores of the member (HAS-346)
    // and that of the requests (HAS-411), and the air conditioning (HAS-394)
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(11);
    await expect(page.getByTestId('my-requests').getByRole('alert')).toHaveCount(1);
    await expect(page.getByTestId('room-sensors').getByRole('alert')).toHaveCount(2);
    await expect(page.getByTestId('my-chores').getByRole('alert')).toHaveCount(1);
    await expect(page.getByTestId('appliances').getByRole('alert')).toHaveCount(1);
    await expect(page.getByTestId('room-lights').getByRole('alert')).toHaveCount(2);
    for (const card of [
      'room-heating',
      'room-blinds',
      'room-sensors',
      'room-lights',
      'room-aircon',
    ]) {
      await expect(page.getByTestId(card).getByRole('alert').first()).toContainText(
        'The service is not available right now (error 502).',
      );
    }
    // nothing to press but the form of the requests, which writes for the household whatever the list
    await expect(page.getByRole('main').getByRole('button')).toHaveText(['add Add']);
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

  test('is told that none is assigned', async ({ page }) => {
    await page.goto('/room');

    await expect(page.getByTestId('no-rooms')).toContainText(
      'No room is assigned to your profile yet.',
    );
    await expect(page.getByTestId('room-heating')).toHaveCount(0);
    await expect(page.getByTestId('room-switcher')).toHaveCount(0);
    await expect(page.getByTestId('heating-switch')).toHaveCount(0);
    // the appliances are the household's, a room or none: the finished dryer is all there is to press,
    // and the form of the requests (HAS-411)
    await expect(page.getByRole('main').getByRole('button')).toHaveText(['Emptied', 'add Add']);
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

  // not the role decides: the administrator switches the heating on its dashboard
  test('has no switch of the heating here unless granted one', async ({ page }) => {
    await page.goto('/room');
    await expect(page.getByTestId('room-temperature')).toBeVisible();

    await expect(page.getByTestId('heating-switch')).toHaveCount(0);
  });
});

// HAS-254: the blinds of the room are the one thing on this page that can be pressed - for a
// member whose profile has the room, no permission needed - and the sensors are listed
// HAS-268: the lights of the room, pressable by the membership of the room
test.describe('the lights of the room', () => {
  test.describe('for a resident with a light in the room', () => {
    test.use({ profile: 'resident-two-rooms' });

    test('switches the light strip and sets its brightness, reading the lights back', async ({
      page,
    }) => {
      await page.goto('/room');
      const lights = page.getByTestId('room-lights');
      const strip = lights.locator('[data-light="13"]');

      // named without the room and the kind; nothing heard of it since the start of the service
      await expect(strip.locator('.light__name')).toHaveText('Light strip');
      await expect(strip.getByTestId('light-state')).toHaveText('not known yet');

      await strip.getByRole('button', { name: 'On Bedroom light strip' }).click();
      await expect(strip.getByTestId('light-state')).toContainText('on');

      await strip.getByTestId('brightness').fill('35');
      await strip.getByRole('button', { name: 'Set Brightness Bedroom light strip' }).click();
      await expect(strip.getByTestId('light-state')).toHaveText('on · 35 %');

      await lights.getByRole('button', { name: 'All off bedroom' }).click();
      await expect(strip.getByTestId('light-state')).toHaveText('off');
      // the bedroom has no rule: nothing to switch off, said so
      await expect(lights.getByTestId('room-rule')).toContainText('No rule');
      await expect(lights.getByTestId('rule-switch')).toHaveCount(0);
    });

    test('shows no card of lights for a room that has none', async ({ page }) => {
      await page.goto('/room');
      await expect(page.getByTestId('room-lights')).toBeVisible();

      await page.getByTestId('room-switcher').getByRole('radio', { name: 'wardrobe' }).click();
      await expect(page.getByTestId('room-temperature')).toBeVisible();
      await expect(page.getByTestId('room-lights')).toHaveCount(0);
    });

    test('tells a command that was not carried out and leaves the light as it is', async ({
      page,
    }) => {
      await useScenario(page, 'writes-fail');
      await page.goto('/room');
      const strip = page.getByTestId('room-lights').locator('[data-light="13"]');

      await strip.getByRole('button', { name: 'On Bedroom light strip' }).click();
      await expect(strip.getByTestId('light-failure')).toBeVisible();
      await expect(strip.getByTestId('light-state')).toHaveText('not known yet');
    });
  });

  test.describe('for a member with a rule in the room', () => {
    test.use({ profile: 'admin' });

    test('stops the automation of the room with the switch, which shows what is stored', async ({
      page,
    }) => {
      await page.goto('/room');
      const lights = page.getByTestId('room-lights');
      await expect(lights.getByTestId('room-rule')).toContainText('off 15 min after empty');
      await expect(lights.getByTestId('occupancy')).toContainText('Occupied');

      const automation = lights.getByTestId('rule-switch').getByRole('switch');
      await expect(automation).toHaveAttribute('aria-checked', 'true');
      await automation.click();
      await expect(automation).toHaveAttribute('aria-checked', 'false');

      await automation.click();
      await expect(automation).toHaveAttribute('aria-checked', 'true');
    });
  });
});

// HAS-394: the air conditioner of the room, pressable by the membership of the room
test.describe('the air conditioner of the room', () => {
  test.describe('for a resident with a unit in the room', () => {
    test.use({ profile: 'resident-two-rooms' });

    test('switches the unit held by the open window and raises its target, reading it back', async ({
      page,
    }) => {
      await page.goto('/room');
      const unit = page.getByTestId('room-aircon').locator('[data-unit="143"]');

      await expect(unit.getByTestId('aircon-state')).toHaveText('Off');
      await expect(unit.getByTestId('aircon-window-hold')).toContainText(
        'Stopped by the open window',
      );

      await unit.getByRole('button', { name: 'On Air conditioner' }).click();
      await expect(unit.getByTestId('aircon-state')).toHaveText('On · Cooling · 24 °C');
      await expect(unit.getByTestId('aircon-window-hold')).toHaveCount(0);

      await unit.getByRole('button', { name: 'Raise the target Air conditioner' }).click();
      await expect(unit.getByTestId('aircon-state')).toHaveText('On · Cooling · 25 °C');
    });

    test('shows no card for a room without a unit', async ({ page }) => {
      await page.goto('/room');
      await expect(page.getByTestId('room-aircon')).toBeVisible();

      await page.getByTestId('room-switcher').getByRole('radio', { name: 'wardrobe' }).click();
      await expect(page.getByTestId('room-temperature')).toBeVisible();
      await expect(page.getByTestId('room-aircon')).toHaveCount(0);
    });

    test('tells a command that was not carried out and leaves the unit as it is', async ({
      page,
    }) => {
      await useScenario(page, 'writes-fail');
      await page.goto('/room');
      const unit = page.getByTestId('room-aircon').locator('[data-unit="143"]');

      await unit.getByRole('button', { name: 'On Air conditioner' }).click();
      await expect(unit.getByTestId('aircon-failure')).toBeVisible();
      await expect(unit.getByTestId('aircon-state')).toHaveText('Off');
    });
  });
});

test.describe('the blinds and the sensors of the room', () => {
  test.describe('for a resident with blinds in the room', () => {
    test.use({ profile: 'resident-two-rooms' });

    test('moves a blind of the room and pauses its schedules, reading the blinds back', async ({
      page,
    }) => {
      await page.goto('/room');
      const blinds = page.getByTestId('room-blinds');
      const blind = blinds.locator('[data-blind="14"]');

      // named without the room and the kind: the one window of the bedroom
      await expect(blind.locator('.blind__name')).toHaveText('Window');
      await expect(blind.getByTestId('blind-position')).toHaveText('0 %');

      await blind.getByRole('button', { name: 'Open Bedroom window blinds' }).click();
      await expect(blind.getByTestId('blind-position')).toHaveText('100 %');

      const pause = blind.getByRole('switch');
      await expect(pause).toHaveAttribute('aria-checked', 'false');
      await pause.click();
      await expect(pause).toHaveAttribute('aria-checked', 'true');
      await expect(blind.getByTestId('blind-paused')).toContainText('Paused');
      // no schedules here: they are the administrator's, on the blinds page
      await expect(page.getByTestId('schedule')).toHaveCount(0);
    });

    test('shows no card of blinds for a room that has none', async ({ page }) => {
      await page.goto('/room');
      await expect(page.getByTestId('room-blinds')).toBeVisible();

      await page.getByTestId('room-switcher').getByRole('radio', { name: 'wardrobe' }).click();
      await expect(page.getByTestId('room-temperature')).toBeVisible();
      await expect(page.getByTestId('room-blinds')).toHaveCount(0);
    });

    test('tells a command that was not carried out and leaves the blind as it is', async ({
      page,
    }) => {
      await useScenario(page, 'writes-fail');
      await page.goto('/room');
      const blind = page.getByTestId('room-blinds').locator('[data-blind="14"]');

      await blind.getByRole('button', { name: 'Open Bedroom window blinds' }).click();
      await expect(blind.getByRole('alert')).toContainText('The command was not confirmed');
      await expect(blind.getByTestId('blind-position')).toHaveText('0 %');
    });
  });

  // HAS-369: what the sensors sense, from the occupancy of light-service
  test('tells the office occupied, the motion going on and when each sensor was heard', async ({
    page,
  }) => {
    await page.goto('/room');
    const sensors = page.getByTestId('room-sensors');
    await expect(sensors.getByTestId('sensors-occupancy')).toContainText('Occupied');
    await expect(sensors.getByTestId('motion-now')).toHaveText('motion now');
    await expect(sensors.getByTestId('sensors-occupancy')).toContainText('39 lx');
    await expect(sensors.getByTestId('sensor')).toHaveCount(2);
    for (const row of await sensors.getByTestId('sensor').all()) {
      await expect(row).toContainText('heard');
    }
  });

  test.describe('for a resident with a sensor and no blinds', () => {
    test.use({ profile: 'resident' });

    test('lists the sensor the lights service does not report, and shows no blinds', async ({
      page,
    }) => {
      await page.goto('/room');
      await expect(page.getByTestId('room-temperature')).toBeVisible();

      const sensors = page.getByTestId('room-sensors');
      await expect(sensors).toContainText('Presence');
      await expect(sensors.locator('.sensors__row')).toHaveCount(1);
      // HAS-369: the room has no lights, its occupancy is read all the same - and says nothing
      await expect(sensors.locator('.sensors__state')).toHaveText(
        'not reported by the lights service',
      );
      await expect(sensors.getByTestId('sensors-occupancy')).toHaveText('help Occupancy not known');
      await expect(page.getByTestId('room-blinds')).toHaveCount(0);
      await expect(page.getByTestId('room-lights')).toHaveCount(0);
      await expect(sensors.locator('button, [tabindex]')).toHaveCount(0);
    });
  });
});

// HAS-411: the household requests (database-service 0.22.0) - the list of the member, written for anybody
test.describe('the requests of the household', () => {
  test('lists what waits for the member, with who wrote it and whether the SMS went', async ({
    page,
  }) => {
    await page.goto('/room');
    const card = page.getByTestId('my-requests');

    await expect(card.getByText('Requests', { exact: true })).toBeVisible();
    const open = card.getByTestId('open-requests').getByRole('listitem');
    await expect(open).toHaveCount(2);
    await expect(open.first()).toContainText('Bread and milk');
    await expect(open.first()).toContainText('texted');
    await expect(open.nth(1)).toContainText('Batteries for the remote');
    await expect(open.nth(1)).toContainText('from Borys');
    await expect(open.nth(1)).toContainText('goes by SMS at 08:00');

    await card.getByTestId('done-toggle').click();
    await expect(card.getByTestId('done-requests')).toContainText('Take the parcel');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('ticks a request off and removes another, reading the list back', async ({ page }) => {
    await page.goto('/room');
    const card = page.getByTestId('my-requests');
    const open = card.getByTestId('open-requests').getByRole('listitem');
    await expect(open).toHaveCount(2);

    await open.filter({ hasText: 'Batteries' }).getByRole('button', { name: 'Done' }).click();
    await expect(open).toHaveCount(1);
    await card.getByTestId('done-toggle').click();
    await expect(card.getByTestId('done-requests')).toContainText('Batteries for the remote');

    await open.getByRole('button', { name: 'Remove the request' }).click();
    await expect(card.getByTestId('no-requests')).toHaveText('Nothing is waiting for you.');
  });

  test('writes a request for another member and one for oneself', async ({ page }) => {
    await page.goto('/room');
    const card = page.getByTestId('my-requests');
    await expect(card.getByTestId('open-requests').getByRole('listitem')).toHaveCount(2);

    // a blank text is refused before anything is sent
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.getByText('Write what is needed.')).toBeVisible();

    await card.getByRole('combobox', { name: 'For' }).click();
    await page.getByRole('option', { name: 'Borys' }).click();
    await card.getByLabel('What is needed').fill('Light bulbs');
    await card.getByLabel('What is needed').press('Enter');
    await expect(card.getByTestId('request-added')).toHaveText('Added to the list of Borys');
    await expect(card.getByLabel('What is needed')).toHaveValue('');
    await expect(card.getByTestId('open-requests').getByRole('listitem')).toHaveCount(2);
    // what was written for Borys shows at once in what Aurelia wrote for the others, on top
    const written = card.getByTestId('written-open').getByRole('listitem');
    await expect(written).toHaveCount(2);
    await expect(written.first()).toContainText('Light bulbs');
    await expect(written.first()).toContainText('for Borys');

    await card.getByRole('combobox', { name: 'For' }).click();
    await page.getByRole('option', { name: 'Aurelia' }).click();
    await card.getByLabel('What is needed').fill('Coffee');
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.getByTestId('open-requests').getByRole('listitem')).toHaveCount(3);
    await expect(card.getByTestId('open-requests')).toContainText('Coffee');
    await expect(written).toHaveCount(2);
  });

  test('shows what the member wrote for the others and removes one of them', async ({ page }) => {
    await page.goto('/room');
    const section = page.getByTestId('my-requests').getByTestId('written-requests');

    await expect(section.getByText('Written by you for the others')).toBeVisible();
    const written = section.getByTestId('written-open').getByRole('listitem');
    await expect(written).toHaveCount(1);
    await expect(written.first()).toContainText('Light bulbs for the hall');
    await expect(written.first()).toContainText('for Celina');
    await expect(written.first()).toContainText('goes by SMS at 08:00');

    await section.getByTestId('written-done-toggle').click();
    await expect(section.getByTestId('written-done')).toContainText('Stamps');
    await expect(section.getByTestId('written-done')).toContainText('by Celina');

    await written.getByRole('button', { name: 'Remove the request' }).click();
    await expect(section.getByTestId('written-none')).toHaveText(
      'Nothing you wrote for the others is waiting.',
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('reads in Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/room');
    const card = page.getByTestId('my-requests');

    await expect(card.getByText('Zapotrzebowania', { exact: true })).toBeVisible();
    await expect(card).toContainText('od: Borys');
    await expect(card).toContainText('pójdzie SMS-em o 8:00');
    await expect(card.getByText('Wpisane przez Ciebie dla innych')).toBeVisible();
    await expect(card).toContainText('dla: Celina');
  });
});
