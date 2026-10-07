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

export { SEASONS, type Season } from '../src/app/core/theme/season';

/**
 * Starts the application with a season and a colour scheme chosen, as if somebody had picked
 * them in the settings on an earlier visit. Like `startIn`, it touches only the first load.
 */
export async function startWithTheme(
  page: Page,
  theme: { season?: Season; scheme?: 'light' | 'dark' },
): Promise<void> {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('e2e-theme-set') === null) {
      localStorage.setItem('smart-home.theme', JSON.stringify(value));
      sessionStorage.setItem('e2e-theme-set', 'yes');
    }
  }, theme);
}

/**
 * `test` that fails when the page logs an error or throws: a broken import, a blocked resource
 * or a Content-Security-Policy violation shows up in the console long before it shows on screen.
 * A key that exists in no language counts too - a typo in a template: the development build
 * logs it as a missing translation. (A key missing from Polish alone cannot happen: `pl.ts` is
 * typed with the keys of `en.ts`. Keys of views these tests never open are checked statically,
 * by `npm run check:i18n`.)
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
