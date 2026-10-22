import { expect, startIn, test, useScenario } from './support';

/**
 * The overview: the house at a glance, a tile per dashboard, fed by the mock API. Nothing on it
 * changes the house: the switch of the heating is on the heating page only (HAS-266).
 */
test.describe('overview', () => {
  test('shows the heating and a tile per dashboard, and no switch', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

    // one tile for the heating (owner, 2026-10-21, HAS-266): the state, the rooms, the warning
    const heating = page.getByTestId('tile-heating');
    await expect(heating.getByTestId('heating-state')).toContainText('Enabled');
    await expect(heating).toContainText(/Rooms: \d+/);
    await expect(heating).toContainText(/Being heated now: \d+/);
    await expect(heating).toContainText('Coldest');
    await expect(heating).toContainText('Warmest');
    // the two sensors of the mock house that fell silent: counted here, named on the heating page
    await expect(heating.getByTestId('tile-signal')).toHaveAttribute(
      'aria-label',
      'Silent sensors: 2 of 8.',
    );
    await expect(heating).not.toContainText('muted');
    await expect(page.getByRole('main').getByRole('button', { name: /Switch/ })).toHaveCount(0);

    const water = page.getByTestId('tile-water');
    await expect(water).toContainText(/Tank\s+40\.6 °C/);
    await expect(water).toContainText(/Circulation\s+29\.8 °C/);
    await expect(water.getByTestId('water-measured')).toHaveText(/Measured 1 min\.? ago/);

    const boiler = page.getByTestId('tile-boiler');
    await expect(boiler).toContainText(/Furnace\s+On/);
    await expect(boiler).toContainText('Hot-water pump');
    await expect(boiler).toContainText('Heating pump');

    await expect(page.getByTestId('tile-presence')).toContainText(/At home|Away/);

    const weather = page.getByTestId('tile-weather');
    await expect(weather).toContainText(/Temperature\s+14\.3 °C/);
    await expect(weather).toContainText(/Dew point\s+7\.4 °C/);
    await expect(weather).toContainText(/Wind\s+2\.4 m\/s\s+gusts 3\.8 m\/s/);
    await expect(weather).toContainText(/Rain\s+None/);
    await expect(weather).toContainText(/Daylight\s+18,450 lx/);
    await expect(weather.getByTestId('weather-measured')).toHaveText(/Measured 1 min\.? ago/);

    // HAS-268: the lights counted, where one is on, and the empty house
    const lights = page.getByTestId('tile-light');
    await expect(lights).toContainText(/On\s+3/);
    // HAS-267: the hall down ceiling, off, came with the hall on an Eaton PIR only
    await expect(lights).toContainText(/Off\s+5/);
    await expect(lights).toContainText(/Not known\s+1/);
    await expect(lights.getByTestId('lit-rooms')).toHaveText('Lit in: living room, hall up');
    await expect(lights.getByTestId('empty-house')).toContainText('Somebody is at home');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  for (const [tile, name, address] of [
    ['tile-heating', 'Heating system', '/heating'],
    ['tile-water', 'Hot water', '/water'],
    ['tile-boiler', 'Boiler room', '/boiler'],
    ['tile-presence', 'At home now', '/presence'],
    ['tile-weather', 'Weather', '/weather'],
    ['tile-light', 'Lights', '/lights'],
  ] as const) {
    test(`leads from "${name}" to ${address}`, async ({ page }) => {
      await page.goto('/overview');

      await page.getByTestId(tile).getByRole('link', { name }).click();

      await expect(page).toHaveURL(new RegExp(`${address}$`));
    });
  }

  // the services have just started: nothing is measured, heard from a relay or observed yet
  test('claims nothing the services do not know yet', async ({ page }) => {
    await useScenario(page, 'no-readings');
    await page.goto('/overview');

    await expect(page.getByTestId('tile-water')).toContainText(
      'No temperature has been measured yet.',
    );
    const heating = page.getByTestId('tile-heating');
    // no sensor has reported: nothing is silent yet, so no warning
    await expect(heating.getByTestId('tile-signal')).toHaveCount(0);
    // no relay has answered: nothing is said about how many rooms are heated
    await expect(heating.getByTestId('rooms-heating')).toHaveCount(0);
    await expect(page.getByTestId('tile-boiler')).not.toContainText('Running');
    await expect(page.getByTestId('tile-weather')).toContainText(
      'No reading from the weather station yet.',
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('tells the failure of every service in its own tile, and offers no switch', async ({
    page,
  }) => {
    await useScenario(page, 'server-error');
    await page.goto('/overview');

    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(10);
    for (const alert of await alerts.all()) {
      await expect(alert).toContainText('(error 502)');
    }
    // the heating tile is three calls - the state, the rooms and the sensors - each one told;
    // the lights tile two - the lights and the empty house
    await expect(page.getByTestId('tile-heating').getByRole('alert')).toHaveCount(3);
    await expect(page.getByTestId('tile-light').getByRole('alert')).toHaveCount(2);
    for (const tile of ['tile-water', 'tile-boiler', 'tile-weather', 'tile-blinds']) {
      await expect(page.getByTestId(tile).getByRole('alert')).toHaveCount(1);
    }
    await expect(page.getByRole('main').getByRole('button', { name: /Switch/ })).toHaveCount(0);
    // a tile still leads to its dashboard
    await expect(
      page.getByTestId('tile-water').getByRole('link', { name: 'Hot water' }),
    ).toBeVisible();
  });

  // the tiles side by side on a wide screen, one under the other on a phone
  test('lays the tiles out for the width of the screen', async ({ page }, testInfo) => {
    await page.goto('/overview');
    // every tile has its answer: none is still a progress bar of another height
    await expect(page.getByTestId('tile-boiler')).toContainText('Furnace');
    await expect(page.getByTestId('tile-weather')).toContainText('Temperature');
    await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);

    const tops = await page
      .locator('.tiles > *')
      .evaluateAll((tiles) => tiles.map((tile) => Math.round(tile.getBoundingClientRect().top)));
    // the cards themselves, not the places they stand in
    const heights = await page
      .locator('.tiles mat-card')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
    expect(tops).toHaveLength(7);
    if (testInfo.project.name === 'phone') {
      expect(new Set(tops).size).toBe(7);
    } else {
      // at least two tiles share the first row
      expect(tops.filter((top) => top === tops[0]).length).toBeGreaterThan(1);
      // side by side the tiles are of one height, whatever each has to say (owner, 2026-10-10)
      expect(heights).toHaveLength(7);
      expect(new Set(heights).size).toBe(1);
    }
  });

  // a wide screen: the board in the middle, and a last row that is not full under the middle of
  // the row above, not against its left edge (owner, 2026-10-16)
  for (const width of [1440, 2560]) {
    test(`centres the board and its last row on a screen ${width} px wide`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name === 'phone', 'one column on a phone');
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/overview');
      // the page is there and every tile has its answer
      await expect(page.getByTestId('tile-weather')).toContainText('Temperature');
      await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);

      const boxes = await page.locator('.tiles > *').evaluateAll((tiles) =>
        tiles.map((tile) => {
          const box = tile.getBoundingClientRect();
          return { left: box.left, right: box.right, top: Math.round(box.top) };
        }),
      );
      const main = await page.getByRole('main').evaluate((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: box.left + parseFloat(style.paddingLeft),
          right: box.right - parseFloat(style.paddingRight),
        };
      });
      const rows = [...new Set(boxes.map((box) => box.top))].map((top) =>
        boxes.filter((box) => box.top === top),
      );
      const middle = (row: typeof boxes) => (row[0].left + row[row.length - 1].right) / 2;

      expect(rows.length).toBeGreaterThan(1);
      const last = rows[rows.length - 1];
      // seven tiles (HAS-268): on a screen with room for four the last row is short, in the middle
      expect(last.length).toBeLessThanOrEqual(rows[0].length);
      // the middle of every row is the middle of the page
      for (const row of rows) {
        expect(Math.abs(middle(row) - (main.left + main.right) / 2)).toBeLessThan(2);
      }
    });
  }

  test('speaks Polish, except for the identifiers of the rooms', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/overview');

    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();
    await expect(page.getByTestId('tile-water')).toContainText(/Zasobnik\s+40,6 °C/);
    await expect(page.getByTestId('tile-heating')).toContainText('Najchłodniejszy');
    await expect(page.getByTestId('tile-weather')).toContainText(
      /Wiatr\s+2,4 m\/s\s+porywy 3,8 m\/s/,
    );
    await expect(
      page.getByTestId('tile-boiler').getByRole('link', { name: 'Kotłownia' }),
    ).toBeVisible();
  });
});
