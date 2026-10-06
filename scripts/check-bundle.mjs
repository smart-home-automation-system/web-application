// Fails when the production bundle is not what may be deployed:
//  - it contains the mock API (the marker text of src/mocks/mock-api.ts),
//  - index.html loads anything from another origin (fonts and icons are self-hosted; the
//    application has to work on a LAN without internet access, and the CSP allows 'self' only).
//
//   npm run build && npm run check:bundle
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/web-application/browser', import.meta.url));
const MOCK_MARKER = 'smart-home-mock-api-enabled';

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

let files;
try {
  files = filesUnder(DIST);
} catch {
  console.error(`No build found in ${DIST} - run "npm run build" first.`);
  process.exit(1);
}

const problems = [];

for (const file of files.filter((path) => /\.(js|css|html)$/.test(path))) {
  if (readFileSync(file, 'utf8').includes(MOCK_MARKER)) {
    problems.push(`${file}: contains the mock API`);
  }
}

const index = readFileSync(join(DIST, 'index.html'), 'utf8');
const external = [...index.matchAll(/(?:src|href)="((?:https?:)?\/\/[^"]+)"/g)].map((m) => m[1]);
if (external.length > 0) {
  problems.push(`index.html loads from another origin: ${external.join(', ')}`);
}
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(index)) {
  problems.push('index.html contains an inline script, which the Content-Security-Policy blocks');
}

if (problems.length > 0) {
  console.error('The production bundle must not be deployed:');
  problems.forEach((problem) => console.error(` - ${problem}`));
  process.exit(1);
}
console.log(`Production bundle OK (${files.length} files, no mock API, nothing external).`);
