import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { AppliancesControl } from '../../data-access/appliance/appliance-api';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { PushSubscriptionStore } from '../push/push-subscription-store';
import {
  ApplianceView,
  acknowledgeFailureOf,
  awaiting,
  cycleTimeFormat,
  toApplianceViews,
} from '../../shared/appliances/appliance-views';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { Detector } from '../../data-access/safety/safety-api';
import { SafetyStatusStore, SafetyStore } from '../../data-access/safety/safety-store';
import {
  commandFailureOf,
  detectorName,
  detectorsInAlarm,
  silentBases,
} from '../../shared/safety/safety-labels';
import { safetyQuestion } from '../../shared/safety/safety-question';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

import { LocalDateTimePipe } from '../../shared/local-date-time/local-date-time.pipe';
import { APP_CONFIG } from '../config/app-config';
import { ConnectionStore } from '../api/connection-store';
import { ProfileStore } from '../profile/profile-store';
import { AppUpdate } from '../pwa/app-update';
import { houseDay } from '../time/house-date-time';
import { Ticker } from '../time/ticker';

/** How often the house is asked again while it does not answer and the page is in view. */
export const ASK_AGAIN_MS = 30_000;

const TIME_ONLY: Intl.DateTimeFormatOptions = { timeStyle: 'short' };
const DATE_AND_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * What concerns every page, above the open one: that the house cannot be reached - with the time
 * it last answered -, that a smoke detector is in alarm (HAS-469, for a member with a profile, never
 * closed by hand: muted here by the administrator, after a question - and a silent base station of the
 * detectors, for the administrator), that an appliance has finished and waits to be emptied (HAS-282,
 * for a member with a profile: acknowledged here, or closed for the visit), and that a newer version of
 * the application is waiting.
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
  imports: [
    MatButtonModule,
    MatIconModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseDateTimePipe,
    LocalDateTimePipe,
  ],
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
      <!-- HAS-469: a fire alarm - one red strip per detector in alarm, for every member with a profile, never closed
           by hand; the mute for the administrator alone, after a question; nothing while the call fails -->
      @for (detector of fires(); track detector.id) {
        <div class="notice notice--fire" data-testid="fire-notice" [attr.data-detector]="detector.id">
          <mat-icon class="notice__icon">local_fire_department</mat-icon>
          <p class="notice__text">
            <!-- the room and the detector of the registry, printed beside the words: never a translation -->
            <strong>{{ t('safety.banner.alarm') }}</strong>&ngsp;{{ detector.room ?? '' }}&ngsp;·&ngsp;{{
              detectorName(detector)
            }}
            @if (detector.muted?.value === true) {
              <span class="notice__detail" data-testid="fire-notice-muted">{{
                t('safety.banner.muted')
              }}</span>
            }
            @if (fireFailure(detector); as failure) {
              <span class="notice__detail" data-testid="fire-notice-failure">{{
                failure | displayText
              }}</span>
            }
          </p>
          @if (isAdmin() && detector.muted?.value !== true) {
            <div class="notice__actions">
              <!-- never disabled: a press while a question or the command is on its way is ignored -->
              <button
                matButton
                type="button"
                data-testid="fire-notice-mute"
                (click)="muteFire(detector)"
              >
                {{ t('safety.mute') }}
              </button>
            </div>
          }
        </div>
      }
      <!-- HAS-469: a base station of the detectors the technical monitor calls silent - the administrator's -->
      @if (silentBases().length > 0) {
        <div class="notice notice--warning" data-testid="safety-base-notice">
          <mat-icon class="notice__icon">router</mat-icon>
          <p class="notice__text">
            {{ t('safety.banner.silentBase') }}&ngsp;{{ silentBases().join(', ') }}
          </p>
        </div>
      }
      <!-- HAS-282: a finished appliance waits to be emptied - one strip each, for every member with
           a profile; nothing while the call fails (the card of "My room" tells that) -->
      @for (appliance of finished(); track appliance.id) {
        <div class="notice notice--appliance" data-testid="appliance-notice">
          <mat-icon class="notice__icon">local_laundry_service</mat-icon>
          <p class="notice__text">
            <!-- the name of the registry, printed as it is: never a translation -->
            {{ t('appliances.notice.finished') }}&ngsp;{{ appliance.name }}&ngsp;{{
              t('appliances.notice.waits')
            }}
            @if (appliance.awaitingSince; as since) {
              <span class="notice__detail">{{
                t('appliances.notice.since', { time: since | houseDateTime: sinceFormat(since) })
              }}</span>
            }
            @if (failureFor(appliance.id); as failure) {
              <span class="notice__detail" data-testid="appliance-notice-failure">{{
                failure | displayText
              }}</span>
            }
          </p>
          <!-- the commands in the bottom right corner, "Emptied" last (HAS-438, owner 2026-11-13) -->
          <div class="notice__actions">
            <!-- HAS-346: the administrator stops the reminders without claiming the chore - the cycle stays
                 unattributed (owner 2026-10-30: "Emptied" with the member counts as the chore, for everybody) -->
            @if (isAdmin()) {
              <button matButton type="button" data-testid="appliance-notice-mute" (click)="mute(appliance.id)">
                {{ t('appliances.mute') }}
              </button>
            }
            <!-- never disabled: a press while one is on its way is ignored, and a button that switches
                 off under the finger loses the focus -->
            <button matButton type="button" (click)="acknowledge(appliance.id)">
              {{ t('appliances.acknowledge') }}
            </button>
          </div>
          <!-- the close of a window: always in the top right corner -->
          <button
            class="notice__close"
            matIconButton
            type="button"
            [attr.aria-label]="t('appliances.notice.dismiss') + ' ' + appliance.name"
            (click)="dismiss(appliance)"
          >
            <mat-icon>close</mat-icon>
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
  // the administrator's "mute the reminders" (HAS-346): nobody else sees it
  protected readonly isAdmin = computed(() => this.profiles.profile()?.role === 'admin');
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

  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  // the day of the house now: a cycle that finished on another one is told with its date
  private readonly today = computed(() => houseDay(this.ticker.now(), this.zone));
  private readonly injector = inject(Injector);
  /**
   * The appliances of the application (`ApplianceStore`), taken once a member has a profile: the
   * pages around the profiles poll nothing for them, and the polling then lives with the store.
   */
  private readonly appliances = signal<AppliancesControl | undefined>(undefined);
  /** The finished cycles somebody closed for this visit, by appliance and the time it began to wait. */
  private readonly dismissed = signal<ReadonlySet<string>>(new Set());

  /**
   * The finished appliances to announce. Nothing while the last call failed - the strip would tell
   * a state the service may no longer have - and nothing that was closed for this visit; a cycle
   * that finishes later waits since another time, so it is announced again.
   */
  protected readonly finished = computed(() => {
    const control = this.appliances();
    if (
      control === undefined ||
      this.profiles.profile() === undefined ||
      control.error() !== undefined
    ) {
      return [];
    }
    const closed = this.dismissed();
    return awaiting(toApplianceViews(control.value())).filter(
      (appliance) => !closed.has(dismissKey(appliance)),
    );
  });

  private readonly destroyRef = inject(DestroyRef);

  private readonly startAppliances = effect(() => {
    if (this.profiles.profile() !== undefined && untracked(this.appliances) === undefined) {
      const appliances = untracked(() => this.injector.get(ApplianceStore).appliances);
      this.appliances.set(appliances);
      // HAS-284: the notifications of this device are checked at every start, and a push that
      // arrives while the application is open is told by the strip at once - not at the next poll
      untracked(() =>
        this.injector
          .get(PushSubscriptionStore)
          .messages.pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => void appliances.refresh()),
      );
    }
  });

  // ---- HAS-469: the fire detectors ----

  /**
   * The detectors of the application (`SafetyStore`), taken once a member has a profile - like the appliances: the
   * pages around the profiles poll nothing for them.
   */
  private readonly safety = signal<SafetyStore | undefined>(undefined);
  /** The technical monitor (`SafetyStatusStore`), taken once the profile is the administrator's. */
  private readonly safetyStatus = signal<SafetyStatusStore | undefined>(undefined);
  private readonly fireQuestion = safetyQuestion();
  protected readonly detectorName = detectorName;

  private readonly startSafety = effect(() => {
    if (this.profiles.profile() !== undefined && untracked(this.safety) === undefined) {
      this.safety.set(untracked(() => this.injector.get(SafetyStore)));
    }
    if (this.isAdmin() && untracked(this.safetyStatus) === undefined) {
      this.safetyStatus.set(untracked(() => this.injector.get(SafetyStatusStore)));
    }
  });

  /**
   * The detectors in alarm. Nothing while the last call failed - the strip would tell an alarm the service may no
   * longer have (the page and the tile tell the failure) - and nothing without a profile.
   */
  protected readonly fires = computed(() => {
    const store = this.safety();
    if (
      store === undefined ||
      this.profiles.profile() === undefined ||
      store.safety.error() !== undefined
    ) {
      return [];
    }
    return detectorsInAlarm(store.safety.value());
  });

  /** The silent bases, for the administrator alone; nothing while the monitor's call fails. */
  protected readonly silentBases = computed(() => {
    const store = this.safetyStatus();
    if (!this.isAdmin() || store === undefined || store.status.error() !== undefined) {
      return [];
    }
    return silentBases(store.status.value()?.bases);
  });

  /** How the last mute of this detector failed, in words. */
  protected fireFailure(detector: Detector) {
    const state = this.safety()?.commands.stateOf(SafetyStore.keyOf(detector.id ?? -1, 'mute'));
    return state?.error === undefined ? undefined : commandFailureOf(state);
  }

  /** The mute of the administrator, after a question that goes once the alarm is over. */
  protected muteFire(detector: Detector): void {
    const id = detector.id;
    if (id === undefined || !this.isAdmin()) {
      return;
    }
    void this.fireQuestion.ask(id, 'mute', () =>
      this.fires().some((candidate) => candidate.id === id),
    );
  }

  protected sinceFormat(since: string): Intl.DateTimeFormatOptions {
    return cycleTimeFormat(since, this.today());
  }

  /** The failed acknowledgement of this appliance, in words. */
  protected failureFor(id: number) {
    const failure = this.appliances()?.acknowledgeFailure();
    return failure?.id === id ? acknowledgeFailureOf(failure) : undefined;
  }

  protected acknowledge(id: number): void {
    this.appliances()?.acknowledge(id, this.profiles.profile()?.name);
  }

  /** Without a member: the reminders stop and the cycle is nobody's chore (appliance-service >= 0.8.0). */
  protected mute(id: number): void {
    this.appliances()?.acknowledge(id);
  }

  protected dismiss(appliance: ApplianceView): void {
    this.dismissed.update((closed) => new Set([...closed, dismissKey(appliance)]));
  }
}

function dismissKey(appliance: ApplianceView): string {
  return `${appliance.id}@${appliance.awaitingSince ?? ''}`;
}

function sameDay(first: number, second: number): boolean {
  return new Date(first).toDateString() === new Date(second).toDateString();
}
