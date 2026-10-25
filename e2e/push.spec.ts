import { Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The notifications of this device (HAS-284) on the fake Web Push of the mock build
 * (`src/mocks/mock-push.ts`): the dev server registers no service worker, so the browser is faked -
 * an installed application by default, `localStorage['mock-push']` for another one.
 */
async function asBrowser(
  page: Page,
  browser: 'unsupported' | 'iphone-tab' | 'denied',
): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('mock-push', value), browser);
}

test.describe('a resident', () => {
  test.use({ profile: 'resident' });

  test('switches the notifications of the device on, keeps them over a reload, and off again', async ({
    page,
  }) => {
    await page.goto('/room');
    const card = page.getByTestId('device-notifications');
    const toggle = card.getByRole('switch', { name: 'Notify me on this device' });
    await expect(toggle).not.toBeChecked();

    await toggle.click();
    await expect(toggle).toBeChecked();

    // checked again at the start: the subscription of the browser is stored anew
    await page.reload();
    await expect(page.getByTestId('device-notifications').getByRole('switch')).toBeChecked();

    await page.getByTestId('device-notifications').getByRole('switch').click();
    await expect(page.getByTestId('device-notifications').getByRole('switch')).not.toBeChecked();
  });

  // no optimistic state: on only once the registry stored it
  test('stays off when the registry did not store it, and says so', async ({ page }) => {
    await useScenario(page, 'writes-fail');
    await page.goto('/room');
    const card = page.getByTestId('device-notifications');

    await card.getByRole('switch').click();

    await expect(card.getByRole('alert')).toBeVisible();
    await expect(card.getByRole('switch')).not.toBeChecked();
  });

  // the icon opens the address it was added from: it has to be added from the personal link
  test('is led to the personal link from a tab of Safari on an iPhone', async ({ page }) => {
    await asBrowser(page, 'iphone-tab');
    await page.goto('/room');
    const card = page.getByTestId('device-notifications');

    await expect(card.getByRole('switch')).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Open my personal link' })).toHaveAttribute(
      'href',
      /\/u\/[^/]+$/,
    );
  });

  test('is told when the browser cannot show them, or when they are blocked', async ({ page }) => {
    await asBrowser(page, 'denied');
    await page.goto('/room');

    await expect(page.getByTestId('device-notifications')).toContainText(
      'Allow them in the settings of the device',
    );
    await expect(page.getByTestId('device-notifications').getByRole('switch')).toHaveCount(0);
  });

  test('is told that this browser takes no push', async ({ page }) => {
    await asBrowser(page, 'unsupported');
    await page.goto('/room');

    await expect(page.getByTestId('device-notifications')).toContainText(
      'This browser cannot show notifications of the application.',
    );
  });

  test('is told that the house sends none yet while it has no key', async ({ page }) => {
    await useScenario(page, 'no-readings');
    await page.goto('/room');
    const card = page.getByTestId('device-notifications');

    await card.getByRole('switch').click();

    await expect(card).toContainText('the server has no key for them');
  });
});

test.describe('the administrator', () => {
  test('finds the same switch on the settings', async ({ page }) => {
    await page.goto('/settings');

    await expect(
      page
        .getByTestId('device-notifications')
        .getByRole('switch', { name: 'Notify me on this device' }),
    ).toBeVisible();
  });
});
