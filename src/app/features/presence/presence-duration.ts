import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { Duration } from './day-lanes';

/** A length of time in words: "7 h 42 min", or "42 min" under an hour. */
@Component({
  selector: 'app-presence-duration',
  imports: [TranslocoDirective],
  template: `
    <ng-container *transloco="let t">{{
      t(
        duration().hours > 0 ? 'presence.duration.hoursMinutes' : 'presence.duration.minutes',
        duration()
      )
    }}</ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresenceDuration {
  readonly duration = input.required<Duration>();
}
