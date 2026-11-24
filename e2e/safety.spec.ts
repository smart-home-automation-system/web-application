import { Page } from '@playwright/test';

import { expect, test, useScenario } from './support';

/**
 * The fire detectors (HAS-469), fed by the mock API: the kitchen and the office all right, the living room muted, the
 * loft with a low battery, the bedroom off the base, the hall up never heard, a CO detector of the boiler room not
 * confirmed since the start. `localStorage['mock-fire']` = `on` puts the kitchen in alarm, `mock-safety-base` =
 * `silent` makes the base silent. A command changes what the next reads answer.
 */

async function fire(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('mock-fire', 'on'));
}

test('lists the detectors by floor with their state, the base, the switches and the alarms', async ({
  page,
}) => {
  await page.goto('/safety');

  await expect(page.getByRole('heading', { level: 1, name: 'Safety' })).toBeVisible();
  await expect(page.getByTestId('safety-detector')).toHaveCount(7);
  await expect(page.locator('[data-detector="73"] [data-testid="detector-state"]')).toHaveText(
    /Muted/,
  );
  await expect(page.locator('[data-detector="75"] [data-testid="detector-state"]')).toHaveText(
    /Offline/,
  );
  await expect(page.locator('[data-detector="76"] [data-testid="detector-state"]')).toHaveText(
    /Not known/,
  );
  await expect(page.locator('[data-detector="74"] [data-fact="battery"] dd')).toHaveText(
    'Low - replace it',
  );
  await expect(page.getByTestId('base-reachable')).toHaveText('Connected');
  await expect(page.locator('[data-reaction="lightsOn"] button')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // the newest five of each, five more with "Show more" (the preview of HAS-469)
  await expect(page.getByTestId('safety-alarm')).toHaveCount(5);
  await expect(page.getByTestId('safety-run')).toHaveCount(5);
  await page.getByTestId('alarms-more').click();
  await expect(page.getByTestId('safety-alarm')).toHaveCount(8);
  await expect(page.getByTestId('alarms-more')).toHaveCount(0);
  // no alarm, no banner
  await expect(page.getByTestId('fire-notice')).toHaveCount(0);
});

test('asks before a self test, sends it for yes, and words a second command within a minute', async ({
  page,
}) => {
  await page.goto('/safety');
  const office = page.locator('[data-detector="72"]');

  await office.getByTestId('detector-self-test').click();
  const question = page.getByRole('dialog');
  await expect(question.getByTestId('safety-question')).toContainText('Run the self test');
  await expect(question.getByTestId('confirm-cancel')).toBeFocused();
  await question.getByTestId('confirm-yes').click();
  await expect(question).toHaveCount(0);

  // the second self test once the first was read back (HAS-464: a mute is offered only while the detector sounds)
  await expect(office.getByTestId('detector-self-test')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await office.getByTestId('detector-self-test').click();
  await page.getByRole('dialog').getByTestId('confirm-yes').click();
  await expect(office.getByTestId('detector-failure')).toHaveText(
    'The detector was commanded a moment ago - wait a minute.',
  );
});

test('turns a switch of the reactions, read back from the service', async ({ page }) => {
  await page.goto('/safety');
  const blinds = page.locator('[data-reaction="blindsUp"] button');
  await expect(blinds).toHaveAttribute('aria-checked', 'false');

  await blinds.click();

  await expect(blinds).toHaveAttribute('aria-checked', 'true');
});

test.describe('a fire alarm', () => {
  test.beforeEach(async ({ page }) => fire(page));

  test('stands red over every page, and the administrator mutes it after a question', async ({
    page,
  }) => {
    await page.goto('/weather');
    const banner = page.getByTestId('fire-notice');

    await expect(banner).toContainText('Fire alarm kitchen · Smoke detector');
    await banner.getByTestId('fire-notice-mute').click();
    await page.getByRole('dialog').getByTestId('confirm-yes').click();

    await expect(banner.getByTestId('fire-notice-muted')).toHaveText('muted');
    await expect(banner.getByTestId('fire-notice-mute')).toHaveCount(0);
  });

  test('is told on the tile of the overview', async ({ page }) => {
    await page.goto('/overview');

    // the blinking light by the title, the names in its tooltip (HAS-504, owner 2026-11-24)
    await expect(page.getByTestId('tile-safety').getByTestId('tile-signal')).toHaveAttribute(
      'aria-label',
      /^Fire alarm: /,
    );
  });
});

test.describe('a resident', () => {
  test.use({ profile: 'resident' });

  test('sees the banner of a fire alarm with no mute and no close', async ({ page }) => {
    await fire(page);
    await page.goto('/room');
    const banner = page.getByTestId('fire-notice');

    await expect(banner).toContainText('Fire alarm kitchen');
    await expect(banner.getByRole('button')).toHaveCount(0);
  });

  // a mute is offered only while the detector sounds (HAS-464): the loft in alarm
  test('mutes a smoke detector of their room after a question', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mock-fire', 'loft'));
    await page.goto('/room');
    const card = page.getByTestId('room-safety');

    await expect(card.locator('[data-detector="74"] .detector__facts')).toContainText(
      'Battery: Low - replace it',
    );
    await card.getByTestId('detector-mute').click();
    await page.getByRole('dialog').getByTestId('confirm-yes').click();

    await expect(page.getByTestId('fire-notice')).toContainText('muted');
  });

  test('is offered no mute of a detector that does not sound', async ({ page }) => {
    await page.goto('/room');
    const card = page.getByTestId('room-safety');

    await expect(card.locator('[data-detector="74"]')).toBeVisible();
    await expect(card.getByTestId('detector-mute')).toHaveCount(0);
  });

  test('is not offered the safety page', async ({ page }) => {
    await page.goto('/safety');

    await expect(page).toHaveURL(/\/room$/);
  });
});

test('tells the administrator of a silent base on every page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mock-safety-base', 'silent'));
  await page.goto('/weather');

  await expect(page.getByTestId('safety-base-notice')).toContainText('SBS50ABCDEF01');
});

test('claims nothing the service does not know yet', async ({ page }) => {
  await useScenario(page, 'no-readings');
  await page.goto('/safety');

  await expect(page.getByTestId('safety-detector')).toHaveCount(7);
  for (const state of await page.getByTestId('detector-state').all()) {
    await expect(state).toHaveText(/Not known/);
  }
  await expect(page.getByTestId('alarms-none')).toBeVisible();
});

test('tells the failure of every call of the page', async ({ page }) => {
  await useScenario(page, 'server-error');
  await page.goto('/safety');

  await expect(page.getByRole('main').getByRole('alert').first()).toContainText('(error 502)');
});
