import { Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/** The destinations of the navigation on screen: the side list, or the bottom bar of a phone. */
async function destinations(page: Page, project: string): Promise<string[]> {
  const links =
    project === 'phone'
      ? page.locator('.shell__bottom-nav .shell__bottom-label')
      : page.locator('.shell__side-nav .mat-mdc-list-item-title');
  return (await links.allTextContents()).map((text) => text.trim());
}

test.describe('without a profile', () => {
  test.use({ profile: 'none' });

  test('offers the active members of the household, whatever address was opened', async ({
    page,
  }, testInfo) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/profiles$/);
    await expect(page).toHaveTitle('Choose your profile · Smart Home');
    const members = page.getByRole('list', { name: 'Household members' }).getByRole('link');
    await expect(members).toHaveCount(4);
    await expect(members.nth(0)).toContainText('Aurelia');
    await expect(members.nth(0)).toContainText('Administrator');
    await expect(members.nth(1)).toContainText('Resident');
    // nothing to navigate to yet
    expect(await destinations(page, testInfo.project.name)).toEqual([]);
  });

  test('remembers the member chosen from the list', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /Borys/ }).click();

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.locator('.shell__profile')).toContainText('Borys');

    await page.reload();

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
  });

  test('opens the whole application from the link of the administrator', async ({
    page,
  }, testInfo) => {
    // typed by hand: the case of the name does not matter
    await page.goto('/u/aurelia');

    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    expect(await destinations(page, testInfo.project.name)).toEqual([
      'Overview',
      'My room',
      'Settings',
      'About',
    ]);
    await expect(page.locator('.shell__profile')).toContainText('Aurelia');
  });

  test('opens only their room from the link of a resident', async ({ page }, testInfo) => {
    await page.goto('/u/Borys');

    await expect(page).toHaveURL(/\/room$/);
    await expect(page).toHaveTitle('My room · Smart Home');
    await expect(page.getByRole('listitem').filter({ hasText: 'loft' })).toBeVisible();
    if (testInfo.project.name === 'phone') {
      // a bar with one destination leads nowhere
      await expect(page.locator('.shell__bottom-nav')).toHaveCount(0);
    } else {
      expect(await destinations(page, testInfo.project.name)).toEqual(['My room']);
    }
    // a resident is not offered other profiles
    await expect(page.getByRole('link', { name: /Switch profile/ })).toHaveCount(0);
  });

  // a member who is switched off is not in the answer of the registry: to the application they
  // are a name nobody answers to, like any other
  test('explains a link that opens nobody, and leads on', async ({ page }) => {
    await page.goto('/u/nobody');

    await expect(
      page.getByRole('heading', { level: 1, name: 'This link does not open a profile' }),
    ).toBeVisible();
    await expect(page.getByText('Ask the administrator for a current link.')).toBeVisible();

    await page.getByRole('link', { name: 'Go to the application' }).click();

    await expect(page).toHaveURL(/\/profiles$/);
  });

  test('explains that the registry cannot be reached, and opens the link once it can', async ({
    page,
  }) => {
    await useScenario(page, 'offline');
    await page.goto('/u/Borys');

    await expect(
      page.getByRole('heading', { level: 1, name: 'The profile could not be opened' }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('The server cannot be reached');

    await page.evaluate(() => localStorage.removeItem('mock-scenario'));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page).toHaveURL(/\/room$/);
  });

  test('explains that the list of members cannot be loaded, and loads it on request', async ({
    page,
  }) => {
    await useScenario(page, 'offline');
    await page.goto('/');

    await expect(page.getByRole('alert')).toContainText('The server cannot be reached');

    await page.evaluate(() => localStorage.removeItem('mock-scenario'));
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByRole('link', { name: /Aurelia/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test.describe('a resident', () => {
  test.use({ profile: 'resident' });

  // typed into the address bar: the navigation never offers these
  for (const address of ['/', '/overview', '/settings', '/about', '/profiles', '/no/such/page']) {
    test(`is led to their room from ${address}`, async ({ page }) => {
      await page.goto(address);

      await expect(page).toHaveURL(/\/room$/);
      await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
    });
  }

  test('stays themselves after a link that opens nobody', async ({ page }) => {
    await page.goto('/u/nobody');
    await expect(
      page.getByRole('heading', { level: 1, name: 'This link does not open a profile' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Go to the application' }).click();

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.locator('.shell__profile')).toContainText('Borys');
  });

  test('keeps their room while the backend is away', async ({ page }) => {
    await useScenario(page, 'offline');

    await page.goto('/');

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('listitem').filter({ hasText: 'loft' })).toBeVisible();
  });
});

test.describe('a resident with two rooms', () => {
  test.use({ profile: 'resident-two-rooms' });

  test('sees both, in the order of the registry', async ({ page }) => {
    await page.goto('/room');

    await expect(page.locator('.rooms__list li')).toHaveText(['bedroom', 'wardrobe']);
  });
});

test.describe('a resident without a room', () => {
  test.use({ profile: 'resident-no-room' });

  test('is told that none is assigned', async ({ page }) => {
    await page.goto('/room');

    await expect(page.getByText('No room is assigned to your profile yet.')).toBeVisible();
  });
});

test.describe('the administrator', () => {
  test('looks at the application as somebody else, and comes back by their own link', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /Switch profile/ }).click();
    await expect(page).toHaveURL(/\/profiles$/);
    await page.getByRole('link', { name: /Celina/ }).click();

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.locator('.shell__profile')).toContainText('Celina');

    await page.goto('/u/aurelia');

    await expect(page).toHaveURL(/\/overview$/);
  });

  test('keeps the language of each profile apart', async ({ page }) => {
    await page.goto('/about');
    await page.getByRole('button', { name: 'Change language' }).click();
    await page.getByRole('menuitemradio', { name: 'Polski' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'O aplikacji' })).toBeVisible();

    // somebody who never chose a language gets the one of the device: English
    await page.goto('/u/celina');
    await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();

    await page.goto('/u/aurelia');
    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();
  });
});

test.describe('a profile the registry no longer agrees with', () => {
  test.describe('no longer in the registry', () => {
    test.use({ profile: 'switched-off' });

    test('is forgotten: the application asks who is using it', async ({ page }) => {
      await page.goto('/room');

      await expect(page).toHaveURL(/\/profiles$/);
      await expect(page.getByRole('link', { name: /Aurelia/ })).toBeVisible();
    });
  });

  test.describe('remembered as administrator, a resident by now', () => {
    test.use({ profile: 'demoted' });

    test('leaves the page of the administrator it was opened on', async ({ page }) => {
      await page.goto('/settings');

      await expect(page).toHaveURL(/\/room$/);
      await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
    });
  });
});
