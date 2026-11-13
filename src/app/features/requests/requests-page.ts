import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { MyRequests } from './my-requests';

/**
 * The requests of the household (HAS-438, owner 2026-11-13): the card of HAS-411 on a page of its own,
 * for every member - it is the household's, not a room's, so it left My room. The page adds nothing to
 * the card: the list, the form and the calls are `MyRequests`'.
 */
@Component({
  selector: 'app-requests-page',
  imports: [TranslocoDirective, MyRequests],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('nav.requests') }}</h1>
      </header>
      <div class="card-row" data-testid="requests-page">
        <app-my-requests />
      </div>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsPage {}
