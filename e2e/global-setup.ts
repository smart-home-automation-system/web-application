import { rmSync } from 'node:fs';

import { SCREENSHOTS_DIR } from './support';

/**
 * Runs once, before the tests. The screenshots live outside the folders Playwright empties by
 * itself (see `SCREENSHOTS_DIR`), so the run that takes them clears the old ones here - a picture
 * of a page that no longer exists must not pass as evidence. The test of the container image
 * takes none and leaves them alone.
 */
export default function globalSetup(): void {
  if (!process.env['IMAGE_URL']) {
    rmSync(SCREENSHOTS_DIR, { recursive: true, force: true });
  }
}
