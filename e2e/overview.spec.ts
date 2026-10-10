import { expect, startIn, test, useScenario } from './support';

/**
 * The overview: the house at a glance, a tile per dashboard, fed by the mock API. The switch of
 * the heating on it is the card of the heating page - pressed in `dashboards.spec`, not here.
 */
test.describe('overview', () => {
  test('shows the heating with its switch and a tile per dashboard', async ({ page }) => {
    await page.goto('/overview');

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    await expect(
      page.getByTestId('heating-switch').getByRole('button', { name: 'Switch off' }),
    ).toBeVisible();

    const rooms = page.getByTestId('tile-rooms');
    await expect(rooms).toContainText(/Rooms: \d+/);
    await expect(rooms).toContainText(/Being heated now: \d+/);
    await expect(rooms).toContainText('Coldest');
    await expect(rooms).toContainText('Warmest');

    // the two sensors of the mock house that fell silent, the muted one marked
    const sensors = page.getByTestId('tile-sensors');
    await expect(sensors.getByTestId('sensors-silent')).toContainText('Silent sensors: 2 of 8.');
    await expect(sensors).toContainText(/bathroom down\s+3 days ago/);
    await expect(sensors).toContainText(/garden\s+muted/);

    const water = page.getByTestId('tile-water');
    await expect(water).toContainText(/Tank\s+40\.6 °C/);
    await expect(water).toContainText(/Circulation\s+29\.8 °C/);
    await expect(water.getByTestId('water-measured')).toHaveText(/Measured 1 min\.? ago/);

    const boiler = page.getByTestId('tile-boiler');
    await expect(boiler).toContainText(/Furnace\s+On/);
    await expect(boiler).toContainText('Hot-water pump');
    await expect(boiler).toContainText('Heating pump');

    await expect(page.getByTestId('tile-presence')).toContainText(/At home|Away/);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  for (const [tile, name, address] of [
    ['tile-rooms', 'Rooms', '/heating'],
    ['tile-sensors', 'Temperature sensors', '/heating'],
    ['tile-water', 'Hot water', '/water'],
    ['tile-boiler', 'Boiler room', '/boiler'],
    ['tile-presence', 'At home now', '/presence'],
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
    await expect(page.getByTestId('tile-sensors')).toContainText('No sensor has reported yet.');
    const rooms = page.getByTestId('tile-rooms');
    await expect(rooms).toContainText('No room has a reading yet.');
    // no relay has answered: nothing is said about how many rooms are heated
    await expect(rooms.getByTestId('rooms-heating')).toHaveCount(0);
    await expect(page.getByTestId('tile-boiler')).not.toContainText('Running');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('tells the failure of every service in its own tile, and offers no switch', async ({
    page,
  }) => {
    await useScenario(page, 'server-error');
    await page.goto('/overview');

    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(6);
    for (const alert of await alerts.all()) {
      await expect(alert).toContainText('(error 502)');
    }
    for (const tile of ['tile-rooms', 'tile-sensors', 'tile-water', 'tile-boiler']) {
      await expect(page.getByTestId(tile).getByRole('alert')).toHaveCount(1);
    }
    await expect(
      page.getByTestId('heating-switch').getByRole('button', { name: /Switch/ }),
    ).toHaveCount(0);
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
    await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);

    const tops = await page
      .locator('.tiles > *')
      .evaluateAll((tiles) => tiles.map((tile) => Math.round(tile.getBoundingClientRect().top)));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
    expect(tops).toHaveLength(6);
    if (testInfo.project.name === 'phone') {
      expect(new Set(tops).size).toBe(6);
    } else {
      // at least two tiles share the first row
      expect(tops.filter((top) => top === tops[0]).length).toBeGreaterThan(1);
    }
  });

  test('speaks Polish, except for the identifiers of the rooms', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/overview');

    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();
    await expect(page.getByTestId('tile-water')).toContainText(/Zasobnik\s+40,6 °C/);
    await expect(page.getByTestId('tile-sensors')).toContainText('bathroom down');
    await expect(
      page.getByTestId('tile-boiler').getByRole('link', { name: 'Kotłownia' }),
    ).toBeVisible();
  });
});
