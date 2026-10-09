import { TestBed } from '@angular/core/testing';
import jsQR from 'jsqr';

import { QUIET_ZONE, QrCode, qrModules } from './qr-code';

/** A personal link, as the administration of the household builds it. */
const memberLink = (origin: string, name: string) => `${origin}/u/${encodeURIComponent(name)}`;

/** Pixels per module of the picture handed to the reader. */
const SCALE = 4;

/**
 * Reads a code the way a camera does: from a picture. The modules are painted black on white
 * with the quiet zone around them - what the component draws - and handed to a QR reader.
 */
function read(modules: boolean[][]): string | undefined {
  const side = (modules.length + 2 * QUIET_ZONE) * SCALE;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) {
        return;
      }
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const at = (((y + QUIET_ZONE) * SCALE + dy) * side + (x + QUIET_ZONE) * SCALE + dx) * 4;
          pixels.fill(0, at, at + 3);
        }
      }
    }),
  );
  return jsQR(pixels, side, side)?.data;
}

/** The modules a rendered component drew, read back from its SVG path. */
function drawn(element: HTMLElement): boolean[][] {
  const side =
    Number(element.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]) - 2 * QUIET_ZONE;
  const modules = Array.from({ length: side }, () => Array<boolean>(side).fill(false));
  const path = element.querySelector('path')!.getAttribute('d')!;
  for (const [, x, y] of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    modules[Number(y)][Number(x)] = true;
  }
  return modules;
}

describe('QrCode', () => {
  // what the administrator shows and the phone scans: the code has to hold the very link
  it.each(['Celina', 'Żaneta Łucja', 'a b/c?d'])(
    'reads back as the personal link of %o',
    (name) => {
      const link = memberLink('https://house.example', name);

      expect(read(qrModules(link))).toBe(link);
    },
  );

  it('draws the code it was given, with the margin a scanner needs', () => {
    const link = memberLink('https://house.example', 'Celina');
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('text', link);
    fixture.componentRef.setInput('label', 'QR code of the personal link');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(read(drawn(element))).toBe(link);
    expect(element.querySelector('svg')!.getAttribute('viewBox')).toMatch(
      new RegExp(`^-${QUIET_ZONE} -${QUIET_ZONE} `),
    );
    expect(element.querySelector('svg')!.getAttribute('aria-label')).toBe(
      'QR code of the personal link',
    );
  });

  it('draws another code for another text', () => {
    const fixture = TestBed.createComponent(QrCode);
    fixture.componentRef.setInput('label', 'code');
    fixture.componentRef.setInput('text', memberLink('https://house.example', 'Celina'));
    fixture.detectChanges();
    const first = (fixture.nativeElement as HTMLElement).querySelector('path')!.getAttribute('d');

    fixture.componentRef.setInput('text', memberLink('https://house.example', 'Borys'));
    fixture.detectChanges();

    expect(read(drawn(fixture.nativeElement as HTMLElement))).toBe('https://house.example/u/Borys');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('path')!.getAttribute('d'),
    ).not.toBe(first);
  });
});
