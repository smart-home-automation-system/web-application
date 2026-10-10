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
        // every tile has told its failure before the picture is taken
        await expect(page.getByRole('alert')).toHaveCount(6, { timeout: 15_000 });
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

      // a room opened into the week of its two heaters, on a Thursday afternoon of the house
      test('heating, a room with its week', async ({ page }, testInfo) => {
        await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
        await page.goto('/heating');
        const room = page.getByTestId('rooms').locator('[data-room="living room"]');
        await room.getByRole('button').click();
        await expect(room.getByTestId('room-panel')).toBeVisible();
        // the history of the room is drawn before the picture is taken
        await expect(room.locator('.chart__plot svg')).toBeVisible();
        await room.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'heating-room-week'),
        });
      });

      // the history of the hot water over a week: the hour the sensor of the mock house was
      // silent is a break in both lines
      test('hot water, the history of 7 days', async ({ page }, testInfo) => {
        await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
        await page.goto('/water');
        const card = page.getByTestId('water-history');
        await card.getByRole('radio').nth(1).click();
        await expect(card.locator('.chart__plot svg')).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'hot-water-history-week'),
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
          await expect(page.getByTestId('water-history').locator('mat-progress-bar')).toHaveCount(
            0,
          );
          if (scenario === 'default') {
            await expect(page.getByText(TEXTS[language].warmEnough)).toBeVisible();
            // the history is drawn before the picture is taken
            await expect(page.locator('.chart__plot svg')).toBeVisible();
          }
          await photoIsShown(page);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, `hot-water${suffix}`),
            fullPage: true,
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

      // presence: the usual week, a period that begins before the history does, the calendar,
      // nothing stored yet, and the service failing. The mock household lives by the clock.
      test.describe('presence', () => {
        test.beforeEach(async ({ page }) => {
          await page.clock.setFixedTime(new Date('2026-10-08T13:30:00Z'));
        });

        for (const [scenario, suffix] of [
          ['default', ''],
          ['no-readings', '-no-readings'],
          ['server-error', '-failing'],
        ] as const) {
          test(`presence${suffix}`, async ({ page }, testInfo) => {
            await useScenario(page, scenario);
            await page.goto('/presence');
            await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);
            if (scenario === 'default') {
              await expect(page.getByTestId('house').locator('.day')).toHaveCount(7);
            }
            await photoIsShown(page);
            await page.screenshot({
              path: shot(testInfo.project.name, scheme, language, `presence${suffix}`),
              fullPage: true,
            });
          });
        }

        test('presence, thirty days and the calendar', async ({ page }, testInfo) => {
          await page.goto('/presence');
          await page.getByTestId('period').getByRole('radio').nth(2).click();
          await expect(page.getByTestId('house').locator('.day')).toHaveCount(13);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'presence-30-days'),
            fullPage: true,
          });

          await page.getByTestId('period').locator('mat-date-range-input').click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await expect(page.locator('.mat-datepicker-content')).toHaveCSS('opacity', '1');
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'presence-calendar'),
          });
        });
      });

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

        // a Thursday afternoon of the house: the schedule of "today" depends on the day
        test('my room', async ({ page }, testInfo) => {
          await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
          await page.goto('/');
          await expect(page.getByRole('heading', { name: TEXTS[language].myRoom })).toBeVisible();
          await expect(page.getByTestId('room-temperature')).toBeVisible();
          await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);
          await page.screenshot({ path: shot(testInfo.project.name, scheme, language, 'my-room') });

          await page.getByTestId('room-switcher').getByRole('radio').last().click();
          await expect(page.getByTestId('room-heating')).toContainText('wardrobe');
          await expect(page.getByTestId('room-temperature')).toBeVisible();
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'my-room-second'),
          });
        });
      });

      test.describe('as a resident without a room', () => {
        test.use({ profile: 'resident-no-room' });

        test('my room, none assigned', async ({ page }, testInfo) => {
          await page.goto('/');
          await expect(page.getByTestId('no-rooms')).toBeVisible();
          await expect(page.getByRole('main').locator('mat-progress-bar')).toHaveCount(0);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'my-room-none'),
          });
        });
      });

      test.describe('as the administrator', () => {
        test('my room, two heaters', async ({ page }, testInfo) => {
          await page.clock.setFixedTime(new Date('2026-10-08T12:30:00Z'));
          await page.goto('/room');
          await page.getByTestId('room-switcher').getByRole('radio').last().click();
          await expect(page.getByTestId('room-heating').locator('.week__day')).toHaveCount(2);
          await page.screenshot({
            path: shot(testInfo.project.name, scheme, language, 'my-room-heaters'),
          });
        });
      });

      // the administration of the household: the registry as it is, a member being changed
      // with a question open in another card, and a refusal of the form
      test('household', async ({ page }, testInfo) => {
        await page.goto('/household');
        await expect(page.getByTestId('member')).toHaveCount(5);
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'household'),
        });

        await page.locator('[data-member="Celina"] .block__action').last().click();
        await expect(page.locator('[data-member="Celina"]').getByRole('img')).toBeVisible();
        await page.locator('[data-member="Borys"] .member__actions button').first().click();
        await page.locator('[data-member="Borys"] input').first().fill('Bo');
        await page.locator('[data-member="Borys"] input').last().fill('500 100 102');
        await page.locator('[data-member="Borys"] button[type="submit"]').click();
        await page.locator('[data-member="Damian"] .member__actions button').last().click();
        await expect(page.locator('[data-member="Damian"]').getByRole('group')).toBeVisible();
        await page.screenshot({
          path: shot(testInfo.project.name, scheme, language, 'household-editing'),
        });
        // the form is taller than the window: the card by itself
        await page.locator('[data-member="Borys"]').screenshot({
          path: shot(testInfo.project.name, scheme, language, 'household-form'),
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
