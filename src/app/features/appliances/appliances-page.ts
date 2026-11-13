import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
  imports: [TranslocoDirective, NgTemplateOutlet, Appliances, HouseholdAppliances, MyChores],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('appliances.page.title') }}</h1>
      </header>
      <ng-template #household>
        <div class="card-row" data-testid="household-appliances-row">
          <app-household-appliances />
          <app-my-chores />
        </div>
      </ng-template>
      <!-- the administrator's part opens with the strip of its calls, the first card of every view (owner
           2026-11-13), and takes the cards of every member under it -->
      @if (isAdmin()) {
        <app-appliances>
          <ng-container [ngTemplateOutlet]="household" />
        </app-appliances>
      } @else {
        <ng-container [ngTemplateOutlet]="household" />
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
