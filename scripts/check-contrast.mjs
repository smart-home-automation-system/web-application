// Fails when a colour of the theme no longer meets WCAG AA against the background it is used on.
//
// It reads the colours back from the production stylesheet - what ships, not what the Sass
// source intends - for each of the eight variants (four seasons, light and dark), and checks
// every pair of text and background the application and Angular Material combine:
// 4.5:1 for text, 3:1 for the outline of a control.
//
//   npm run build && npm run check:contrast
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node runs the TypeScript file directly: season.ts has no imports
import { SEASONS } from '../src/app/core/theme/season.ts';

const DIST = fileURLToPath(new URL('../dist/web-application/browser', import.meta.url));
const TEXT = 4.5;
const NON_TEXT = 3;

// [foreground, background, minimum ratio]
const PAIRS = [
  // body text and secondary text, on the page and on every level of paper
  ...[
    'background',
    'surface',
    'surface-container-low',
    'surface-container',
    'surface-container-high',
    'surface-container-highest',
  ].flatMap((background) => [
    ['on-surface', background, TEXT],
    ['on-surface-variant', background, TEXT],
  ]),
  // the primary colour as text: text buttons, links, the open destination, a status
  ['primary', 'background', TEXT],
  ['primary', 'surface', TEXT],
  ['primary', 'surface-container', TEXT],
  ['primary', 'surface-container-high', TEXT],
  ['secondary', 'surface', TEXT],
  ['tertiary', 'surface', TEXT],
  // text on a filled control, and on whatever is selected or highlighted
  ['on-primary', 'primary', TEXT],
  ['on-secondary', 'secondary', TEXT],
  ['on-tertiary', 'tertiary', TEXT],
  ['on-primary-container', 'primary-container', TEXT],
  ['on-secondary-container', 'secondary-container', TEXT],
  ['on-tertiary-container', 'tertiary-container', TEXT],
  // errors
  ['error', 'background', TEXT],
  ['error', 'surface', TEXT],
  ['error', 'surface-container-high', TEXT],
  ['on-error', 'error', TEXT],
  ['on-error-container', 'error-container', TEXT],
  // the snack bar
  ['inverse-on-surface', 'inverse-surface', TEXT],
  ['inverse-primary', 'inverse-surface', TEXT],
  // the app bar
  ['on-bar', 'bar', TEXT],
  // outlines of controls: radio buttons, toggles, inputs
  ['outline', 'surface', NON_TEXT],
  ['outline', 'surface-container-high', NON_TEXT],
  ['on-surface-variant', 'surface', NON_TEXT],
  // chart series (--app-chart-1 … -5 in _seasons.scss) as lines and bars on paper
  ['primary', 'surface', NON_TEXT],
  ['secondary', 'surface', NON_TEXT],
  ['on-primary-container', 'surface', NON_TEXT],
  ['on-tertiary-container', 'surface', NON_TEXT],
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

let css;
try {
  const file = readdirSync(DIST).find((name) => /^styles.*\.css$/.test(name));
  css = readFileSync(join(DIST, file), 'utf8');
} catch {
  fail(`No stylesheet found in ${DIST} - run "npm run build" first.`);
}

/** The declarations of the first rule with exactly this selector. */
function block(selector) {
  const start = css.indexOf(`${selector}{`);
  if (start < 0) {
    fail(`The stylesheet has no rule "${selector}" - has the theme moved?`);
  }
  return css.slice(start + selector.length + 1, css.indexOf('}', start));
}

// one opaque colour, as the build writes it: #rgb, #rrggbb or rgb(r, g, b)
const COLOUR = String.raw`#[0-9a-fA-F]{3,6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)`;

function hex(value, where) {
  const channels = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value.trim());
  if (channels) {
    return channels.slice(1).map(Number);
  }
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) {
    fail(`${where}: "${value}" is not an opaque colour, which is all this check can read.`);
  }
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
}

/** name -> { light: [r, g, b], dark: [r, g, b] } for the colours declared in the rule. */
function colours(selector) {
  const declarations = block(selector);
  const found = {};
  for (const [, name, light, dark] of declarations.matchAll(
    new RegExp(
      String.raw`--mat-sys-([a-z0-9-]+):\s*light-dark\(\s*(${COLOUR})\s*,\s*(${COLOUR})\s*\)`,
      'g',
    ),
  )) {
    found[name] = {
      light: hex(light, `${selector} ${name}`),
      dark: hex(dark, `${selector} ${name}`),
    };
  }
  const bar = (scheme) => new RegExp(`--app-bar-${scheme}:\\s*([^;}]+)`).exec(declarations)?.[1];
  if (bar('light') && bar('dark')) {
    found['bar'] = { light: hex(bar('light'), 'bar'), dark: hex(bar('dark'), 'bar') };
  }
  const onBar = /--app-on-bar:\s*([^;}]+)/.exec(declarations)?.[1];
  if (onBar) {
    found['on-bar'] = { light: hex(onBar, 'on-bar'), dark: hex(onBar, 'on-bar') };
  }
  return found;
}

function luminance([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const shared = colours('html');
const problems = [];
let checked = 0;
let lowest = Infinity;

for (const season of SEASONS) {
  const selector = `html[data-season=${season}]`;
  const own = colours(selector);
  // The rule of a season is laid over `html`, which carries the default season: a colour this
  // script failed to read would silently be checked with the default's value instead.
  const declared = [...block(selector).matchAll(/--mat-sys-[a-z0-9-]+:/g)].length;
  const read = Object.keys(own).filter((name) => name !== 'bar').length;
  if (read !== declared || !own['bar']) {
    fail(`${selector}: read ${read} of ${declared} colours and the app bar - the check is blind.`);
  }
  const palette = { ...shared, ...own };
  for (const scheme of ['light', 'dark']) {
    for (const [foreground, background, minimum] of PAIRS) {
      if (!palette[foreground] || !palette[background]) {
        fail(`The stylesheet does not define "${foreground}" or "${background}" for ${season}.`);
      }
      const ratio = contrast(palette[foreground][scheme], palette[background][scheme]);
      checked++;
      if (minimum === TEXT) {
        lowest = Math.min(lowest, ratio);
      }
      if (ratio < minimum) {
        problems.push(
          `${season}, ${scheme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${minimum}:1`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error('The theme does not meet WCAG AA contrast:');
  problems.forEach((problem) => console.error(` - ${problem}`));
  process.exit(1);
}
console.log(
  `Contrast OK (${checked} pairs over ${SEASONS.length} seasons x light and dark; lowest text contrast ${lowest.toFixed(2)}:1).`,
);
