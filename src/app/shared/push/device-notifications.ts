import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { ProfileStore } from '../../core/profile/profile-store';
import { PushSubscriptionStore } from '../../core/push/push-subscription-store';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../api-error/describe-api-error';
import { DisplayTextPipe } from '../display-text/display-text.pipe';

/** The refusals of the registry this card words itself (`database-service`, HAS-272). */
export const PUSH_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  MEMBER_SWITCHED_OFF: 'push.error.memberSwitchedOff',
  NOT_FOUND_HOUSEHOLD_MEMBER: 'push.error.memberNotFound',
};

/**
 * "Notifications on this device" (HAS-284): the switch of the Web Push of this browser for the
 * member on the page, on My room for every member and on the settings. It tells every state the
 * browser can be in - a tab of Safari on an iPhone leads to the personal link, from which the
 * application is added to the home screen (the icon opens the address it was added from, so it has
 * to be added from there, never from this page).
 * <p>
 * The switch does not flip itself (`disableToggleValue`): it shows what the store says was stored.
 * It is never disabled - a tap while a change is on its way is ignored, and a control that switches
 * off under the finger loses the focus.
 */
@Component({
  selector: 'app-device-notifications',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    RouterLink,
    TranslocoDirective,
    DisplayTextPipe,
  ],
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card
        appearance="outlined"
        class="notifications card--domain"
        data-testid="device-notifications"
      >
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>notifications</mat-icon></div>
          <mat-card-title>{{ t('push.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content class="notifications__content" [attr.data-state]="push.state()">
          @switch (push.state()) {
            @case ('checking') {
              <mat-progress-bar mode="indeterminate" [attr.aria-label]="t('push.checking')" />
            }
            @case ('install') {
              <p class="notifications__text">{{ t('push.install') }}</p>
              @if (personalLink(); as link) {
                <a matButton="tonal" [routerLink]="link" data-testid="personal-link">
                  <mat-icon>add_to_home_screen</mat-icon>
                  {{ t('push.installLink') }}
                </a>
              }
            }
            @case ('unsupported') {
              <p class="notifications__text">{{ t('push.unsupported') }}</p>
            }
            @case ('unconfigured') {
              <p class="notifications__text">{{ t('push.unconfigured') }}</p>
            }
            @case ('denied') {
              <p class="notifications__text">{{ t('push.denied') }}</p>
            }
            @default {
              <p class="notifications__text">{{ t('push.lead') }}</p>
              <mat-slide-toggle
                data-testid="push-switch"
                [checked]="push.state() === 'on'"
                (toggleChange)="toggle()"
              >
                {{ t('push.switch') }}
              </mat-slide-toggle>
              @if (push.busy()) {
                <p class="notifications__text" data-testid="push-busy">{{ t('push.busy') }}</p>
              }
            }
          }
          @if (failure(); as text) {
            <p class="notifications__failure" role="alert" data-testid="push-failure">
              {{ text | displayText }}
            </p>
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    .notifications {
      --app-domain: var(--app-domain-household);
    }

    mat-card-header {
      padding: 12px 12px 0;
    }

    .notifications__content {
      display: grid;
      gap: 10px;
      justify-items: start;
      padding: 8px 12px 12px;
    }

    .notifications__text {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    mat-progress-bar {
      justify-self: stretch;
    }

    .notifications__failure {
      margin: 0;
      padding: 6px 10px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      font: var(--mat-sys-body-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceNotifications {
  protected readonly push = inject(PushSubscriptionStore);
  private readonly profiles = inject(ProfileStore);

  /** The personal link of the member - the page the application is added to the home screen from. */
  protected readonly personalLink = computed(() => {
    const name = this.profiles.profile()?.name;
    return name === undefined ? undefined : ['/u', name];
  });

  protected readonly failure = computed<DisplayText | undefined>(() => {
    const failure = this.push.failure();
    if (failure === undefined) {
      return undefined;
    }
    if (failure.kind === 'browser') {
      return { key: 'push.browserFailed' };
    }
    return describePushError(failure.error);
  });

  protected toggle(): void {
    if (this.push.state() === 'on') {
      void this.push.disable();
    } else {
      void this.push.enable();
    }
  }
}

export function describePushError(error: ApiError): DisplayText {
  const named = Object.entries(PUSH_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}
