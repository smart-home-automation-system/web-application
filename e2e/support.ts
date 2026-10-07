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
 * Members of the mock household (`src/mocks/household.fixtures.ts`), as the browser remembers a
 * profile: the administrator, and residents with one room, two rooms and none.
 */
export const PROFILES = {
  admin: { name: 'Aurelia', role: 'admin', rooms: ['office', 'living room'] },
  resident: { name: 'Borys', role: 'resident', rooms: ['loft'] },
  'resident-two-rooms': { name: 'Celina', role: 'resident', rooms: ['bedroom', 'wardrobe'] },
  'resident-no-room': { name: 'Damian', role: 'resident', rooms: [] },
  // two the registry no longer agrees with: a member switched off since, and a resident whom
  // this browser still remembers as the administrator
  'switched-off': { name: 'Emil', role: 'resident', rooms: ['garage'] },
  demoted: { name: 'Borys', role: 'admin', rooms: ['loft'] },
} as const;

export type ProfileName = keyof typeof PROFILES;

/**
 * Starts the application as a household member, as if their personal link had been opened on an
 * earlier visit. Like `startIn`, it touches only the first load.
 */
export async function startAs(page: Page, profile: ProfileName): Promise<void> {
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('e2e-profile-set') === null) {
      localStorage.setItem('smart-home.profile', JSON.stringify(value));
      sessionStorage.setItem('e2e-profile-set', 'yes');
    }
  }, PROFILES[profile]);
}

export { SEASONS, type Season } from '../src/app/core/theme/season';

/**
 * Where the screenshots go: the evidence a pull request points to, uploaded by CI. Deliberately
 * not inside `test-results/` - Playwright empties that folder at the start of every run, and CI
 * runs it twice (mock API, then the container image), which once left the upload without a
 * single picture.
 */
export const SCREENSHOTS_DIR = 'screenshots';

/** The file of one screenshot: `screenshots/<project>-<name>.png`. */
export function screenshotPath(project: string, name: string): string {
  return `${SCREENSHOTS_DIR}/${project}-${name}.png`;
}

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
 * `test` with two additions.
 *
 * **Every test starts as the administrator**, who reaches the whole application - which is what
 * a test of a view wants. A test about the profiles themselves says who it starts as:
 * `test.use({ profile: 'resident' })`, or `'none'` for a browser nobody has chosen a profile in.
 *
 * **It fails when the page logs an error or throws**: a broken import, a blocked resource
 * or a Content-Security-Policy violation shows up in the console long before it shows on screen.
 * A key that exists in no language counts too - a typo in a template: the development build
 * logs it as a missing translation. (A key missing from Polish alone cannot happen: `pl.ts` is
 * typed with the keys of `en.ts`. Keys of views these tests never open are checked statically,
 * by `npm run check:i18n`.)
 */
export const test = base.extend<{
  profile: ProfileName | 'none';
  startingProfile: void;
  consoleErrors: string[];
}>({
  profile: ['admin', { option: true }],
  startingProfile: [
    async ({ page, profile }, use) => {
      if (profile !== 'none') {
        await startAs(page, profile);
      }
      await use();
    },
    { auto: true },
  ],
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
