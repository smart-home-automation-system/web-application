import { Page } from '@playwright/test';

import { expect, test } from './support';

/**
 * The pages of a member who is not the administrator (HAS-438, owner 2026-11-13): My room holds the
 * cards of a room, and what is the household's has pages of its own - the appliances, the requests, the
 * settings of this device, and the heating of the whole house for a member granted it. Fed by the mock
 * API; the mock household has Borys (a resident), Celina (two rooms and the switch of the house) and
 * Aurelia (the administrator).
 */

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
});

/** The entries of the navigation at the side - in the page on a phone too, where CSS hides it. */
const entries = (page: Page) => page.locator('.shell__side-nav .mat-mdc-list-item-title');

test.describe('a resident', () => {
  test.use({ profile: 'resident' });

  test('is offered their room, the appliances, the requests and the settings', async ({ page }) => {
    await page.goto('/room');

    await expect(entries(page)).toHaveText(['My room', 'Appliances', 'Requests', 'Settings']);
  });

  test('sees the appliances and their chores, and nothing that tunes them', async ({ page }) => {
    await page.goto('/appliances');

    await expect(page.getByRole('heading', { level: 1, name: 'Appliances' })).toBeVisible();
    await expect(page.getByTestId('appliances').getByRole('button')).toHaveText(['Emptied']);
    await expect(page.getByTestId('my-chores')).toContainText('Mine this month');
    await expect(page.getByTestId('house-counters')).toHaveCount(0);
    await expect(page.getByTestId('members-report')).toHaveCount(0);
  });

  test('writes and removes requests on a page of their own', async ({ page }) => {
    await page.goto('/requests');

    await expect(page.getByRole('heading', { level: 1, name: 'Requests' })).toBeVisible();
    // what Borys wrote for Aurelia, once the lists of the others are read
    await expect(
      page.getByTestId('written-requests').getByRole('button', { name: 'Remove the request' }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId('my-requests').getByRole('button', { name: 'Add' }),
    ).toBeVisible();
  });

  test('finds the notifications of this device and the appearance in the settings, not the palette', async ({
    page,
  }) => {
    await page.goto('/settings');

    await expect(
      page
        .getByTestId('device-notifications')
        .getByRole('switch', { name: 'Notify me on this device' }),
    ).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Light' })).toBeVisible();
    await expect(page.getByTestId('palette')).toHaveCount(0);
  });

  test('has every entry on the bottom bar of a phone, with no "More"', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/room');

    const bar = page.locator('.shell__bottom-nav');
    await expect(bar.getByRole('link')).toHaveCount(4);
    await expect(bar.getByRole('button', { name: 'More' })).toHaveCount(0);
  });
});

test.describe('a resident granted the switch of the house', () => {
  test.use({ profile: 'resident-two-rooms' });

  test('is offered the heating of the house as a fifth entry', async ({ page }) => {
    await page.goto('/room');

    await expect(entries(page)).toHaveText([
      'My room',
      'Appliances',
      'Requests',
      'House heating',
      'Settings',
    ]);
  });

  // the one member of the mock household the registry lets switch the heating
  test('switches the heating of the whole house on its own tab, after a question', async ({
    page,
  }) => {
    await page.goto('/house-heating');
    const card = page.getByTestId('heating-switch');

    await expect(page.getByRole('heading', { level: 1, name: 'House heating' })).toBeVisible();
    await expect(page.getByTestId('heating-state')).toContainText('Enabled');
    await card.getByRole('button', { name: 'Switch off' }).click();
    await card.getByRole('group').getByRole('button', { name: 'Switch off' }).click();

    await expect(page.getByTestId('heating-state')).toContainText('Disabled');
  });
});

test.describe('the administrator', () => {
  test('keeps what tunes the appliances, with the appliances and the chores on top', async ({
    page,
  }) => {
    await page.goto('/appliances');

    await expect(page.getByTestId('appliances')).toBeVisible();
    await expect(page.getByTestId('my-chores')).toBeVisible();
    await expect(page.getByTestId('house-counters')).toBeVisible();
  });

  test('keeps the palette in the settings', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByTestId('palette')).toBeVisible();
  });

  // not the role decides: the administrator switches the heating on its dashboard
  test('is not offered the heating of the house, nor led there', async ({ page }) => {
    await page.goto('/house-heating');

    await expect(page).toHaveURL(/\/room$/);
    await expect(entries(page).filter({ hasText: 'House heating' })).toHaveCount(0);
  });
});
