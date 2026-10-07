// Fails when a colour of the theme no longer meets WCAG AA against the background it is used on.
//
// It reads the colours back from the production stylesheet - what ships, not what the Sass
// source intends - for each of the eight variants (four seasons, light and dark), and checks
// every pair of text and background the application and Angular Material combine:
// 4.5:1 for text, 3:1 for the outline of a control.
//
// Nothing on screen is painted in `surface` or `background` alone: the page glows in the colours
// of the season, the cards are translucent glass over that glow, and a domain card adds a wash
// of its colour. So the backgrounds below are composited the way the browser composites them
// (`glass`, `panel`, `page-glow`, `glass-domain-*`), from the alpha colours in the stylesheet
// and the strongest glow that can lie under each kind of text.
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
const DOMAINS = ['heating', 'water', 'boiler', 'household'];

// How much of the season's primary colour the glow (`--app-glow` in _seasons.scss) lays over
// the page: its strongest point sits under the panel, the page text next to it, the cards see
// the weaker ones. Keep in step with the percentages in `--app-glow`.
const GLOW_UNDER_PANEL = 0.3;
const GLOW_UNDER_PAGE_TEXT = 0.25;
const GLOW_UNDER_CARDS = 0.2;
// the wash of a domain card (`.card--domain` in styles.scss)
const DOMAIN_WASH = 0.18;
// A view with a photo (`view-background.scss`): the haze lays the page colour over the photo,
// thinnest at the top (HAZE_TOP - the bottom is thicker, so the top is the worst case), then a
// tint of the primary, and the glow is painted at half strength over a photo (shell.scss).
// Keep in step with the stylesheet.
const HAZE_TOP = { light: 0.45, dark: 0.66 };
const HAZE_TINT = { light: 0, dark: 0.1 };
const GLOW_OVER_PHOTO = 0.5;
// the darkest and the lightest patch of every photo, written by make-background.mjs
const PHOTOS = fileURLToPath(new URL('../public/backgrounds', import.meta.url));

// [foreground, background, minimum ratio]
const PAIRS = [
  // text straight on the page, next to the strongest glow it can meet
  ['on-background', 'page-glow', TEXT],
  ['on-surface-variant', 'page-glow', TEXT],
  // text on glass: plain and over the glow. A status or an error on glass is written in the
  // "container" shade of its colour (on-primary-container, on-error-container) - the plain
  // primary and error do not reach 4.5:1 on glass over a photo, so nothing uses them as text there
  ...['glass', 'glass-glow'].flatMap((background) => [
    ['on-surface', background, TEXT],
    ['on-surface-variant', background, TEXT],
    ['on-primary-container', background, TEXT],
    ['on-error-container', background, TEXT],
    ['outline', background, NON_TEXT],
  ]),
  // the navigation panel, which sits where the glow is strongest
  ['on-surface', 'panel', TEXT],
  ['on-surface-variant', 'panel', TEXT],
  ['primary', 'panel', TEXT],
  // body text and secondary text on every level of Material's surfaces (menus, snack bars)
  ...[
    'surface',
    'surface-container-low',
    'surface-container',
    'surface-container-high',
    'surface-container-highest',
  ].flatMap((background) => [
    ['on-surface', background, TEXT],
    ['on-surface-variant', background, TEXT],
  ]),
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
  ['error', 'surface-container-high', TEXT],
  ['on-error', 'error', TEXT],
  ['on-error-container', 'error-container', TEXT],
  // the snack bar
  ['inverse-on-surface', 'inverse-surface', TEXT],
  ['inverse-primary', 'inverse-surface', TEXT],
  // outlines of controls: radio buttons, toggles, inputs
  ['outline', 'surface', NON_TEXT],
  ['outline', 'surface-container-high', NON_TEXT],
  ['on-surface-variant', 'surface', NON_TEXT],
  // chart series (--app-chart-1 … -5 in _seasons.scss) as lines and bars on glass
  ['primary', 'glass', NON_TEXT],
  ['secondary', 'glass', NON_TEXT],
  ['on-primary-container', 'glass', NON_TEXT],
  ['on-tertiary-container', 'glass', NON_TEXT],
  // the domains (--app-domain-* in _seasons.scss): an icon on the domain colour, the colour as
  // a badge or an edge on glass and on the page, and text on the wash of a domain card
  ...DOMAINS.flatMap((domain) => [
    ['on-domain', `domain-${domain}`, TEXT],
    [`domain-${domain}`, 'glass', NON_TEXT],
    [`domain-${domain}`, 'page-glow', NON_TEXT],
    ['on-surface', `glass-domain-${domain}`, TEXT],
    ['on-surface-variant', `glass-domain-${domain}`, TEXT],
  ]),
];

