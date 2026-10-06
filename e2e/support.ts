import { Page, expect, test as base } from '@playwright/test';

export type MockScenario = 'default' | 'offline' | 'server-error';
export type Language = 'en' | 'pl';

/** Switches the mock API into a failure mode before the application starts. */
export async function useScenario(page: Page, scenario: MockScenario): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('mock-scenario', value), scenario);
}

/**
 * Starts the application in the language, as if it had been chosen on an earlier visit. Only
 * the first load of the page is affected - a later reload keeps whatever the test chose since.
 */
export async function startIn(page: Page, language: Language): Promise<void> {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('e2e-language-set') === null) {
      localStorage.setItem('smart-home.language', value);
      sessionStorage.setItem('e2e-language-set', 'yes');
    }
  }, language);
}

/**
 * `test` that fails when the page logs an error or throws: a broken import, a blocked resource
 * or a Content-Security-Policy violation shows up in the console long before it shows on screen.
 * A text without a translation counts too - it is logged as a warning and shown in English.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || /missing translation/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'errors in the browser console').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
