import { rmSync } from 'node:fs';

import { SCREENSHOTS_DIR } from './support';

/**
 * Runs once, before the tests. The screenshots live outside the folders Playwright empties by
 * itself (see `SCREENSHOTS_DIR`), so the run that takes them clears the old ones here - a picture
 * of a page that no longer exists must not pass as evidence. The test of the container image
 * leaves them alone and adds the one picture only it can take (the notice of a new version,
 * which takes a service worker): run it after the tests on the mock API, as CI does.
 */
export default function globalSetup(): void {
  if (!process.env['IMAGE_URL']) {
    rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
  }
}
