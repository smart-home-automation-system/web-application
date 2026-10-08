import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { LocalDateTimePipe } from '../../shared/local-date-time/local-date-time.pipe';
import { ConnectionStore } from '../api/connection-store';
import { ProfileStore } from '../profile/profile-store';
import { AppUpdate } from '../pwa/app-update';
import { Ticker } from '../time/ticker';

/** How often the house is asked again while it does not answer and the page is in view. */
export const ASK_AGAIN_MS = 30_000;

const TIME_ONLY: Intl.DateTimeFormatOptions = { timeStyle: 'short' };
const DATE_AND_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * What concerns every page, above the open one: that the house cannot be reached - with the time
 * it last answered - and that a newer version of the application is waiting.
 *
 * One call that got no answer does not raise the banner - a single service that hangs looks the
 * same - so at the first doubt the household registry is asked here, at once: its answer clears
 * the doubt, its silence raises the banner. The banner goes when a call is answered. A page
 * without polling asks nothing by itself, so while the banner is up the registry is asked again
 * - on request, every half a minute and the moment the device is back online. It is the one
 * call every page can afford, and its answer also brings the profile up to date.
 */
@Component({
  selector: 'app-notices',
  imports: [MatButtonModule, MatIconModule, TranslocoDirective, LocalDateTimePipe],
  template: `
    <ng-container *transloco="let t">
      @if (connection.offline()) {
        <div class="notice notice--offline" data-testid="offline-notice">
          <mat-icon class="notice__icon">cloud_off</mat-icon>
          <p class="notice__text">
            {{ t('connection.offline') }}
            @if (connection.lastContact(); as contact) {
              <span class="notice__detail">{{
                t('connection.lastContact', { time: contact | localDateTime: contactFormat() })
              }}</span>
            }
          </p>
          <!-- never disabled: a question already on its way is shared, and a button that
               switches off under the finger loses the focus -->
          <button matButton type="button" (click)="askAgain()">
            {{ t('connection.retry') }}
          </button>
        </div>
      }
      @if (update.available()) {
        <div class="notice notice--update" data-testid="update-notice">
          <mat-icon class="notice__icon">system_update</mat-icon>
          <p class="notice__text">{{ t('update.available') }}</p>
          <button matButton type="button" (click)="update.reload()">
            {{ t('update.reload') }}
          </button>
        </div>
      }
    </ng-container>
  `,
  styleUrl: './notices.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // what appears here is said aloud by a screen reader, without taking the focus
  host: { 'aria-live': 'polite' },
})
export class Notices {
  protected readonly connection = inject(ConnectionStore);
  protected readonly update = inject(AppUpdate);
  private readonly profiles = inject(ProfileStore);
  private readonly document = inject(DOCUMENT);
  private readonly ticker = inject(Ticker);

  /** The time alone while it is of today; with its date once it is older. */
  protected readonly contactFormat = computed(() => {
    const contact = this.connection.lastContact();
    return contact !== undefined && sameDay(contact, this.ticker.now()) ? TIME_ONLY : DATE_AND_TIME;
  });

  constructor() {
    effect(() => {
      if (this.connection.doubted() && !this.connection.offline()) {
        this.askAgain();
      }
    });
    effect((onCleanup) => {
      if (!this.connection.offline()) {
        return;
      }
      const timer = setInterval(() => {
        if (this.document.visibilityState === 'visible') {
          this.askAgain();
        }
      }, ASK_AGAIN_MS);
      onCleanup(() => clearInterval(timer));
    });

    const view = this.document.defaultView;
    const onOnline = () => this.askAgain();
    view?.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => view?.removeEventListener('online', onOnline));
  }

  protected askAgain(): void {
    void this.profiles.refresh();
  }
}

function sameDay(first: number, second: number): boolean {
  return new Date(first).toDateString() === new Date(second).toDateString();
}
