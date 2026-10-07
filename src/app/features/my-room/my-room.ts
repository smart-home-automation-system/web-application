import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { ProfileStore } from '../../core/profile/profile-store';

/**
 * The page of a household member - a resident's whole application. For now it only says which
 * rooms the registry gives the active profile, or that it gives none: the place every resident
 * lands on has to exist before it has anything to show. Temperatures, schedules and the heating
 * switch arrive with the "My room" view proper (HAS-202).
 */
@Component({
  selector: 'app-my-room',
  imports: [MatCardModule, MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <header class="page-header">
        <h1>{{ t('myRoom.title') }}</h1>
      </header>

      <mat-card appearance="outlined" class="rooms card--domain">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>bed</mat-icon></div>
          <mat-card-title>{{ t('myRoom.rooms') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (rooms().length > 0) {
            <!-- identifiers of the registry, printed as they are: their names come with HAS-202 -->
            <ul class="rooms__list">
              @for (room of rooms(); track room) {
                <li>{{ room }}</li>
              }
            </ul>
          } @else {
            <p class="rooms__none">{{ t('myRoom.noRooms') }}</p>
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    .rooms {
      --app-domain: var(--app-domain-household);

      max-width: 480px;
    }

    mat-card-header {
      padding: 12px 12px 0;
    }

    mat-card-content {
      padding: 8px 12px 12px;
    }

    .rooms__list {
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-title-medium);
      letter-spacing: var(--mat-sys-title-medium-tracking);
      text-transform: capitalize;
    }

    .rooms__none {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyRoom {
  private readonly profile = inject(ProfileStore).profile;
  protected readonly rooms = computed(() => this.profile()?.rooms ?? []);
}
