import { expect, test, useScenario } from './support';

/**
 * Not assertions but evidence: one picture per layout and colour scheme, written to
 * `test-results/screenshots/` and attached to the pull request.
 */
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`screenshots, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test('overview', async ({ page }, testInfo) => {
      await page.goto('/');
      await expect(page.getByText('Enabled')).toBeVisible();
      await page.screenshot({ path: shot(testInfo.project.name, scheme, 'overview') });
    });

    test('overview, backend unreachable', async ({ page }, testInfo) => {
      await useScenario(page, 'offline');
      await page.goto('/');
      await expect(page.getByRole('alert')).toBeVisible();
      await page.screenshot({ path: shot(testInfo.project.name, scheme, 'overview-offline') });
    });

    test('about', async ({ page }, testInfo) => {
      await page.goto('/about');
      await expect(page.getByTestId('app-version')).toBeVisible();
      await page.screenshot({ path: shot(testInfo.project.name, scheme, 'about') });
    });

    test('not found', async ({ page }, testInfo) => {
      await page.goto('/no/such/page');
      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await page.screenshot({ path: shot(testInfo.project.name, scheme, 'not-found') });
    });
  });
}

function shot(project: string, scheme: string, name: string): string {
  return `test-results/screenshots/${project}-${scheme}-${name}.png`;
}
