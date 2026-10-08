// Fails when the production bundle is not what may be deployed:
//  - it contains the mock API (the marker text of src/mocks/mock-api.ts),
//  - index.html loads anything from another origin (fonts and icons are self-hosted; the
//    application has to work on a LAN without internet access, and the CSP allows 'self' only),
//  - the web app manifest names a start address, or an icon that is not there,
//  - the service worker is missing, or would keep anything but the application itself.
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

/** A JSON file of the build; a missing or broken one is a problem of its own. */
function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(DIST, name), 'utf8'));
  } catch (error) {
    problems.push(`${name}: ${error.message}`);
    return undefined;
  }
}

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

// The manifest. An icon on a home screen opens `start_url` - and, when there is none, the
// address it was added from, which is the personal link of a household member. A start address
// here would open every installed application as nobody. The scope is named because its default
// is the folder of the start address: /u/, which the first page behind the link already leaves.
const manifest = readJson('manifest.webmanifest');
if (manifest !== undefined) {
  if ('start_url' in manifest) {
    problems.push('manifest.webmanifest names a start_url: the icon must open the personal link');
  }
  if (manifest.scope !== '/') {
    problems.push('manifest.webmanifest: the scope must be "/"');
  }
  if (manifest.display !== 'standalone') {
    problems.push('manifest.webmanifest: the display mode must be "standalone"');
  }
  for (const icon of manifest.icons ?? []) {
    if (!files.includes(join(DIST, icon.src))) {
      problems.push(`manifest.webmanifest names an icon that is not in the build: ${icon.src}`);
    }
  }
}

// The service worker keeps the application - never what the backend answered: a remembered
// "heating is on" is worse than an error. Data groups are the only way it could.
const worker = readJson('ngsw.json');
if (worker !== undefined) {
  if ((worker.dataGroups ?? []).length > 0) {
    problems.push('ngsw.json has data groups: the service worker must not keep backend answers');
  }
  const groups = worker.assetGroups ?? [];
  const urls = groups.flatMap((group) => group.urls);
  const backend = [
    ...urls.filter((url) => url === '/home' || url.startsWith('/home/')),
    // patterns are regular expressions; none is expected, and none may reach for the backend
    ...groups.flatMap((group) => group.patterns).filter((pattern) => pattern.includes('home')),
  ];
  if (backend.length > 0) {
    problems.push(`ngsw.json keeps paths of the backend: ${backend.join(', ')}`);
  }
  if (!urls.includes('/index.html')) {
    problems.push('ngsw.json does not keep index.html: the application would not start offline');
  }
  if (!files.includes(join(DIST, 'ngsw-worker.js'))) {
    problems.push('ngsw-worker.js is missing from the build');
  }
}

if (problems.length > 0) {
  console.error('The production bundle must not be deployed:');
  problems.forEach((problem) => console.error(` - ${problem}`));
  process.exit(1);
}
console.log(
  `Production bundle OK (${files.length} files, no mock API, nothing external, a manifest without a start address, a service worker for the application alone).`,
);
