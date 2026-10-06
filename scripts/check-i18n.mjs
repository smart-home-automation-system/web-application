// Fails when a template asks for a text that does not exist.
//
// Keys used in TypeScript are checked by the compiler (`MessageKey`). A template is not: there
// `t('overview.titel')` is just a string, and a typo shows up as the key itself on screen - only
// in the view that contains it, which a browser test may never open. This script reads every
// template (the .html files and the inline `template:` of components) and checks each key
// against src/app/i18n/en.ts, the source of the keys.
//
//   npm run check:i18n
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node runs the TypeScript file directly: en.ts is a plain object literal
import { en } from '../src/app/i18n/en.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCES = join(ROOT, 'src', 'app');

function flatten(tree, prefix = '') {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : flatten(value, `${prefix}${key}.`),
  );
}

function filesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const keys = new Set(flatten(en));
const groups = new Set(Object.keys(en));
const problems = [];
let checked = 0;

for (const file of filesUnder(SOURCES)) {
  const isTemplate = file.endsWith('.html');
  const isComponent = file.endsWith('.ts') && !file.endsWith('.spec.ts');
  if (!isTemplate && !isComponent) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  // an inline template is the text between the backticks of `template: \`...\``
  const templates = isTemplate
    ? [source]
    : [...source.matchAll(/template:\s*`([\s\S]*?)`/g)].map((match) => match[1]);

  for (const template of templates) {
    const candidates = new Set();
    // the first argument of t('...')
    for (const match of template.matchAll(/\bt\(\s*'([^']+)'/g)) {
      candidates.add(match[1]);
    }
    // any other quoted dotted name whose first part is a group of texts - the branches of a
    // condition inside t(...): t(enabled ? 'overview.heating.enabled' : 'overview.heating.disabled')
    for (const match of template.matchAll(/'([A-Za-z]\w*(?:\.\w+)+)'/g)) {
      if (groups.has(match[1].split('.')[0])) {
        candidates.add(match[1]);
      }
    }
    for (const key of candidates) {
      checked++;
      if (!keys.has(key)) {
        problems.push(`${relative(ROOT, file)}: no text for the key '${key}'`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error('Templates use translation keys that do not exist in src/app/i18n/en.ts:');
  problems.forEach((problem) => console.error(` - ${problem}`));
  process.exit(1);
}
if (checked === 0) {
  console.error('No translation key was found in any template - the check itself is broken.');
  process.exit(1);
}
console.log(`Translation keys OK (${checked} uses in templates, ${keys.size} texts).`);
