import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { encode } from 'uqr';

/** The margin a scanner needs around a code, in modules - the standard asks for four. */
export const QUIET_ZONE = 4;

/**
 * The modules of the QR code of a text, row by row: `true` is a dark one. Error correction M
 * (15 %) - the code is shown on a screen, where nothing covers or scratches it.
 */
export function qrModules(text: string): boolean[][] {
  return encode(text, { ecc: 'M', border: 0 }).data;
}

/**
 * A text as a QR code, drawn as SVG: `<app-qr-code [text]="link" [label]="t('…')" />`. Its size
 * is that of its box; it stays square.
 *
 * **Black on white in every theme** - the one place where colours are literals: a scanner needs
 * dark modules on a light ground, and a code in the colours of the dark scheme is not read.
 */
@Component({
  selector: 'app-qr-code',
  template: `
    <svg
      role="img"
      shape-rendering="crispEdges"
      [attr.viewBox]="viewBox()"
      [attr.aria-label]="label()"
    >
      <rect class="paper" [attr.x]="-quiet" [attr.y]="-quiet" width="100%" height="100%" />
      <path class="ink" [attr.d]="path()" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      aspect-ratio: 1;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: var(--mat-sys-corner-small);
    }

    .paper {
      fill: #fff;
    }

    .ink {
      fill: #000;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCode {
  readonly text = input.required<string>();
  /** What a screen reader says the picture is, in the active language. */
  readonly label = input.required<string>();

  protected readonly quiet = QUIET_ZONE;
  private readonly modules = computed(() => qrModules(this.text()));

  protected readonly viewBox = computed(() => {
    const side = this.modules().length + 2 * QUIET_ZONE;
    return `${-QUIET_ZONE} ${-QUIET_ZONE} ${side} ${side}`;
  });

  /** One square per dark module. */
  protected readonly path = computed(() =>
    this.modules()
      .flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])))
      .join(''),
  );
}
