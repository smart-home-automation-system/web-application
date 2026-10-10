import { expect, onAnIPhone, test, useScenario } from './support';

/**
 * The application as something installed on a phone: the personal link as the page it is added
 * to the home screen from, and what it says when the house cannot be reached. The service
 * worker itself exists in a production build only and is tested on the container image
 * (`image.spec.ts`).
 */

test.describe('the personal link on an iPhone', () => {
  test.use({ profile: 'none' });

  test('stays under its own address in a tab and shows how to add it to the home screen', async ({
    page,
  }) => {
    await onAnIPhone(page, 'in a tab');

    await page.goto('/u/Borys');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Add to the Home Screen' }),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'How to add it' }).getByRole('listitem'),
    ).toHaveText([
      /Tap the Share button of the browser/,
      /Choose "Add to Home Screen"/,
      /Tap "Add"/,
    ]);
    // the icon opens the address it was added from: it has to be the link, not the room
    await expect(page).toHaveURL(/\/u\/Borys$/);
    // ...and the profile is open already: the name is in the panel
    await expect(page.locator('.shell__profile')).toContainText('Borys');
  });

  test('goes on to the application for whoever stays in the browser', async ({ page }) => {
    await onAnIPhone(page, 'in a tab');
    await page.goto('/u/Borys');

    await page.getByRole('link', { name: 'Continue in the browser' }).click();

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
  });

  test('opens the room straight away when started from the home screen', async ({ page }) => {
    await onAnIPhone(page, 'from the home screen');

    await page.goto('/u/Borys');

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
  });

  test('says nothing about the home screen in any other browser', async ({ page }) => {
    await page.goto('/u/Borys');

    await expect(page).toHaveURL(/\/room$/);
  });
});

test.describe('the installed application of a resident, away from the house', () => {
  test.use({ profile: 'resident' });

  // the icon starts from the personal link every time: outside the house it must neither wait
  // for the registry nor end on "the profile could not be opened"
  test('starts as its member and says that the house cannot be reached', async ({ page }) => {
    await onAnIPhone(page, 'from the home screen');
    await useScenario(page, 'offline');

    await page.goto('/u/borys');

    await expect(page).toHaveURL(/\/room$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My room' })).toBeVisible();
    await expect(page.getByTestId('offline-notice')).toContainText('No connection to the house');
  });
});

test.describe('without a connection to the house', () => {
  test('says so above the page', async ({ page }) => {
    await useScenario(page, 'offline');

    await page.goto('/');

    const notice = page.getByTestId('offline-notice');
    await expect(notice).toContainText('No connection to the house. Check the Wi-Fi or VPN.');
    // the house never answered in this browser: there is no time to name
    await expect(notice).not.toContainText('Last contact');
  });

  test('names the time the house last answered, also after a restart', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Enabled')).toBeVisible();
    await expect(page.getByTestId('offline-notice')).toBeHidden();

    await page.evaluate(() => localStorage.setItem('mock-scenario', 'offline'));
    await page.reload();

    await expect(page.getByTestId('offline-notice')).toContainText(/Last contact: \d{2}:\d{2}/);
  });

  test('takes the banner away once the house answers again', async ({ page }) => {
    await useScenario(page, 'offline');
    await page.goto('/');
    const notice = page.getByTestId('offline-notice');
    await expect(notice).toBeVisible();

    // the connection is back; the scenario is read with every call
    await page.addInitScript(() => localStorage.removeItem('mock-scenario'));
    await page.evaluate(() => localStorage.removeItem('mock-scenario'));
    await notice.getByRole('button', { name: 'Try again' }).click();

    await expect(notice).toBeHidden();
  });

  test('speaks Polish', async ({ page }) => {
    await useScenario(page, 'offline');
    await page.addInitScript(() => localStorage.setItem('smart-home.language.Aurelia', 'pl'));

    await page.goto('/');

    await expect(page.getByTestId('offline-notice')).toContainText(
      'Brak połączenia z domem. Sprawdź Wi-Fi lub VPN.',
    );
    await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
  });

  // a service that fails has answered: the house is within reach, and the view says what failed
  test('does not mistake a failing service for a missing connection', async ({ page }) => {
    await useScenario(page, 'server-error');

    await page.goto('/');

    // every tile of the overview tells its own failure; none of them is the banner
    await expect(page.getByRole('alert').first()).toContainText('(error 502)');
    await expect(page.getByTestId('offline-notice')).toBeHidden();
  });
});
