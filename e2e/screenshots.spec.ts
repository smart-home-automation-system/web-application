import { Language, expect, screenshotPath, startIn, test, useScenario } from './support';

/**
 * Not assertions but evidence: one picture per layout, colour scheme and language, written to
 * `screenshots/` and attached to the pull request.
 */
const TEXTS = {
  en: {
    enabled: 'Enabled',
    notFound: 'Page not found',
    myRoom: 'My room',
    noProfile: 'This link does not open a profile',
    install: 'Add to the Home Screen',
    offline: 'No connection to the house',
  },
  pl: {
    enabled: 'Włączone',
    notFound: 'Nie znaleziono strony',
    myRoom: 'Mój pokój',
    noProfile: 'Ten link nie otwiera żadnego profilu',
    install: 'Dodaj do ekranu początkowego',
    offline: 'Brak połączenia z domem',
  },
} as const;

for (const language of ['en', 'pl'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`screenshots, ${language}, ${scheme}`, () => {
      test.use({ colorScheme: scheme });
      test.beforeEach(async ({ page }) => startIn(page, language));

      test('overview', async ({ page }, testInfo) => {
        await page.goto('/');
        await expect(page.getByText(TEXTS[language].enabled)).toBeVisible();
        await page.screenshot({ path: shot(testInfo.project.name, scheme, language, 'overview') });
      });

      test('overview, backend unreachable', async ({ page }, testInfo) => {
        await useScenario(page, 'offline');
        await page.goto('/');
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page.getByTestId('offline-notice')).toContainText(TEXTS[language].offline);
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'overview-offline'),
        });
      });

      // the banner with the time of the last answer: the house answered, then the connection went
      test('overview, connection lost', async ({ page }, testInfo) => {
        await page.goto('/');
        await expect(page.getByText(TEXTS[language].enabled)).toBeVisible();
        await page.evaluate(() => localStorage.setItem('mock-scenario', 'offline'));
        await page.reload();
        await expect(page.getByTestId('offline-notice')).toContainText(/\d{2}:\d{2}/);
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'overview-connection-lost'),
        });
      });

      test('about', async ({ page }, testInfo) => {
        await page.goto('/about');
        await expect(page.getByTestId('app-version')).toBeVisible();
        await page.screenshot({ path: shot(testInfo.project.name, scheme, language, 'about') });
      });

      test('settings', async ({ page }, testInfo) => {
        await page.goto('/settings');
        await expect(page.getByTestId('palette')).toBeVisible();
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'settings'),
          fullPage: true,
        });
      });

      test('not found', async ({ page }, testInfo) => {
        await page.goto('/no/such/page');
        await expect(page.getByRole('heading', { name: TEXTS[language].notFound })).toBeVisible();
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'not-found'),
        });
      });

      test.describe('without a profile', () => {
        test.use({ profile: 'none' });

        test('profile picker', async ({ page }, testInfo) => {
          await page.goto('/');
          await expect(page.getByRole('link', { name: /Aurelia/ })).toBeVisible();
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'profiles'),
          });
        });

        // what Safari on an iPhone shows; told by a property only its navigator has
        test('personal link, how to add it to the home screen', async ({ page }, testInfo) => {
          await page.addInitScript(() =>
            Object.defineProperty(Navigator.prototype, 'standalone', {
              value: false,
              configurable: true,
            }),
          );
          await page.goto('/u/Borys');
          await expect(page.getByRole('heading', { name: TEXTS[language].install })).toBeVisible();
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'install'),
          });
        });

        test('personal link that opens nobody', async ({ page }, testInfo) => {
          await page.goto('/u/nobody');
          await expect(
            page.getByRole('heading', { name: TEXTS[language].noProfile }),
          ).toBeVisible();
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'personal-link-unknown'),
          });
        });
      });

      test.describe('as a resident', () => {
        test.use({ profile: 'resident-two-rooms' });

        test('my room', async ({ page }, testInfo) => {
          await page.goto('/');
          await expect(page.getByRole('heading', { name: TEXTS[language].myRoom })).toBeVisible();
          await page.screenshot({ path: shot(testInfo.project.name, scheme, language, 'my-room') });
        });
      });

      test('language menu', async ({ page }, testInfo) => {
        await page.goto('/');
        await expect(page.getByText(TEXTS[language].enabled)).toBeVisible();
        await page.locator('.language-menu__trigger').click();
        await expect(page.getByRole('menuitemradio', { name: 'Polski' })).toBeVisible();
        // the menu fades in: wait until it is fully opaque
        await expect(page.locator('.mat-mdc-menu-panel')).toHaveCSS('opacity', '1');
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'language-menu'),
        });
      });
    });
  }
}

function shot(project: string, scheme: string, language: Language, name: string): string {
  return screenshotPath(project, `${scheme}-${language}-${name}`);
}
