// Renders the application icon (`public/icon.svg`) into the two bitmaps browsers and phones ask
// for: `favicon.ico` (32 px, a PNG inside the ICO container - the fallback for a browser that
// does not take the SVG from the tab) and `apple-touch-icon.png` (180 px, the home screen of an
// iPhone, which never reads an SVG).
//
//   node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const svg = readFileSync(`${PUBLIC}icon.svg`);

const png = (size) => sharp(svg, { density: (72 * size) / 64 }).resize(size, size).png().toBuffer();

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

writeFileSync(`${PUBLIC}favicon.ico`, ico(await png(32), 32));
writeFileSync(`${PUBLIC}apple-touch-icon.png`, await png(180));
console.log('favicon.ico (32 px) and apple-touch-icon.png (180 px) written');
