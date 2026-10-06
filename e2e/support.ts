import { Page, expect, test as base } from '@playwright/test';

export type MockScenario = 'default' | 'offline' | 'server-error';

/** Switches the mock API into a failure mode before the application starts. */
export async function useScenario(page: Page, scenario: MockScenario): Promise<void> {
  await page.addInitScript((value) => localStorage.setItem('mock-scenario', value), scenario);
}

/**
 * `test` that fails when the page logs an error or throws: a broken import, a blocked resource
 * or a Content-Security-Policy violation shows up in the console long before it shows on screen.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
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