// The same text over a photo: the page, the glass and the panel are composited again over the
// darkest and the lightest patch of every photo (`photo-<name>-<darkest|lightest>-<page|glass|panel>`).
const photos = readdirSync(PHOTOS)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name: name.slice(0, -'.json'.length),
    ...JSON.parse(readFileSync(join(PHOTOS, name), 'utf8')),
  }));
const PHOTO_PAIRS = photos.flatMap(({ name }) =>
  ['darkest', 'lightest'].flatMap((patch) => {
    const under = `photo-${name}-${patch}`;
    // the title of the page is the one text on the bare photo (styles.scss), and it lies at the
    // top, so it is checked over the top band of the picture; everything else sits on glass or
    // on the panel, anywhere in the frame
    return [
      ['on-background', `${under}-top-page`, TEXT],
      ['on-surface', `${under}-glass`, TEXT],
      ['on-surface-variant', `${under}-glass`, TEXT],
      ['on-primary-container', `${under}-glass`, TEXT],
      ['on-error-container', `${under}-glass`, TEXT],
      ['on-surface', `${under}-panel`, TEXT],
      ['on-surface-variant', `${under}-panel`, TEXT],
      ['primary', `${under}-panel`, TEXT],
    ];
  }),
);

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

/**
 * The declarations of the rule with exactly this selector that carries the theme - the one
 * declaring `--mat-sys-*` variables (the same selector also opens smaller rules, such as the root
 * font size of a wide screen inside a media query).
 */
function block(selector) {
  let start = css.indexOf(`${selector}{`);
  while (start >= 0) {
    const declarations = css.slice(start + selector.length + 1, css.indexOf('}', start));
    if (declarations.includes('--mat-sys-')) {
      return declarations;
    }
    start = css.indexOf(`${selector}{`, start + 1);
  }
  fail(`The stylesheet has no rule "${selector}" with the theme - has it moved?`);
}

// one colour, as the build may write it: #rgb, #rrggbb, #rrggbbaa, rgb(r, g, b),
// rgba(r, g, b, a) or rgb(r g b / a)
const COLOUR = String.raw`#[0-9a-fA-F]{3,8}|rgba?\([^()]*\)`;

/** [r, g, b, alpha] of a colour the build wrote. */
function parse(value, where) {
  const text = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = [...digits].map((d) => d + d).join('');
    }
    if (digits.length !== 6 && digits.length !== 8) {
      fail(`${where}: "${value}" is not a colour this check can read.`);
    }
    const channels = [0, 2, 4, 6]
      .filter((i) => i < digits.length)
      .map((i) => parseInt(digits.slice(i, i + 2), 16));
    return [channels[0], channels[1], channels[2], digits.length === 8 ? channels[3] / 255 : 1];
  }
  const fn = /^rgba?\(([^()]*)\)$/.exec(text);
  if (fn) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((part) => (part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part)));
    if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    }
  }
  fail(`${where}: "${value}" is not a colour this check can read.`);
}

/** `top` (with its alpha) painted over the opaque `bottom`. */
function over([r, g, b, alpha], bottom) {
  return [r, g, b].map((channel, i) => Math.round(alpha * channel + (1 - alpha) * bottom[i]));
}

/** `colour` mixed into `bottom` at `weight` (0..1) - what `color-mix(in srgb, …)` paints. */
function tint(colour, weight, bottom) {
  return over([...colour, weight], bottom);
}

/**
 * name -> { light: [r, g, b], dark: [r, g, b] } for the opaque colours declared in the rule -
 * Material's (`--mat-sys-*`) and the application's own (`--app-*`), written as `light-dark()`.
 * The translucent ones (the glass) keep their alpha, apart, under `translucent`.
 */
