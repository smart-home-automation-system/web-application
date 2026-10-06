import { Page } from '@playwright/test';

import { expect, startIn, test } from './support';

async function choose(page: Page, currentLabel: string, language: string): Promise<void> {
  await page.getByRole('button', { name: currentLabel }).click();
  await page.getByRole('menuitemradio', { name: language }).click();
}

test.describe('language', () => {
  test('is English on a first visit, whatever the language of the browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'pl-PL' });
    const page = await context.newPage();

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });

  test('switches the open page to Polish without reloading it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    // survives only as long as the document does: a reload or a navigation would lose it
    await page.evaluate(() => ((window as unknown as { marker: string }).marker = 'same page'));

    await choose(page, 'Change language', 'Polski');

    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();
    const tile = page.locator('mat-card', { hasText: 'Ogrzewanie' });
    await expect(tile.getByText('Włączone')).toBeVisible();
    // the date follows the language too: Polish month, 24-hour clock
    await expect(tile.getByText('Włączono: 28 wrz 2026, 06:45')).toBeVisible();
    await expect(tile.getByText(/^Zaktualizowano/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'O aplikacji' }).first()).toBeAttached();
    await expect(page).toHaveTitle('Przegląd · Smart Home');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByRole('button', { name: 'Zmień język' })).toContainText('PL');
    expect(await page.evaluate(() => (window as unknown as { marker: string }).marker)).toBe(
      'same page',
    );
  });

  test('keeps the choice after a reload, on every page', async ({ page }) => {
    await page.goto('/');
    await choose(page, 'Change language', 'Polski');
    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

    await page.goto('/about');

    await expect(page.getByRole('heading', { level: 1, name: 'O aplikacji' })).toBeVisible();
    await expect(page.getByText('build lokalny')).toBeVisible();
  });

  test('never shows English first when Polish was chosen', async ({ page }) => {
    await startIn(page, 'pl');
    const headings: string[] = [];
    await page.exposeFunction('reportHeading', (text: string) => headings.push(text));
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const heading = document.querySelector('h1')?.textContent?.trim();
        if (heading) {
          void (window as unknown as { reportHeading(text: string): Promise<void> }).reportHeading(
            heading,
          );
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Przegląd' })).toBeVisible();

    expect([...new Set(headings)]).toEqual(['Przegląd']);
  });

  test('switches back to English', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'O aplikacji' })).toBeVisible();

    await choose(page, 'Zmień język', 'English');

    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
    await expect(page).toHaveTitle('About · Smart Home');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  });

  test('marks the active language in the menu and names each in its own words', async ({
    page,
  }) => {
    await startIn(page, 'pl');
    await page.goto('/');

    await page.getByRole('button', { name: 'Zmień język' }).click();

    await expect(page.getByRole('menuitemradio', { name: 'Polski' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('translates the error pages and the failure of the backend', async ({ page }) => {
    await startIn(page, 'pl');
    await page.addInitScript(() => localStorage.setItem('mock-scenario', 'offline'));

    await page.goto('/');

    await expect(page.getByRole('alert')).toContainText('Nie można połączyć się z serwerem');
    await expect(page.getByText('Brak danych')).toBeVisible();

    await page.goto('/no/such/page');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Nie znaleziono strony' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Przejdź do przeglądu' }).click();
    await expect(page).toHaveURL(/\/overview$/);
  });

  test('falls back to English when the stored choice is not a language', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('smart-home.language', 'klingon'));

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  });
});
