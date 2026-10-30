import { expect, test, useScenario } from './support';

/**
 * The heating, the hot water and the boiler room, fed by the mock API: what the pages show in
 * the usual case, just after a start of the services, and while a service fails. The switch of
 * the heating is pressed here and nowhere else - the mock house is the only one a test may
 * switch.
 */
test.describe('heating', () => {
  test('shows the switch, whether rooms are heated and the sensors, the silent ones first', async ({
    page,
  }) => {
    await page.goto('/heating');

    await expect(page.getByRole('heading', { level: 1, name: 'Heating' })).toBeVisible();
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    await expect(page.getByTestId('heating-switch')).toContainText(
      'Switched on: 28 Sept 2026, 06:45',
    );
    await expect(page.getByTestId('activity')).toContainText('Rooms are being heated');

    const card = page.getByTestId('sensors');
    await expect(card.getByTestId('sensor-summary')).toContainText('Silent: 2 of 8');
    // a red light by the title while a sensor is silent; the list is in a window
    await expect(card.getByTestId('sensors-signal')).toHaveAttribute(
      'aria-label',
      'Silent sensors: 2 of 8.',
    );
    await expect(card.getByRole('table')).toHaveCount(0);
    await card.getByRole('button', { name: 'Details' }).click();
    const sensors = page.getByRole('dialog');
    await expect(sensors.getByRole('rowheader')).toHaveText([
      'bathroom down',
      'garden',
      'office',
      'living room',
      'bedroom',
      'wardrobe',
      'bathroom up',
      'loft',
    ]);
    // the mock dates the readings from the call, on the clock of the house - the ages must come
    // out the same in whatever zone this browser runs
    await expect(sensors.getByRole('row', { name: /bathroom down/ })).toContainText('3 days ago');
    await expect(sensors.getByRole('row', { name: /bathroom down/ })).toContainText('Silent');
    await expect(sensors.getByRole('row', { name: /garden/ })).toContainText('Muted');
    await expect(sensors.getByRole('row', { name: /office/ })).toContainText('2 min ago');
    await expect(sensors.getByRole('row', { name: /office/ })).toContainText('Reporting');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('asks before it switches the heating off, and shows what the house then says', async ({
    page,
  }) => {
    await page.goto('/heating');
    const card = page.getByTestId('heating-switch');

    await card.getByRole('button', { name: 'Switch off' }).click();

    const question = card.getByRole('group', {
      name: 'Switch the heating of the whole house off?',
    });
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
    // nothing has been sent yet
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');

    await question.getByRole('button', { name: 'Switch off' }).click();

    await expect(page.getByTestId('heating-state')).toContainText('Disabled');
    // the card next to it is asked again at once, not at its next turn half a minute later
    await expect(page.getByTestId('activity')).toContainText('No room is being heated');
    await expect(card).toContainText('Switched off:');
    await expect(question).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Switch on' })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('switches nothing when the question is answered with "Cancel"', async ({ page }) => {
    await page.goto('/heating');
    const card = page.getByTestId('heating-switch');
    await card.getByRole('button', { name: 'Switch off' }).click();

    await card.getByRole('button', { name: 'Cancel' }).click();

    await expect(card.getByRole('group')).toHaveCount(0);
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    await expect(card.getByRole('button', { name: 'Switch off' })).toBeFocused();
    // a reload is the mock house as it started: had anything been sent, this would still say so
    await expect(card).toContainText('Switched on: 28 Sept 2026, 06:45');
  });

  // the house did not carry the change out: the page says so and stays with what the house says
  test('reports a switch that failed and returns to the state of the house', async ({ page }) => {
    await useScenario(page, 'writes-fail');
    await page.goto('/heating');
    const card = page.getByTestId('heating-switch');

    await card.getByRole('button', { name: 'Switch off' }).click();
    await card.getByRole('group').getByRole('button', { name: 'Switch off' }).click();

    await expect(card.getByRole('alert')).toContainText(
      'The heating could not be switched off. The service is not available right now (error 500).',
    );
    await expect(page.getByText('Mock scenario')).toHaveCount(0);
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    // and it can be tried again
    await expect(card.getByRole('button', { name: 'Switch off' })).toBeEnabled();
    await expect(page.getByTestId('offline-notice')).toBeHidden();
  });

  test.describe('the rooms', () => {
    // Thursday 8 October 2026, 14:30 on the clocks of the house: what a schedule asks for
    // depends on the day and the hour
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
    });

    test('shows every room on its floor, with its temperature, target and heaters', async ({
      page,
    }) => {
      await page.goto('/heating');
      const rooms = page.getByTestId('rooms');

      await expect(rooms.getByRole('heading', { level: 3 })).toHaveText([
        'Ground floor',
        'Upper floor',
        'Attic',
        'Outside',
      ]);
      await expect(rooms.locator('[data-room]')).toHaveCount(11);
      await expect(rooms.locator('[data-floor="upper"] [data-room]')).toHaveCount(5);

      const livingRoom = rooms.locator('[data-room="living room"]');
      await expect(livingRoom).toContainText('20.4 °C');
      await expect(livingRoom).toContainText('Measured 4 min ago');
      await expect(livingRoom).toContainText('Target 21.5 °C');
      await expect(livingRoom).toContainText('Radiator: heating');
      await expect(livingRoom).toContainText('Calls for heat');
      await expect(livingRoom).toContainText('Floor heating: off');

      // warm enough: the target stays on the card, and nothing calls for heat
      const office = rooms.locator('[data-room="office"]');
      await expect(office).toContainText('Target 20.5 °C');
      await expect(office).toContainText('Radiator: off');
      await expect(office).not.toContainText('Calls for heat');

      // a relay that has not answered is not "off"
      await expect(rooms.locator('[data-room="wardrobe"]')).toContainText(
        'Floor heating: no status yet',
      );
      await expect(rooms.locator('[data-room="bedroom"]')).toContainText('No schedule right now');
      await expect(rooms.locator('[data-room="sauna"]')).toContainText('No reading yet');
      await expect(rooms.locator('[data-room="garden"]')).toContainText('Measured 47 days ago');
      await expect(page.getByTestId('floor-pump')).toContainText('Running');
      await expect(page.getByTestId('floor-pump')).toContainText('Reported 2 min ago');
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    // HAS-353: the state of every room at a glance - the word, its icon and the edge in its colour
    test('tells the state of the heating of every room, and the light of its schedule', async ({
      page,
    }) => {
      await page.goto('/heating');
      const rooms = page.getByTestId('rooms');
      const state = (room: string) => rooms.locator(`[data-room="${room}"]`);

      const expected: Record<string, [string, string]> = {
        'living room': ['heating', 'Heating'],
        'bathroom up': ['heating', 'Heating'],
        tobi: ['waiting', 'Waiting for heat'],
        cinema: ['reached', 'Warm enough'],
        office: ['reached', 'Warm enough'],
        bedroom: ['held', 'Window open'],
        wardrobe: ['unknown', 'Not known'],
        'bathroom down': ['outside', 'No schedule now'],
        loft: ['noHeater', ''],
        sauna: ['noHeater', ''],
        garden: ['noHeater', ''],
      };
      for (const [room, [value, words]] of Object.entries(expected)) {
        await expect(state(room)).toHaveAttribute('data-heating-state', value);
        // the word follows the ligature of its icon; a room without a heater keeps the line empty
        await expect(state(room).getByTestId('room-state')).toHaveText(
          words === '' ? '' : new RegExp(`\\s${words}\\s*$`),
        );
      }

      // the light: a schedule covers the room now, none does, or nothing to tell without heaters
      await expect(state('office').getByTestId('schedule-led')).toHaveAttribute('data-led', 'on');
      await expect(state('bedroom').getByTestId('schedule-led')).toHaveAttribute('data-led', 'off');
      // the temperature marked by its distance to the target, never by the colour of its text
      await expect(state('tobi').getByTestId('room-temperature')).toHaveAttribute(
        'data-distance',
        'below',
      );
      await expect(state('office').getByTestId('room-temperature')).toHaveAttribute(
        'data-distance',
        'above',
      );
      await expect(page.getByTestId('heating-off')).toHaveCount(0);

      await state('office').getByTestId('schedule-led').hover();
      await expect(page.locator('.mat-mdc-tooltip-surface')).toHaveText(
        'A schedule covers the room now · 07:00–17:00 · 20.5 °C',
      );
    });

    // the switch of the house comes first: off, no room is heated whatever its schedule says
    test('makes every room with a heater neutral while the heating of the house is off', async ({
      page,
    }) => {
      await page.goto('/heating');
      const card = page.getByTestId('heating-switch');
      await card.getByRole('button', { name: 'Switch off' }).click();
      await card.getByRole('group').getByRole('button', { name: 'Switch off' }).click();

      const rooms = page.getByTestId('rooms');
      await expect(page.getByTestId('heating-off')).toContainText(
        'The heating of the house is switched off',
      );
      await expect(rooms.locator('[data-heating-state="systemOff"]')).toHaveCount(8);
      await expect(rooms.locator('[data-heating-state="noHeater"]')).toHaveCount(3);
      await expect(rooms.locator('[data-distance]')).toHaveCount(0);
    });

    test('opens the schedule of a room in a window, and closes it again', async ({ page }) => {
      await page.goto('/heating');
      const livingRoom = page.getByTestId('rooms').locator('[data-room="living room"]');

      await livingRoom.getByRole('button', { name: 'Schedule living room' }).click();

      const window = page.getByRole('dialog');
      await expect(window).toContainText('living room');
      await expect(window.getByTestId('schedule-read-only')).toBeVisible();
      // the week of each heater, then the history of the room
      await expect(window.getByRole('heading', { level: 3 })).toHaveText([
        'Radiator',
        'Floor heating',
      ]);
      await expect(window.getByRole('heading', { level: 4 })).toHaveText(['Temperature history']);
      // several periods a day, and other ones at the weekend
      const floor = window.locator('.schedule').nth(1);
      await expect(floor.locator('.week__day')).toHaveText([
        /Mon\s+06:00–08:00\s·\s21\s°C\s+15:00–22:00\s·\s21\.5\s°C/,
        /Tue/,
        /Wed/,
        /Thu\s+\(today\)\s+06:00–08:00\s·\s21\s°C\s+15:00–22:00\s·\s21\.5\s°C/,
        /Fri/,
        /Sat\s+08:00–22:30\s·\s21\.5\s°C/,
        /Sun\s+08:00–22:30\s·\s21\.5\s°C/,
      ]);
      await expect(floor.locator('.week__now')).toHaveCount(1);

      await window.getByRole('button', { name: 'Close' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // a heater without a schedule
      await page
        .getByTestId('rooms')
        .locator('[data-room="bathroom down"]')
        .getByRole('button', { name: /Schedule/ })
        .click();
      await expect(page.getByRole('dialog')).toContainText('No schedule.');
    });

    test('can be opened from the keyboard', async ({ page }) => {
      await page.goto('/heating');
      const button = page
        .getByTestId('rooms')
        .locator('[data-room="office"]')
        .getByRole('button', { name: /Schedule/ });

      await button.focus();
      await page.keyboard.press('Enter');

      await expect(page.getByRole('dialog')).toContainText('07:00–17:00 · 20.5 °C');
    });

    test('gives every room a tile of one size', async ({ page }) => {
      await page.goto('/heating');
      const tiles = page.getByTestId('room-tile');
      await expect(tiles).toHaveCount(11);

      const sizes = await tiles.evaluateAll((all) =>
        all.map((tile) => {
          const box = tile.getBoundingClientRect();
          return `${Math.round(box.width)}x${Math.round(box.height)}`;
        }),
      );

      expect(new Set(sizes).size).toBe(1);
    });

    // heating-service just after a start: it knows its rooms and schedules and nothing else
    test('claims nothing the service has not measured, heard or decided yet', async ({ page }) => {
      await useScenario(page, 'no-readings');

      await page.goto('/heating');
      const rooms = page.getByTestId('rooms');

      await expect(rooms.locator('[data-room]')).toHaveCount(11);
      await expect(rooms.getByText('No reading yet')).toHaveCount(11);
      await expect(rooms.getByTestId('room-temperature')).toHaveCount(0);
      await expect(rooms.locator('.heater[data-state="unknown"]')).toHaveCount(10);
      await expect(rooms.locator('.heater:not([data-state="unknown"])')).toHaveCount(0);
      await expect(rooms.locator('.heater .badge')).toHaveCount(0);
      // the one thing the service works out when asked
      await expect(rooms.locator('[data-room="office"]')).toContainText('Target 20.5 °C');
      await expect(page.getByTestId('floor-pump')).toContainText('No status yet');
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('fits a phone with the schedule of a room open, without horizontal scrolling', async ({
      page,
    }) => {
      await page.goto('/heating');
      const overflow = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
      expect(await overflow()).toBe(0);

      await page
        .getByTestId('rooms')
        .locator('[data-room="living room"]')
        .getByRole('button', { name: /Schedule/ })
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();

      expect(await overflow()).toBe(0);
    });

    test('speaks Polish, except for the identifiers of the rooms', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('smart-home.language.Aurelia', 'pl'));

      await page.goto('/heating');
      const livingRoom = page.getByTestId('rooms').locator('[data-room="living room"]');

      await expect(page.getByTestId('rooms').getByRole('heading', { level: 3 }).first()).toHaveText(
        'Parter',
      );
      await expect(livingRoom).toContainText('living room');
      await expect(livingRoom).toContainText('20,4 °C');
      await expect(livingRoom).toContainText('Cel 21,5 °C');
      await expect(livingRoom).toContainText('Grzejnik: grzeje');
      await expect(page.getByTestId('floor-pump')).toContainText('Pracuje');
    });
  });

  // a room that never reported is not in the answer of the service
  test('says that no sensor has reported yet just after the first start of the service', async ({
    page,
  }) => {
    await useScenario(page, 'no-readings');

    await page.goto('/heating');

    await expect(page.getByTestId('sensors')).toContainText('No sensor has reported yet.');
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  // five calls feed the page: each failure is told once, in the card of its call
  test('says in each card that the service is failing, and offers no switch', async ({ page }) => {
    await useScenario(page, 'server-error');

    await page.goto('/heating');

    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(5);
    for (const alert of await alerts.all()) {
      await expect(alert).toContainText('The service is not available right now (error 502).');
    }
    await expect(page.getByRole('main').getByRole('button', { name: /Switch/ })).toHaveCount(0);
    await expect(page.getByTestId('room-tile')).toHaveCount(0);
  });

  test('fits a phone without horizontal scrolling, the window of the sensors included', async ({
    page,
  }) => {
    await page.goto('/heating');
    await page.getByTestId('sensors-details').click();
    await expect(page.getByRole('table')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      card: (() => {
        const table = document.querySelector('app-sensors-dialog table')!;
        return table.scrollWidth - table.clientWidth;
      })(),
    }));

    expect(overflow).toEqual({ page: 0, card: 0 });
  });

  test('speaks Polish, except for the identifiers of the rooms', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('smart-home.language.Aurelia', 'pl'));

    await page.goto('/heating');

    await expect(page.getByRole('heading', { level: 1, name: 'Ogrzewanie' })).toBeVisible();
    const card = page.getByTestId('heating-switch');
    await expect(page.getByTestId('heating-state')).toContainText('Włączone');
    await card.getByRole('button', { name: 'Wyłącz' }).click();
    await expect(
      card.getByRole('group', { name: 'Wyłączyć ogrzewanie całego domu?' }),
    ).toBeVisible();
    await expect(page.getByTestId('sensor-summary')).toContainText('Milczy: 2 z 8');
    await page.getByRole('button', { name: 'Szczegóły' }).click();
    const row = page.getByRole('dialog').getByRole('row', { name: /bathroom down/ });
    await expect(row).toContainText('3 dni temu');
    await expect(row).toContainText('Milczy');
  });
});

test.describe('hot water', () => {
  test('shows both temperatures, the band on the gauge and that the water is warm enough', async ({
    page,
  }) => {
    await page.goto('/water');

    await expect(page.getByRole('heading', { level: 1, name: 'Hot water' })).toBeVisible();
    const temperatures = page.getByTestId('temperatures');
    await expect(page.getByTestId('tank')).toHaveText('40.6 °C');
    const gauge = temperatures.getByRole('meter');
    await expect(gauge).toHaveAttribute('aria-valuetext', '40.6 °C; kept between 38 and 42 °C');
    await expect(temperatures).toContainText(
      'Heated once it drops below 38 °C, until it is above 42 °C.',
    );
    await expect(page.getByTestId('circulation')).toContainText('29.8 °C');
    await expect(page.getByTestId('demand')).toContainText('Warm enough');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('draws the marker inside the band while the water is in it', async ({ page }) => {
    await page.goto('/water');
    const band = page.locator('.gauge__band');
    await expect(band).toBeVisible();

    const [bandBox, markerBox] = await Promise.all([
      band.boundingBox(),
      page.locator('.gauge__marker').boundingBox(),
    ]);
    const marker = markerBox!.x + markerBox!.width / 2;

    // 40.56 °C between 38 and 42
    expect(marker).toBeGreaterThan(bandBox!.x);
    expect(marker).toBeLessThan(bandBox!.x + bandBox!.width);
    expect(bandBox!.width).toBeGreaterThan(20);
  });

  // The owner's layout (2026-10-10): the tank on the left, the demand and under it the
  // circulation on the right, the two sides ending on one line.
  test('stands the circulation under the demand, level with the card of the tank', async ({
    page,
  }, testInfo) => {
    await page.goto('/water');
    await expect(page.getByTestId('circulation')).toContainText('29.8 °C');
    await expect(page.getByTestId('demand')).toContainText('Warm enough');

    const box = async (name: string) => (await page.getByTestId(name).boundingBox())!;
    const tank = await box('temperatures');
    const demand = await box('demand');
    const circulation = await box('circulation-card');

    expect(circulation.y).toBeGreaterThan(demand.y + demand.height);
    expect(Math.round(circulation.x)).toBe(Math.round(demand.x));
    if (testInfo.project.name === 'phone') {
      expect(demand.y).toBeGreaterThan(tank.y + tank.height);
    } else {
      expect(Math.round(demand.y)).toBe(Math.round(tank.y));
      expect(Math.round(circulation.y + circulation.height)).toBe(Math.round(tank.y + tank.height));
    }
  });

  // water-service answers 200 with no body until its first reading
  test('says that nothing was measured yet just after a start of the service', async ({ page }) => {
    await useScenario(page, 'no-readings');

    await page.goto('/water');

    for (const card of ['temperatures', 'circulation-card']) {
      await expect(page.getByTestId(card)).toContainText('No temperature has been measured yet.');
    }
    await expect(page.getByTestId('tank')).toHaveCount(0);
    await expect(page.getByTestId('circulation')).toHaveCount(0);
    await expect(page.getByRole('meter')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByTestId('offline-notice')).toBeHidden();
  });

  // two calls feed the page: each failure is told once, in the card of its call
  test('says in each card that the service is failing, without quoting it', async ({ page }) => {
    await useScenario(page, 'server-error');

    await page.goto('/water');

    // three calls - the temperatures, the demand and the history - in four cards: the tank and
    // the circulation come from one call and each tells its failure
    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(4);
    for (const alert of await alerts.all()) {
      await expect(alert).toContainText('The service is not available right now (error 502).');
    }
    await expect(page.getByText('Mock scenario')).toHaveCount(0);
    await expect(page.getByTestId('tank')).toHaveCount(0);
  });

  test('fits a phone without horizontal scrolling', async ({ page }) => {
    await page.goto('/water');
    await expect(page.getByTestId('tank')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });
});

test.describe('boiler room', () => {
  test('draws the furnace and its two pumps, with their state', async ({ page }) => {
    await page.goto('/boiler');

    await expect(page.getByRole('heading', { level: 1, name: 'Boiler room' })).toBeVisible();
    const schematic = page.getByRole('group', { name: 'Schematic of the boiler room' });
    await expect(schematic.getByRole('heading', { level: 3 })).toHaveText([
      'Furnace',
      'Hot-water pump',
      'Heating pump',
    ]);
    await expect(page.getByTestId('furnace')).toContainText('On');
    await expect(page.getByTestId('heating-pump')).toContainText('Running');
    await expect(page.getByTestId('hot-water-pump')).toContainText('Stopped');
  });

  test('shows the last note of the service about a device, and how long ago it was', async ({
    page,
  }) => {
    await page.goto('/boiler');

    const pump = page.getByTestId('heating-pump');
    await expect(pump.locator('.device__message')).toHaveText('Pump state changed to: true');
    // the mock dates it three minutes before the call, on the clock of the house - the age must
    // come out the same in whatever zone this browser runs
    await expect(pump.locator('.device__age')).toHaveText('3 min ago');
    await expect(page.getByTestId('furnace').locator('.device__age')).toHaveText(/sec ago$/);
  });

  test('draws a pipe in the colour of the boiler room only along a pump that runs', async ({
    page,
  }) => {
    await page.goto('/boiler');
    await expect(page.getByTestId('furnace')).toBeVisible();

    await expect(page.locator('.pipe--to-heating-pump')).toHaveClass(/pipe--flowing/);
    await expect(page.locator('.manifold__branch--down')).toHaveClass(/manifold--flowing/);
    await expect(page.locator('.pipe--to-hot-water-pump')).not.toHaveClass(/pipe--flowing/);
    await expect(page.locator('.manifold__branch--up')).not.toHaveClass(/manifold--flowing/);
  });

  test('lays the schematic out for the width of the screen', async ({ page }, testInfo) => {
    await page.goto('/boiler');
    const furnace = await page.getByTestId('furnace').boundingBox();
    const pump = await page.getByTestId('heating-pump').boundingBox();

    if (testInfo.project.name === 'phone') {
      // from top to bottom
      expect(pump!.y).toBeGreaterThan(furnace!.y + furnace!.height);
    } else {
      // from left to right
      expect(pump!.x).toBeGreaterThan(furnace!.x + furnace!.width);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  // The card is as wide as its place allows, up to what the schematic needs - whatever it holds.
  // Sized by its content it once was a strip of 172 px on a phone while it held a progress bar.
  test('keeps the width of its card whatever the card holds', async ({ page }, testInfo) => {
    const widths = async () => {
      const card = page.locator('.installation');
      await expect(card.locator('mat-progress-bar')).toHaveCount(0);
      return card.evaluate((element) => {
        // the scrolling area of the shell: the element of the page itself is an inline box
        const place = element.closest('main')!;
        const style = getComputedStyle(place);
        return {
          card: element.getBoundingClientRect().width,
          place: place.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        };
      });
    };

    await page.goto('/boiler');
    await expect(page.getByTestId('furnace')).toBeVisible();
    const drawn = await widths();

    // with nothing in it but the explanation of a failed call
    await page.evaluate(() => localStorage.setItem('mock-scenario', 'server-error'));
    await page.reload();
    await expect(page.locator('.installation').getByRole('alert')).toBeVisible();
    const failed = await widths();

    expect(failed.card).toBeCloseTo(drawn.card, 0);
    if (testInfo.project.name === 'phone') {
      // the whole width of the screen, like the cards of every other view
      expect(drawn.card).toBeCloseTo(drawn.place, 0);
    } else {
      // no wider than its boxes need: a wide screen is not filled with empty boxes
      expect(drawn.card).toBeLessThan(drawn.place - 100);
      expect(drawn.card).toBeGreaterThan(400);
    }
  });

  test('shows the devices as off, with nothing noted, just after a start of the service', async ({
    page,
  }) => {
    await useScenario(page, 'no-readings');

    await page.goto('/boiler');

    for (const device of ['furnace', 'hot-water-pump', 'heating-pump']) {
      await expect(page.getByTestId(device)).toHaveAttribute('data-state', 'off');
      await expect(page.getByTestId(device).locator('.device__message')).toHaveCount(0);
    }
    await expect(page.locator('.pipe--flowing')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('says that the service is failing in place of the schematic', async ({ page }) => {
    await useScenario(page, 'server-error');

    await page.goto('/boiler');

    await expect(page.getByRole('alert')).toContainText(
      'The service is not available right now (error 502).',
    );
    await expect(page.locator('.schematic')).toHaveCount(0);
  });

  test('speaks Polish, except for what the service said', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('smart-home.language.Aurelia', 'pl'));

    await page.goto('/boiler');

    await expect(page.getByRole('heading', { level: 1, name: 'Kotłownia' })).toBeVisible();
    const pump = page.getByTestId('heating-pump');
    await expect(pump).toContainText('Pompa ogrzewania');
    await expect(pump).toContainText('Pracuje');
    await expect(pump.locator('.device__message')).toHaveText('Pump state changed to: true');
    await expect(pump.locator('.device__age')).toHaveText('3 min temu');
  });
});

test.describe('the navigation with more destinations than a phone has room for', () => {
  test('reaches every page', async ({ page }, testInfo) => {
    await page.goto('/');

    if (testInfo.project.name === 'phone') {
      const bar = page.locator('.shell__bottom-nav');
      // the owner's order (2026-10-17, HAS-232): the overview, my room, the weather, the rooms
      await expect(bar.locator('.shell__bottom-label')).toHaveText([
        'Overview',
        'My room',
        'Weather',
        'Rooms',
        'More',
      ]);

      await bar.getByRole('link', { name: 'Rooms' }).click();
      await expect(page).toHaveURL(/\/rooms$/);

      // what did not fit is one tap further
      await bar.getByRole('button', { name: 'More' }).click();
      await expect(page.getByRole('menuitem')).toHaveText([
        /Blinds/,
        /Lights/,
        /Appliances/,
        /Heating/,
        /Hot water/,
        /Boiler room/,
        /Presence/,
        /Household/,
        /Devices/,
        /Settings/,
        /About/,
      ]);
      await page.getByRole('menuitem', { name: 'About' }).click();

      await expect(page).toHaveURL(/\/about$/);
      await expect(bar.getByRole('button', { name: 'More' })).toHaveClass(
        /shell__bottom-link--active/,
      );
    } else {
      const side = page.locator('.shell__side-nav');
      await expect(side.getByRole('link')).toHaveText([
        /Overview/,
        /My room/,
        /Weather/,
        /Rooms/,
        /Blinds/,
        /Lights/,
        /Appliances/,
        /Heating/,
        /Hot water/,
        /Boiler room/,
        /Presence/,
        /Household/,
        /Devices/,
        /Settings/,
        /About/,
      ]);
      await expect(page.locator('.shell__bottom-more')).toBeHidden();

      await side.getByRole('link', { name: 'Hot water' }).click();

      await expect(page).toHaveURL(/\/water$/);
    }
  });
});
