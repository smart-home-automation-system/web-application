import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { hasPermission } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { AmplifierUnlock } from './amplifier-unlock';

/**
 * The audio and video equipment of the house - the page of `media-service` (HAS-517, owner 2026-11-27: a page of its
 * own, built as the heating of the house, `HouseHeatingPage`, and named after the service, since the televisions and
 * the other equipment of that kind are to come to it). **The administrator's page** (owner, 2026-11-27, the pattern of
 * the heating: the administrator has all of it, a resident one thing): `data.openedBy` of the route opens it to a member
 * granted `amplifier_unlock`, who sees the unlock of the amplifier alone. A card added later for the administrator is
 * rendered for the role alone; the backend blocks nothing by either.
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

  /** The administrator sees every card; a member granted amplifier_unlock the unlock of the amplifier alone. */
  protected readonly unlocksAmplifier = computed(
    () => this.profile()?.role === 'admin' || hasPermission(this.profile(), 'amplifier_unlock'),
  );
}
