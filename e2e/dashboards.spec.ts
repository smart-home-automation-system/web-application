import { expect, test, useScenario } from './support';

/**
 * The hot water and the boiler room, fed by the mock API: what the pages show in the usual case,
 * just after a start of the services, and while a service fails.
 */
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

    const alerts = page.getByRole('alert');
    await expect(alerts).toHaveCount(2);
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
        'Hot water',
        'Boiler room',
        'My room',
        'More',
      ]);

      await bar.getByRole('link', { name: 'Boiler room' }).click();
      await expect(page).toHaveURL(/\/boiler$/);

      // what did not fit is one tap further
      await bar.getByRole('button', { name: 'More' }).click();
      await expect(page.getByRole('menuitem')).toHaveText([/Settings/, /About/]);
      await page.getByRole('menuitem', { name: 'About' }).click();

      await expect(page).toHaveURL(/\/about$/);
      await expect(bar.getByRole('button', { name: 'More' })).toHaveClass(
        /shell__bottom-link--active/,
      );
    } else {
      const side = page.locator('.shell__side-nav');
      await expect(side.getByRole('link')).toHaveText([
        /Overview/,
        /Hot water/,
        /Boiler room/,
        /My room/,
        /Settings/,
        /About/,
      ]);
      await expect(page.locator('.shell__bottom-more')).toBeHidden();

      await side.getByRole('link', { name: 'Hot water' }).click();

      await expect(page).toHaveURL(/\/water$/);
    }
  });
});
