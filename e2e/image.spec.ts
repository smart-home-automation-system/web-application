import { expect, test } from '@playwright/test';

/**
 * Smoke test of the built container (`IMAGE_URL=http://localhost:8080 npm run e2e`). There is no
 * backend behind it, so the heating tile is expected to report a failure - and the browser logs
 * the refused call, which is why this file does not use the console check of support.ts.
 *
 * What is tested is nginx: that the application starts under the Content-Security-Policy, that
 * deep links fall back to index.html, that caching and security headers are in place and that the
 * version was stamped into the build.
 */
test.describe('container image', () => {
  test('starts under the Content-Security-Policy and renders the shell', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) {
        violations.push(message.text());
      }
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.locator('.shell__toolbar mat-icon').first()).toBeVisible();
    // nginx answers /home itself, in the error contract: a refused request, not garbage
    await expect(page.getByRole('alert')).toContainText('The API gateway is not routed');
    const iconFont = await page.evaluate(() =>
      document.fonts.check('24px "Material Symbols Outlined"'),
    );
    expect(iconFont, 'the self-hosted icon font loaded').toBe(true);
    expect(violations).toEqual([]);
  });

  test('serves a deep link through the SPA fallback', async ({ page }) => {
    const response = await page.goto('/about');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  });

  // Polish is the one part of the application that is downloaded on demand: a chunk of its own,
  // which the dev server never serves the way the image does
  test('downloads the Polish texts when Polish is chosen, and keeps the choice', async ({
    page,
  }) => {
    const chunks: { path: string; cacheControl: string | undefined }[] = [];
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (/^\/chunk-.*\.js$/.test(path)) {
        chunks.push({ path, cacheControl: response.headers()['cache-control'] });
      }
    });
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
    const before = chunks.length;

    await page.getByRole('button', { name: 'Change language' }).click();
    await page.getByRole('menuitemradio', { name: 'Polski' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'O aplikacji' })).toBeVisible();
    const downloaded = chunks.slice(before);
    expect(downloaded.length, 'a chunk was downloaded for the language').toBeGreaterThan(0);
    for (const chunk of downloaded) {
      expect(chunk.cacheControl, chunk.path).toContain('immutable');
    }

    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: 'O aplikacji' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  });

  test('shows the stamped version, not the one of a local build', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByTestId('app-version')).not.toHaveText('0.0.0-dev');
    await expect(page.getByTestId('app-version')).toHaveText(
      process.env['EXPECTED_VERSION'] ?? /.+/,
    );
  });

  test('sends the security headers and never caches index.html', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('no-cache');
  });

  test('lets the browser keep hashed files for good', async ({ page, request }) => {
    await page.goto('/');
    const script = await page.locator('script[src^="main-"]').getAttribute('src');

    const response = await request.get(`/${script}`);

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('immutable');
    expect(response.headers()['content-security-policy']).toBeTruthy();
  });

  test('keeps the fonts for good too', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('.shell__toolbar mat-icon').first()).toBeVisible();
    const font = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => new URL(entry.name).pathname)
        .find((path) => path.startsWith('/media/')),
    );

    const response = await request.get(font ?? '/media/missing');

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('immutable');
  });

  test('does not pin an unhashed file in the browser', async ({ request }) => {
    const response = await request.get('/favicon.ico');

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-cache');
  });

  test('answers 404 for a missing hashed file instead of index.html', async ({ request }) => {
    const response = await request.get('/chunk-AAAAAAAA.js');

    expect(response.status()).toBe(404);
  });

  test('answers the health probe', async ({ request }) => {
    const response = await request.get('/healthz');

    expect(response.status()).toBe(200);
    expect(await response.text()).toBe('ok\n');
  });

  for (const path of ['/home', '/home/heating']) {
    test(`answers ${path} in the error contract when no gateway is routed`, async ({ request }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(404);
      expect((await response.json()).errors[0].message).toContain('not routed');
    });
  }

  test('serves a path that merely starts with "home" as a page of the application', async ({
    request,
  }) => {
    const response = await request.get('/homepage');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  });
});
