import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { hasPermission } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { AmplifierUnlock } from './amplifier-unlock';

/**
 * The audio and video equipment of the house - the page of `media-service` (HAS-517, owner 2026-11-27: a page of its
 * own, built as the heating of the house, `HouseHeatingPage`, and named after the service, since the televisions and
 * the other equipment of that kind are to come to it). Today it holds the unlock of the amplifier alone, for a member
 * the registry granted `amplifier_unlock` - the route and the navigation entry ask for that permission, so nobody else
 * reaches the page, the administrator neither without it. A card for the administrator added later changes who may
 * open the page (`data.access` of the route and its entry) together with it.
 *
 * Every card is still rendered only under what it needs, so a permission taken away under the open page leaves
 * nothing to press while the shell leads away.
 */
@Component({
  selector: 'app-media-page',
  imports: [TranslocoDirective, AmplifierUnlock],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('nav.media') }}</h1>
      </header>
      <div class="card-row" data-testid="media-page">
        @if (unlocksAmplifier()) {
          <app-amplifier-unlock />
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
export class MediaPage {
  private readonly profile = inject(ProfileStore).profile;

  protected readonly unlocksAmplifier = computed(() =>
    hasPermission(this.profile(), 'amplifier_unlock'),
  );
}