function colours(selector) {
  const declarations = block(selector);
  const found = { translucent: {} };
  for (const [, name, light, dark] of declarations.matchAll(
    new RegExp(
      String.raw`--(?:mat-sys|app)-([a-z0-9-]+):\s*light-dark\(\s*(${COLOUR})\s*,\s*(${COLOUR})\s*\)`,
      'g',
    ),
  )) {
    const where = `${selector} ${name}`;
    const pair = { light: parse(light, where), dark: parse(dark, where) };
    if (pair.light[3] === 1 && pair.dark[3] === 1) {
      found[name] = { light: pair.light.slice(0, 3), dark: pair.dark.slice(0, 3) };
    } else {
      found.translucent[name] = pair;
    }
  }
  return found;
}

/** The backgrounds nobody declares but everybody sees, for one season and scheme. */
function composited(palette, translucent, scheme) {
  const page = palette['background'][scheme];
  const primary = palette['primary'][scheme];
  const glass = translucent['glass'][scheme];
  const panel = translucent['glass-panel'][scheme];
  const derived = {
    'page-glow': tint(primary, GLOW_UNDER_PAGE_TEXT, page),
    glass: over(glass, page),
    'glass-glow': over(glass, tint(primary, GLOW_UNDER_CARDS, page)),
    panel: over(panel, tint(primary, GLOW_UNDER_PANEL, page)),
  };
  for (const domain of DOMAINS) {
    derived[`glass-domain-${domain}`] = tint(
      palette[`domain-${domain}`][scheme],
      DOMAIN_WASH,
      derived['glass-glow'],
    );
  }
  for (const photo of photos) {
    for (const patch of ['darkest', 'lightest']) {
      const under = parse(photo[patch], `${photo.name}.json ${patch}`).slice(0, 3);
      // the haze, the tint, then the (halved) glow - what the page is over a photo
      const hazed = tint(primary, HAZE_TINT[scheme], tint(page, HAZE_TOP[scheme], under));
      const name = `photo-${photo.name}-${patch}`;
      const top = parse(photo.top[patch], `${photo.name}.json top.${patch}`).slice(0, 3);
      derived[`${name}-top-page`] = tint(
        primary,
        GLOW_UNDER_PAGE_TEXT * GLOW_OVER_PHOTO,
        tint(primary, HAZE_TINT[scheme], tint(page, HAZE_TOP[scheme], top)),
      );
      derived[`${name}-glass`] = over(
        glass,
        tint(primary, GLOW_UNDER_CARDS * GLOW_OVER_PHOTO, hazed),
      );
      derived[`${name}-panel`] = over(
        panel,
        tint(primary, GLOW_UNDER_PANEL * GLOW_OVER_PHOTO, hazed),
      );
    }
  }
  return derived;
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
for (const name of ['glass', 'glass-panel']) {
  if (!shared.translucent[name]) {
    fail(`html: --app-${name} was not read - the check is blind.`);
  }
}
const problems = [];
let checked = 0;
let lowest = Infinity;
let lowestPair = '';

for (const season of SEASONS) {
  const selector = `html[data-season=${season}]`;
  const own = colours(selector);
  // The rule of a season is laid over `html`, which carries the default season: a colour this
  // script failed to read would silently be checked with the default's value instead.
  const declared = [...block(selector).matchAll(/--mat-sys-[a-z0-9-]+:/g)].length;
  const read = Object.keys(own).filter((name) => name !== 'translucent').length;
  if (read !== declared) {
    fail(`${selector}: read ${read} of ${declared} colours - the check is blind.`);
  }
  const palette = { ...shared, ...own };
  for (const scheme of ['light', 'dark']) {
    const backgrounds = composited(palette, shared.translucent, scheme);
    const colour = (name) => backgrounds[name] ?? palette[name]?.[scheme];
    for (const [foreground, background, minimum] of [...PAIRS, ...PHOTO_PAIRS]) {
      if (!colour(foreground) || !colour(background)) {
        fail(`The stylesheet does not define "${foreground}" or "${background}" for ${season}.`);
      }
      const ratio = contrast(colour(foreground), colour(background));
      checked++;
      if (minimum === TEXT && ratio < lowest) {
        lowest = ratio;
        lowestPair = `${foreground} on ${background}, ${season} ${scheme}`;
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
  `Contrast OK (${checked} pairs over ${SEASONS.length} seasons x light and dark, ${photos.length} photo(s); lowest text contrast ${lowest.toFixed(2)}:1, ${lowestPair}).`,
);
