import { Page, expect, test } from '@playwright/test';

import { screenshotPath } from './support';

/**
 * Smoke test of the built container (`IMAGE_URL=http://localhost:8080 npm run e2e`). There is no
 * backend behind it, so the heating tile is expected to report a failure - and the browser logs
 * the refused call, which is why this file does not use the console check of support.ts.
 *
 * What is tested is nginx: that the application starts under the Content-Security-Policy, that
 * deep links fall back to index.html, that caching and security headers are in place and that the
 * version was stamped into the build - and the service worker, which only a production build has:
 * that the application starts without the network, and that a deployment reaches a browser
 * which already keeps it.
 *
 * Every page starts as an administrator remembered by the browser - without a backend there is
 * no registry to choose a profile from, and a remembered profile is exactly what survives that.
 */
test.describe('container image', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'smart-home.profile',
        JSON.stringify({ name: 'Aurelia', role: 'admin', rooms: [] }),
      ),
    );
  });

  test('asks who is using the application when nobody is remembered', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/about');

    await expect(page).toHaveURL(/\/profiles$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Choose your profile' }),
    ).toBeVisible();
    await expect(page.getByRole('alert').first()).toContainText('The API gateway is not routed');
    await context.close();
  });

  test('starts under the Content-Security-Policy and renders the shell', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) {
        violations.push(message.text());
      }
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await expect(page.locator('.shell__brand mat-icon').first()).toBeVisible();
    // nginx answers /home itself, in the error contract: a refused request, not garbage
    await expect(page.getByRole('alert').first()).toContainText('The API gateway is not routed');
    // once the fonts that are on their way have arrived: the first failure strip can be on
    // screen before the icon font is
    const iconFont = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('24px "Material Symbols Outlined"');
    });
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
    await expect(page.locator('.shell__brand mat-icon').first()).toBeVisible();
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

  test('serves the photo of the overview, which the browser revalidates', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const photo = page.locator('app-view-background img[data-background="home"]');
    await expect(photo).toHaveCount(1);
    const src = await photo.evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname);
    expect(src).toMatch(/^\/backgrounds\/home-(1280|2560)\.webp$/);

    const response = await request.get(src);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    // not hashed, so not pinned: a regenerated photo under the same name reaches the browser
    expect(response.headers()['cache-control']).toBe('no-cache');
  });

  // the sidecar and the notes next to the photos are inputs of the build, not of the browser
  for (const path of ['/backgrounds/home.json', '/backgrounds/README.md']) {
    test(`does not serve ${path}`, async ({ request }) => {
      const response = await request.get(path);

      // the SPA fallback answers with the page, never with the file
      expect(response.headers()['content-type']).toContain('text/html');
    });
  }

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

  test.describe('as an application on a home screen', () => {
    test('links a manifest the browser accepts, which names no start address', async ({
      page,
      request,
    }) => {
      await page.goto('/');
      const href = await page.locator('link[rel="manifest"]').getAttribute('href');

      const response = await request.get(`/${href}`);

      // nginx has to be told the type: "nosniff" makes the browser believe what it is sent
      expect(response.headers()['content-type']).toBe('application/manifest+json');
      expect(response.headers()['cache-control']).toBe('no-cache');
      const manifest = await response.json();
      expect(manifest.display).toBe('standalone');
      expect(manifest.scope).toBe('/');
      // the icon opens the address it was added from: the personal link of a household member
      expect(manifest).not.toHaveProperty('start_url');
      expect(manifest.icons.length).toBeGreaterThan(0);
      for (const icon of manifest.icons) {
        const image = await request.get(`/${icon.src}`);
        expect(image.headers()['content-type'], icon.src).toBe('image/png');
      }
    });

    // a browser that kept either of them would go on starting the old version after a deploy
    for (const path of ['/ngsw-worker.js', '/ngsw.json']) {
      test(`never lets the browser keep ${path}`, async ({ request }) => {
        const response = await request.get(path);

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).not.toContain('text/html');
        expect(response.headers()['cache-control']).toBe('no-cache');
      });
    }

    test('starts without the network, and says that the house cannot be reached', async ({
      page,
      context,
    }) => {
      test.slow();
      await page.goto('/');
      await workerKeepsTheApplication(page);

      await context.setOffline(true);
      await page.reload();

      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      const iconFont = await page.evaluate(() =>
        document.fonts.check('24px "Material Symbols Outlined"'),
      );
      expect(iconFont, 'the icon font came from the service worker').toBe(true);
      await expect(page.getByTestId('offline-notice')).toContainText('No connection to the house');
      // The call itself went past the worker, which keeps no answer of the backend - and which
      // would have answered in its place with a 504 of its own, read as a failing service.
      await expect(page.getByRole('alert').first()).toContainText('The server cannot be reached');
    });

    test('offers a version deployed since, and starts it on request', async ({ page, context }) => {
      test.slow();
      await page.goto('/about');
      await workerKeepsTheApplication(page);
      await expect(page.getByTestId('update-notice')).toBeHidden();

      // "A deployment": from now on the server names another list of files. Their content is the
      // same, so the worker has the new version complete as soon as it has read the list.
      await context.route('**/ngsw.json*', async (route) => {
        const response = await route.fetch();
        const files = await response.json();
        await route.fulfill({ response, json: { ...files, timestamp: files.timestamp + 1 } });
      });
      // the page comes back into view - which is when the application asks for a new version
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

      const notice = page.getByTestId('update-notice');
      await expect(notice).toContainText('A new version of the application is ready.');
      await page.screenshot({ path: screenshotPath('image', 'new-version') });

      await Promise.all([
        page.waitForEvent('load'),
        notice.getByRole('button', { name: 'Reload' }).click(),
      ]);

      await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
      await expect(notice).toBeHidden();
    });
  });
});

/**
 * Waits until the service worker has taken the page over and holds every file of the
 * application. It registers once the application has settled, and downloads in the background:
 * a test that cuts the network before that would test nothing.
 */
async function workerKeepsTheApplication(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const response = await fetch('/ngsw.json');
          const list = (await response.json()) as {
            assetGroups: { name: string; urls: string[] }[];
          };
          const wanted = list.assetGroups.find((group) => group.name === 'shell')?.urls.length;
          for (const name of await caches.keys()) {
            if (name.endsWith(':assets:shell:cache')) {
              const kept = await (await caches.open(name)).keys();
              return wanted !== undefined && kept.length >= wanted;
            }
          }
          return false;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(
    await page.evaluate(() => navigator.serviceWorker.controller !== null),
    'the service worker controls the page',
  ).toBe(true);
}
