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

    const sensors = page.getByTestId('sensors');
    await expect(sensors.getByTestId('sensor-summary')).toContainText('Silent sensors: 2 of 8.');
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
      await expect(rooms.locator('[data-room]')).toHaveCount(9);
      await expect(rooms.locator('[data-floor="upper"] [data-room]')).toHaveCount(4);

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

    test('opens a room into the week of its heaters, and closes it again', async ({ page }) => {
      await page.goto('/heating');
      const livingRoom = page.getByTestId('rooms').locator('[data-room="living room"]');
      const button = livingRoom.getByRole('button');

      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await button.click();

      await expect(button).toHaveAttribute('aria-expanded', 'true');
      const panel = livingRoom.getByTestId('room-panel');
      // the history of the room first, then the week of each heater
      await expect(panel.getByRole('heading', { level: 4 })).toHaveText([
        'Temperature history',
        'Radiator',
        'Floor heating',
      ]);
      // several periods a day, and other ones at the weekend
      const floor = panel.locator('.schedule').nth(1);
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

      // one room at a time
      await page
        .getByTestId('rooms')
        .locator('[data-room="bathroom down"]')
        .getByRole('button')
        .click();
      await expect(livingRoom.getByTestId('room-panel')).toHaveCount(0);
      // a heater without a schedule
      await expect(
        page.getByTestId('rooms').locator('[data-room="bathroom down"]').getByTestId('room-panel'),
      ).toContainText('No schedule.');

      await page
        .getByTestId('rooms')
        .locator('[data-room="bathroom down"]')
        .getByRole('button')
        .click();
      await expect(page.getByTestId('room-panel')).toHaveCount(0);
    });

    test('can be opened from the keyboard', async ({ page }) => {
      await page.goto('/heating');
      const button = page.getByTestId('rooms').locator('[data-room="office"]').getByRole('button');

      await button.focus();
      await page.keyboard.press('Enter');

      await expect(
        page.getByTestId('rooms').locator('[data-room="office"]').getByTestId('room-panel'),
      ).toContainText('07:00–17:00 · 20.5 °C');
    });

    // heating-service just after a start: it knows its rooms and schedules and nothing else
    test('claims nothing the service has not measured, heard or decided yet', async ({ page }) => {
      await useScenario(page, 'no-readings');

      await page.goto('/heating');
      const rooms = page.getByTestId('rooms');

      await expect(rooms.locator('[data-room]')).toHaveCount(9);
      await expect(rooms.getByText('No reading yet')).toHaveCount(9);
      await expect(rooms.getByTestId('room-temperature')).toHaveCount(0);
      await expect(rooms.locator('.heater[data-state="unknown"]')).toHaveCount(8);
      await expect(rooms.locator('.heater:not([data-state="unknown"])')).toHaveCount(0);
      await expect(rooms.locator('.heater .badge')).toHaveCount(0);
      // the one thing the service works out when asked
      await expect(rooms.locator('[data-room="office"]')).toContainText('Target 20.5 °C');
      await expect(page.getByTestId('floor-pump')).toContainText('No status yet');
      await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('fits a phone with a room open, without horizontal scrolling', async ({ page }) => {
      await page.goto('/heating');
      await page
        .getByTestId('rooms')
        .locator('[data-room="living room"]')
        .getByRole('button')
        .click();
      await expect(page.getByTestId('room-panel')).toBeVisible();

      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        card: (() => {
          const card = document.querySelector('[data-testid="rooms"]')!;
          return card.scrollWidth - card.clientWidth;
        })(),
      }));

      expect(overflow).toEqual({ page: 0, card: 0 });
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
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('fits a phone without horizontal scrolling, the table included', async ({ page }) => {
    await page.goto('/heating');
    await expect(page.getByRole('table')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      card: (() => {
        const card = document.querySelector('[data-testid="sensors"]')!;
        return card.scrollWidth - card.clientWidth;
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
    const row = page.getByRole('row', { name: /bathroom down/ });
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

  // water-service answers 200 with no body until its first reading
  test('says that nothing was measured yet just after a start of the service', async ({ page }) => {
    await useScenario(page, 'no-readings');

    await page.goto('/water');

    await expect(page.getByTestId('temperatures')).toContainText(
      'No temperature has been measured yet.',
    );
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

    // the temperatures, the demand and the history: three calls, three cards
    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(3);
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
      await expect(bar.locator('.shell__bottom-label')).toHaveText([
        'Overview',
        'Heating',
        'Hot water',
        'Boiler room',
        'More',
      ]);

      await bar.getByRole('link', { name: 'Boiler room' }).click();
      await expect(page).toHaveURL(/\/boiler$/);

      // what did not fit is one tap further
      await bar.getByRole('button', { name: 'More' }).click();
      await expect(page.getByRole('menuitem')).toHaveText([
        /Presence/,
        /My room/,
        /Household/,
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
        /Heating/,
        /Hot water/,
        /Boiler room/,
        /Presence/,
        /My room/,
        /Household/,
        /Settings/,
        /About/,
      ]);
      await expect(page.locator('.shell__bottom-more')).toBeHidden();

      await side.getByRole('link', { name: 'Hot water' }).click();

      await expect(page).toHaveURL(/\/water$/);
    }
  });
});
