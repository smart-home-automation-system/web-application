import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { hasPermission } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { HouseHeating } from './house-heating';

/**
 * The heating of the whole house for a member the registry granted `heating_switch` (HAS-438, owner
 * 2026-11-13): the switch left My room for a tab of its own. The route and the navigation entry ask for
 * the permission, so nobody else reaches the page; the card is still rendered only under the permission,
 * so a permission taken away under the open page polls nothing more while the shell leads away.
 */
@Component({
  selector: 'app-house-heating-page',
  imports: [TranslocoDirective, HouseHeating],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('nav.houseHeating') }}</h1>
      </header>
      <div class="card-row" data-testid="house-heating-page">
        @if (switchesHeating()) {
          <app-house-heating />
        }
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
export class HouseHeatingPage {
  private readonly profile = inject(ProfileStore).profile;

  protected readonly switchesHeating = computed(() =>
    hasPermission(this.profile(), 'heating_switch'),
  );
}
