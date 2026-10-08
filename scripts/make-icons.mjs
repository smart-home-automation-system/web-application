// Renders the application icon (`public/icon.svg`) into the bitmaps browsers and phones ask for:
//
//  - `favicon.ico` (32 px, a PNG inside the ICO container - the fallback for a browser that does
//    not take the SVG from the tab),
//  - `apple-touch-icon.png` (180 px, the home screen of an iPhone, which never reads an SVG),
//  - `icons/icon-192.png`, `icons/icon-512.png` and `icons/icon-maskable-512.png`, the icons the
//    web app manifest names (`public/manifest.webmanifest`).
//
// The icon is drawn with rounded corners, which suits a browser tab. A home screen rounds the
// icon itself and paints what is transparent black, so the two it cuts to its own shape - the
// iPhone's and the maskable one - are rendered **without** the corners, the page filling the
// whole square. The house stays inside the middle 80 %, the part every mask keeps.
//
//   node scripts/make-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const rounded = readFileSync(`${PUBLIC}icon.svg`, 'utf8');

const ROUNDING = ' rx="15"';
const square = rounded.replaceAll(ROUNDING, '');
if (rounded.split(ROUNDING).length !== 3) {
  // the two rectangles of the page: a changed icon.svg must not silently keep its corners
  throw new Error(`icon.svg no longer rounds exactly two rectangles with${ROUNDING}`);
}

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toBuffer();

/** One PNG image wrapped in an ICO container (ICONDIR + one ICONDIRENTRY + the PNG as it is). */
function ico(image, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6); // width (256 is written as 0; not used here)
  header.writeUInt8(size, 7); // height
  header.writeUInt8(0, 8); // colours in palette: none
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.length, 14); // size of the image data
  header.writeUInt32LE(header.length, 18); // offset of the image data
  return Buffer.concat([header, image]);
}

mkdirSync(`${PUBLIC}icons`, { recursive: true });
writeFileSync(`${PUBLIC}favicon.ico`, ico(await png(rounded, 32), 32));
writeFileSync(`${PUBLIC}apple-touch-icon.png`, await png(square, 180));
writeFileSync(`${PUBLIC}icons/icon-192.png`, await png(rounded, 192));
writeFileSync(`${PUBLIC}icons/icon-512.png`, await png(rounded, 512));
writeFileSync(`${PUBLIC}icons/icon-maskable-512.png`, await png(square, 512));
console.log(
  'favicon.ico (32 px), apple-touch-icon.png (180 px) and icons/ (192, 512, maskable 512) written',
);
