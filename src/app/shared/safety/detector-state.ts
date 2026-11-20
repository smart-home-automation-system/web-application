import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { Detector } from '../../data-access/safety/safety-api';
import { DETECTOR_STATE_ICONS, DETECTOR_STATE_LABELS, detectorStateOf } from './safety-labels';

/**
 * The state of a detector at a glance (HAS-469): a word and an icon on a strip in the colour of the state - the alarm
 * red, muted and off the base amber, all right in the season's tint, not known dashed. The colour is never the only
 * sign: the word and the icon say it too. The pairs of colours are those `check:contrast` knows.
 */
@Component({
  selector: 'app-detector-state',
  imports: [MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <span class="state" [attr.data-state]="state()" data-testid="detector-state">
        <mat-icon aria-hidden="true">{{ ICONS[state()] }}</mat-icon>
        <span>{{ t(LABELS[state()]) }}</span>
      </span>
    </ng-container>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    .state {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 10px 2px 6px;
      border: 1px solid transparent;
      border-radius: var(--mat-sys-corner-full);
      font: var(--mat-sys-label-large);
      white-space: nowrap;

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .state[data-state='alarm'] {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .state[data-state='muted'],
    .state[data-state='offline'] {
      background: var(--app-warning-container);
      color: var(--app-on-warning-container);
    }

    .state[data-state='ok'] {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .state[data-state='unknown'] {
      border: 1px dashed var(--mat-sys-outline);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectorState {
  readonly detector = input.required<Detector>();

  protected readonly LABELS = DETECTOR_STATE_LABELS;
  protected readonly ICONS = DETECTOR_STATE_ICONS;
  protected readonly state = computed(() => detectorStateOf(this.detector()));
}
