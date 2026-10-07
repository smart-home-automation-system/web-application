import { Language, expect, startIn, test, useScenario } from './support';

/**
 * Not assertions but evidence: one picture per layout, colour scheme and language, written to
 * `test-results/screenshots/` and attached to the pull request.
 */
const TEXTS = {
  en: { enabled: 'Enabled', notFound: 'Page not found' },
  pl: { enabled: 'Włączone', notFound: 'Nie znaleziono strony' },
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
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'overview-offline'),
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
  return `test-results/screenshots/${project}-${scheme}-${language}-${name}.png`;
}
