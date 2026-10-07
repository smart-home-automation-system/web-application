import { Page } from '@playwright/test';

import { SEASONS, Season, expect, startIn, startWithTheme, test } from './support';

/** A day well inside each season. */
const A_DAY_IN: Record<Season, string> = {
  spring: '2026-04-15T12:00:00',
  summer: '2026-07-15T12:00:00',
  autumn: '2026-10-15T12:00:00',
  winter: '2026-01-15T12:00:00',
};

const html = (page: Page) => page.locator('html');

/** The background of the app bar as the browser paints it: `rgb(r, g, b)`. */
async function barColour(page: Page): Promise<string> {
  return page
    .locator('.shell__toolbar')
    .evaluate((bar) => getComputedStyle(bar).backgroundColor.replace(/\s/g, ''));
}

/** `#rrggbb` as the `rgb(r,g,b)` a computed style reports. */
function rgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16},${(value >> 8) & 0xff},${value & 0xff})`;
}

test.describe('seasonal colours', () => {
  for (const season of SEASONS) {
    test(`are those of ${season} on a day in ${season}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(A_DAY_IN[season]));

      await page.goto('/');

      await expect(html(page)).toHaveAttribute('data-season', season);
    });
  }

  test('differ between the seasons, and the status bar of a phone continues the app bar', async ({
    page,
  }) => {
    const colours = new Set<string>();
    for (const season of SEASONS) {
      await page.clock.setFixedTime(new Date(A_DAY_IN[season]));
      await page.goto('/');
      await expect(html(page)).toHaveAttribute('data-season', season);

      const bar = await barColour(page);
      const themeColour = await page.locator('meta[name="theme-color"]').getAttribute('content');

      expect(rgb(themeColour ?? ''), `theme-color in ${season}`).toBe(bar);
      colours.add(bar);
    }

    expect(colours.size).toBe(SEASONS.length);
  });

  // a dashboard is left open for weeks: nobody reloads it on the first day of autumn
  test('change by themselves when the season starts at midnight', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-09-22T23:59:50') });
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-season', 'summer');

    await page.clock.fastForward(15_000);

    await expect(html(page)).toHaveAttribute('data-season', 'autumn');
  });

  test('follow the light or dark setting of the system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .not.toBe(light);
    await expect(html(page)).not.toHaveAttribute('data-color-scheme');
  });
});

test.describe('appearance settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(A_DAY_IN.autumn));
  });

  test('show which season the calendar gives', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('radio', { name: /Automatic/ })).toBeChecked();
    await expect(page.getByText('By the calendar, now: Autumn')).toBeVisible();
  });

  test('preview another season and keep it over a reload', async ({ page }) => {
    await page.goto('/settings');
    const autumnBar = await barColour(page);

    await page.getByRole('radio', { name: 'Winter' }).check();

    await expect(html(page)).toHaveAttribute('data-season', 'winter');
    expect(await barColour(page)).not.toBe(autumnBar);

    await page.reload();

    await expect(html(page)).toHaveAttribute('data-season', 'winter');
    await expect(page.getByRole('radio', { name: 'Winter' })).toBeChecked();
  });

  test('override the colour scheme of the system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByRole('radio', { name: 'Dark' }).click();

    await expect(html(page)).toHaveAttribute('data-color-scheme', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(
      light,
    );
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  });

  test('go back to the calendar and the system with one button', async ({ page }) => {
    await startWithTheme(page, { season: 'spring', scheme: 'dark' });
    await page.goto('/settings');
    await expect(html(page)).toHaveAttribute('data-season', 'spring');

    await page.getByRole('button', { name: 'Back to automatic' }).click();

    await expect(html(page)).toHaveAttribute('data-season', 'autumn');
    await expect(html(page)).not.toHaveAttribute('data-color-scheme');
    await expect(page.getByRole('button', { name: 'Back to automatic' })).toBeDisabled();
  });

  test('speak Polish', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/settings');

    await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
    await expect(page.getByText('Według kalendarza, teraz: Jesień')).toBeVisible();
  });

  test('fit a phone without horizontal scrolling', async ({ page }) => {
    await startIn(page, 'pl');
    await page.goto('/settings');
    await expect(page.getByTestId('palette')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    expect(overflow).toBe(0);
  });
});

/**
 * Evidence, not assertions: the eight variants - four seasons, light and dark - on the two pages
 * that show the most of the theme, written to `test-results/screenshots/`.
 */
test.describe('screenshots of the eight variants', () => {
  for (const season of SEASONS) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`${season}, ${scheme}`, async ({ page }, testInfo) => {
        await startWithTheme(page, { season, scheme });
        const shot = (name: string) =>
          `test-results/screenshots/${testInfo.project.name}-theme-${season}-${scheme}-${name}.png`;

        await page.goto('/overview');
        // the picture must be of the variant its name says
        await expect(html(page)).toHaveAttribute('data-season', season);
        await expect(html(page)).toHaveAttribute('data-color-scheme', scheme);
        await expect(page.getByText('Enabled')).toBeVisible();
        await page.screenshot({ path: shot('overview') });

        await page.goto('/settings');
        await expect(page.getByTestId('palette')).toBeVisible();
        await page.screenshot({ path: shot('settings') });
      });
    }
  }
});
