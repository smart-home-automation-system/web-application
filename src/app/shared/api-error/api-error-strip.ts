import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { ApiError } from '../../core/api/api-error';
import { DisplayTextPipe } from '../display-text/display-text.pipe';
import { describeApiError } from './describe-api-error';

/**
 * Why the last call of a polled resource failed, as a strip inside the card that shows its data:
 * `<app-api-error-strip [error]="resource.error()" />`. Renders nothing while there is no error.
 * The last value stays on screen next to it, marked stale by `<app-data-freshness>`.
 */
@Component({
  selector: 'app-api-error-strip',
  imports: [MatIconModule, DisplayTextPipe],
  template: `
    @if (error(); as failure) {
      <p class="strip" role="alert">
        <mat-icon>cloud_off</mat-icon>
        <span>{{ describe(failure) | displayText }}</span>
      </p>
    }
  `,
  styles: `
    // on its own tinted strip, whose text colour is made for it - the error red alone does not
    // reach 4.5:1 on glass over a bright patch of a photo
    .strip {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 12px 0 0;
      padding: 8px 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-error-container);
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-error-container);
    }

    mat-icon {
      flex: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiErrorStrip {
  readonly error = input.required<ApiError | undefined>();
  protected readonly describe = describeApiError;
}
