import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { ProfileStore } from '../../core/profile/profile-store';
import { Appliances } from './appliances';
import { HouseholdAppliances } from './household-appliances';
import { MyChores } from './my-chores';

/**
 * The appliances page (HAS-438, owner 2026-11-13): one page for every member, so the administrator does
 * not get two entries. Every member sees the appliances with "Emptied" (`HouseholdAppliances`, HAS-282)
 * and their chores of the month (`MyChores`, HAS-346) - the cards that left My room. The administrator
 * also gets what tunes the thresholds (`Appliances`, HAS-283): it is created only for them, so a resident
 * never reads the device registry nor the cycles of the appliances.
 */
@Component({
  selector: 'app-appliances-page',
  imports: [TranslocoDirective, Appliances, HouseholdAppliances, MyChores],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('appliances.page.title') }}</h1>
      </header>
      <div class="card-row" data-testid="household-appliances-row">
        <app-household-appliances />
        <app-my-chores />
      </div>
      @if (isAdmin()) {
        <app-appliances />
      }
    </ng-container>
  `,
  // a column as the administrator's part lays itself out: the cards of every member first, the rest under them
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppliancesPage {
  private readonly profile = inject(ProfileStore).profile;

  protected readonly isAdmin = computed(() => this.profile()?.role === 'admin');
}
