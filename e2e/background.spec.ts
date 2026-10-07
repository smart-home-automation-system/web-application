import { expect, test } from './support';

test.describe('photo behind a view', () => {
  test('lies under the overview and loads from this origin', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

    const photo = page.locator('app-view-background img[data-background="home"]');
    await expect(photo).toHaveCount(1);
    // the file is large and arrives after the text: wait for the decode
    await expect
      .poll(
        () =>
          photo.evaluate(
            (img: HTMLImageElement) =>
              img.complete &&
              img.naturalWidth > 0 &&
              new URL(img.currentSrc).origin === location.origin,
          ),
        { message: 'the photo was decoded from this origin' },
      )
      .toBe(true);
    // under everything: the page text is still on top of it
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
  });

  test('is absent from a view that names no photo', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();

    await expect(page.locator('app-view-background img')).toHaveCount(0);
    await expect(page.locator('app-view-background')).toBeHidden();
  });

  test('can be switched off in the settings, which the browser remembers', async ({ page }) => {
    await page.goto('/settings');
    const toggle = page.getByRole('switch', { name: 'Photos behind the views' });
    await expect(toggle).toBeChecked();

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText('Hidden', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Overview' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.locator('app-view-background img')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.locator('app-view-background img')).toHaveCount(0);
  });

  test('changes with the view without a fade when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();

    await page.getByRole('link', { name: 'Overview' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();

    const photo = page.locator('app-view-background img');
    await expect(photo).toHaveCount(1);
    await expect(photo).toHaveCSS('transition-duration', '0s');
  });
});
