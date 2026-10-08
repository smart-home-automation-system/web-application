import { Page } from '@playwright/test';

import {
  Language,
  expect,
  onAnIPhone,
  screenshotPath,
  startIn,
  test,
  useScenario,
} from './support';

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
    warmEnough: 'Warm enough',
    switchOff: 'Switch off',
    disabled: 'Disabled',
    noRoomHeated: 'No room is being heated',
    furnace: 'Furnace',
    more: 'More',
    offline: 'No connection to the house',
  },
  pl: {
    enabled: 'Włączone',
    notFound: 'Nie znaleziono strony',
    myRoom: 'Mój pokój',
    noProfile: 'Ten link nie otwiera żadnego profilu',
    install: 'Dodaj do ekranu początkowego',
    warmEnough: 'Wystarczająco ciepła',
    switchOff: 'Wyłącz',
    disabled: 'Wyłączone',
    noRoomHeated: 'Żaden pokój nie jest ogrzewany',
    furnace: 'Piec',
    more: 'Więcej',
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

      // the switch of the heating: the question it asks, the house after the answer, and a
      // change the house did not carry out
      test('heating, the switch', async ({ page }, testInfo) => {
        await page.goto('/heating');
        const card = page.getByTestId('heating-switch');
        await card.getByRole('button', { name: TEXTS[language].switchOff }).click();
        await expect(card.getByRole('group')).toBeVisible();
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'heating-question'),
        });

        await card.getByRole('group').getByRole('button').last().click();
        await expect(page.getByTestId('heating-state')).toContainText(TEXTS[language].disabled);
        await expect(page.getByTestId('activity')).toContainText(TEXTS[language].noRoomHeated);
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'heating-switched-off'),
        });
      });

      test('heating, a switch that failed', async ({ page }, testInfo) => {
        await useScenario(page, 'writes-fail');
        await page.goto('/heating');
        const card = page.getByTestId('heating-switch');
        await card.getByRole('button', { name: TEXTS[language].switchOff }).click();
        await card.getByRole('group').getByRole('button').last().click();
        await expect(card.getByRole('alert')).toBeVisible();
        await expect(card.locator('mat-progress-bar')).toHaveCount(0);
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'heating-switch-failed'),
        });
      });

      // the dashboards, each in its usual state, just after a start of its service (nothing
      // measured or noted yet) and while the service fails
      for (const [scenario, suffix] of [
        ['default', ''],
        ['no-readings', '-no-readings'],
        ['server-error', '-failing'],
      ] as const) {
        test(`heating${suffix}`, async ({ page }, testInfo) => {
          await useScenario(page, scenario);
          await page.goto('/heating');
          await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);
          if (scenario === 'default') {
            await expect(page.getByRole('table')).toBeVisible();
          }
          await photoIsShown(page);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, `heating${suffix}`),
            fullPage: true,
          });
        });

        test(`hot water${suffix}`, async ({ page }, testInfo) => {
          await useScenario(page, scenario);
          await page.goto('/water');
          await expect(page.getByTestId('demand').locator('mat-progress-bar')).toHaveCount(0);
          await expect(page.getByTestId('temperatures').locator('mat-progress-bar')).toHaveCount(0);
          if (scenario === 'default') {
            await expect(page.getByText(TEXTS[language].warmEnough)).toBeVisible();
          }
          await photoIsShown(page);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, `hot-water${suffix}`),
          });
        });

        test(`boiler room${suffix}`, async ({ page }, testInfo) => {
          await useScenario(page, scenario);
          await page.goto('/boiler');
          await expect(page.locator('.installation mat-progress-bar')).toHaveCount(0);
          if (scenario !== 'server-error') {
            await expect(
              page.getByRole('heading', { name: TEXTS[language].furnace }),
            ).toBeVisible();
          }
          await photoIsShown(page);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, `boiler-room${suffix}`),
          });
        });
      }

      // only a phone has the bar, and only the bar has "More"
      test('navigation, what did not fit in the bottom bar', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'phone', 'the bottom bar is the navigation of a phone');
        await page.goto('/water');
        await page.getByRole('button', { name: TEXTS[language].more }).click();
        await expect(page.locator('.mat-mdc-menu-panel')).toHaveCSS('opacity', '1');
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'navigation-more'),
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

        // what a browser on an iPhone shows
        test('personal link, how to add it to the home screen', async ({ page }, testInfo) => {
          await onAnIPhone(page, 'in a tab');
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

/** The photo behind the view fades in once its file has arrived: wait until it is fully there. */
async function photoIsShown(page: Page): Promise<void> {
  await expect(page.locator('.view-background__photo--shown')).toHaveCSS('opacity', '1');
}

function shot(project: string, scheme: string, language: Language, name: string): string {
  return screenshotPath(project, `${scheme}-${language}-${name}`);
}
