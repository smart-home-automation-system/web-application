import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests. By default they run against the dev server with the mock API
 * (`npm run start:mock` on its own port), so they need no backend and can never touch a real
 * device.
 *
 * With IMAGE_URL set they run the `image` project instead: a smoke test of the built container
 * (`docker run -p 8080:8080 ...`), which is the only place where the nginx configuration - the
 * Content-Security-Policy, the SPA fallback, the stamped version - meets a real browser.
 */
const MOCK_PORT = 4300;
const imageUrl = process.env['IMAGE_URL'];

export default defineConfig({
  testDir: 'e2e',
  // Playwright empties its output folder and its report folder when a run starts, and CI runs
  // it twice: each kind of run gets folders of its own, side by side, so neither deletes what
  // the other left - in whichever order they run. The screenshots are in a third place that
  // no run empties by itself (`SCREENSHOTS_DIR`, cleared in `e2e/global-setup.ts`).
  outputDir: imageUrl ? 'test-results-image' : 'test-results',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [
        ['list'],
        [
          'html',
          {
            open: 'never',
            outputFolder: imageUrl ? 'playwright-report-image' : 'playwright-report',
          },
        ],
      ]
    : 'list',
  use: {
    baseURL: imageUrl ?? `http://localhost:${MOCK_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: imageUrl
    ? [{ name: 'image', testMatch: 'image.spec.ts', use: { ...devices['Desktop Chrome'] } }]
    : [
        {
          name: 'desktop',
          testIgnore: 'image.spec.ts',
          use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
        {
          // the size of an iPhone 13 / 14, rendered by Chromium - the layout is what is tested
          // here; Safari itself is checked on a real phone
          name: 'phone',
          testIgnore: 'image.spec.ts',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 390, height: 844 },
            deviceScaleFactor: 3,
            isMobile: true,
            hasTouch: true,
          },
        },
      ],
  webServer: imageUrl
    ? undefined
    : {
        command: `npx ng serve --configuration mock --port ${MOCK_PORT}`,
        url: `http://localhost:${MOCK_PORT}`,
        reuseExistingServer: !process.env['CI'],
        timeout: 180_000,
      },
});
