import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

/**
 * A red light blinking next to the title of a card (owner, 2026-10-21, HAS-266): what somebody
 * should look at - the silent temperature sensors on the overview and on the heating page. Its
 * words are the tooltip and what a screen reader hears; steady for somebody who asked the system
 * for less motion. The page renders it only while there is something to say.
 *
 * Everything is on the element itself, so a `data-testid` the page gives it finds the words.
 */
@Component({
  selector: 'app-signal-light',
  template: '',
  hostDirectives: [MatTooltip],
  host: {
    role: 'img',
    tabindex: '0',
    '[attr.aria-label]': 'text()',
  },
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--mat-sys-error);
      box-shadow: 0 0 8px 2px color-mix(in srgb, var(--mat-sys-error) 70%, transparent);
      animation: signal-blink 1.2s ease-in-out infinite;
      cursor: help;

      &:focus-visible {
        outline: 2px solid var(--mat-sys-on-surface);
        outline-offset: 3px;
      }

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    }

    @keyframes signal-blink {
      0%,
      100% {
        opacity: 1;
      }

      50% {
        opacity: 0.25;
        box-shadow: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignalLight {
  /** The words of the light, already translated. */
  readonly text = input.required<string>();

  constructor() {
    const tooltip = inject(MatTooltip);
    // a touch shows nothing: on a phone the words are what the card says next to it
    tooltip.touchGestures = 'off';
    effect(() => {
      tooltip.message = this.text();
    });
  }
}
