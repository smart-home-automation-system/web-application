import { expect, test, useScenario } from './support';

/**
 * The appliances of the household (HAS-282), fed by the mock API: the washing machine runs, the
 * dryer has finished and waits to be emptied, the dishwasher is idle. The notice above every page,
 * the card of "My room" and the tile of the overview read one resource.
 */

test.describe('a resident', () => {
  test.use({ profile: 'resident' });

  test('is told above the page that the dryer has finished', async ({ page }) => {
    await page.goto('/room');

    const notice = page.getByTestId('appliance-notice');
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText('Finished: Dryer - waits to be emptied.');
    // the notice is no alert: many pages ask for the one alert they have
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('sees every appliance on My room, and empties the dryer from there', async ({ page }) => {
    await page.goto('/room');

    const card = page.getByTestId('appliances');
    await expect(card.locator('.appliance')).toHaveCount(3);
    await expect(card.locator('[data-appliance="61"]')).toContainText('Running since');
    await expect(card.locator('[data-appliance="63"]')).toContainText('Idle');
    await expect(card.getByRole('button')).toHaveText(['Emptied']);

    await card.getByRole('button', { name: 'Emptied' }).click();

    // read again, not assumed: the list the service answers next moves the card and the notice
    await expect(card.locator('[data-appliance="62"]')).toContainText('Idle');
    await expect(card.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('appliance-notice')).toHaveCount(0);
  });

  test('empties it from the notice on any page', async ({ page }) => {
    await page.goto('/room');
    const notice = page.getByTestId('appliance-notice');
    await expect(notice).toHaveCount(1);

    await notice.getByRole('button', { name: 'Emptied' }).click();

    await expect(notice).toHaveCount(0);
  });

  test('closes the notice for the visit without emptying anything', async ({ page }) => {
    await page.goto('/room');

    await page.getByRole('button', { name: 'Close the notice about Dryer' }).click();

    await expect(page.getByTestId('appliance-notice')).toHaveCount(0);
    // still waiting: the card says so, and still offers to empty it
    await expect(page.getByTestId('appliances').getByRole('button')).toHaveText(['Emptied']);
  });

  test('is told when the acknowledgement was not carried out', async ({ page }) => {
    await useScenario(page, 'writes-fail');
    await page.goto('/room');

    await page.getByTestId('appliances').getByRole('button', { name: 'Emptied' }).click();

    await expect(page.getByTestId('appliances').getByRole('alert')).toContainText(
      'Not marked as emptied.',
    );
    await expect(page.getByTestId('appliance-notice')).toHaveCount(1);
  });
});

test.describe('the administrator', () => {
  test('sees on the overview what runs and what waits, and can press nothing there', async ({
    page,
  }) => {
    await page.goto('/overview');

    const tile = page.getByTestId('tile-appliance');
    await expect(tile.locator('.tile__row')).toHaveText([
      /Running\s+Washing machine/,
      /Waits to be emptied\s+Dryer/,
    ]);
    // the title leads to the appliances page (HAS-283); nothing else to press
    await expect(tile.locator('button')).toHaveCount(0);
    await expect(tile.locator('a')).toHaveAttribute('href', '/appliances');
  });
});

// HAS-283: the appliances page of the administrator - the counters, the cycles of 7 or 30 days, the draw
test.describe('the appliances page', () => {
  test('lists the cycles of 7 or 30 days and draws the last 24 or 48 hours', async ({ page }) => {
    await page.goto('/appliances');

    const washer = page.getByTestId('appliance-61');
    await expect(washer.getByTestId('counters')).toContainText('30 days');
    const week = await washer.getByTestId('run').count();
    expect(week).toBeGreaterThan(0);

    await page.getByTestId('runs-period').getByRole('radio', { name: '30 days' }).click();
    await expect(async () => expect(await washer.getByTestId('run').count()).toBeGreaterThan(week)).toPass();

    const power = page.getByTestId('power-61');
    await expect(power.getByTestId('power-facts')).toContainText('Running above 20 W');
    await power.getByRole('radio', { name: '48 hours' }).click();
    await expect(power.getByRole('radio', { name: '48 hours' })).toBeChecked();
    await expect(power.getByTestId('power-facts')).toContainText('Drawn');
  });

  test.describe('for a resident', () => {
    test.use({ profile: 'resident' });

    // the administrator's page: a resident is led to their room
    test('is not open', async ({ page }) => {
      await page.goto('/appliances');
      await expect(page).toHaveURL(/\/room$/);
    });
  });
});

test.describe('nobody chosen yet', () => {
  test.use({ profile: 'none' });

  // the pages around the profiles do not ask for the appliances
  test('is told nothing about the appliances', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/home/appliance')) {
        asked.push(request.url());
      }
    });
    await page.goto('/profiles');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect(page.getByTestId('appliance-notice')).toHaveCount(0);
    expect(asked).toEqual([]);
  });
});
