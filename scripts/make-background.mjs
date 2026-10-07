// Turns a source photo into the background of a view: two WebP files in `public/backgrounds/`
// (2560 and 1280 wide) and a sidecar `<name>.json` with the darkest and the lightest colour of
// the picture, which `check-contrast.mjs` lays under the haze and the glass to prove the text
// still reads. The prompt and the model behind a photo go into `public/backgrounds/README.md`.
//
//   node scripts/make-background.mjs <source.png|jpg> <name>
//
// The 2560 file stays under BUDGET: the quality is lowered until it does.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const OUT = fileURLToPath(new URL('../public/backgrounds', import.meta.url));
const WIDTHS = [2560, 1280];
const ASPECT = 16 / 9;
const BUDGET = 400 * 1024;
const QUALITIES = [82, 76, 70, 64, 58, 52];

const [source, name] = process.argv.slice(2);
if (!source || !/^[a-z][a-z0-9-]*$/.test(name ?? '')) {
  console.error('usage: node scripts/make-background.mjs <source> <name>  (name: a-z, 0-9, -)');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
// `.rotate()` applies the EXIF orientation, but `metadata()` reports the stored size: a photo
// shot in portrait (orientation 5-8) has its width and height the other way round.
const stored = await sharp(source).metadata();
const sideways = (stored.orientation ?? 1) >= 5;
const width = sideways ? stored.height : stored.width;
const height = sideways ? stored.width : stored.height;
const image = sharp(source).rotate();
if (width < WIDTHS[0]) {
  console.warn(`${source} is ${width} px wide; the 2560 variant will be upscaled.`);
}

const sizes = {};
for (const target of WIDTHS) {
  const file = join(OUT, `${name}-${target}.webp`);
  let quality;
  let encoded;
  for (quality of QUALITIES) {
    encoded = await image
      .clone()
      .resize({ width: target, height: Math.round(target / ASPECT), fit: 'cover' })
      .webp({ quality, effort: 6 })
      .toBuffer();
    if (target !== WIDTHS[0] || encoded.length <= BUDGET) {
      break;
    }
  }
  writeFileSync(file, encoded);
  sizes[target] = { bytes: encoded.length, quality };
  console.log(`${file}: ${Math.round(encoded.length / 1024)} kB at quality ${quality}`);
}
if (sizes[WIDTHS[0]].bytes > BUDGET) {
  console.error(`The ${WIDTHS[0]} variant does not fit ${BUDGET / 1024} kB even at quality ${QUALITIES.at(-1)}.`);
  process.exit(1);
}

// The extremes of the picture, from a coarse sample: a photo is never one colour, so the
// contrast check takes the darkest and the lightest patch as the two backgrounds the text can
// meet. A patch rather than a pixel - a single pixel of noise says nothing about what lies
// under a word. The top band of the frame is sampled on its own: the title of a page lies
// directly on it, while everything else sits on glass anywhere in the frame.
const SAMPLE = 48;
const TOP_BAND = 0.25;
const { data, info } = await image
  .clone()
  .resize({ width: SAMPLE, height: Math.round(SAMPLE / ASPECT), fit: 'cover' })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const extremes = (rows) => {
  let darkest = null;
  let lightest = null;
  for (let row = rows[0]; row < rows[1]; row++) {
    for (let col = 0; col < info.width; col++) {
      const i = (row * info.width + col) * info.channels;
      const rgb = [data[i], data[i + 1], data[i + 2]];
      const y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      if (darkest === null || y < darkest.y) darkest = { y, rgb };
      if (lightest === null || y > lightest.y) lightest = { y, rgb };
    }
  }
  return { darkest: hex(darkest.rgb), lightest: hex(lightest.rgb) };
};
const hex = ([r, g, b]) => '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');

const sidecar = {
  source: { width, height },
  files: Object.fromEntries(WIDTHS.map((w) => [`${name}-${w}.webp`, sizes[w]])),
  ...extremes([0, info.height]),
  top: extremes([0, Math.ceil(info.height * TOP_BAND)]),
};
writeFileSync(join(OUT, `${name}.json`), JSON.stringify(sidecar, null, 2) + '\n');
console.log(
  `darkest ${sidecar.darkest}, lightest ${sidecar.lightest}; top band ${sidecar.top.darkest} / ${sidecar.top.lightest} -> ${name}.json`,
);
