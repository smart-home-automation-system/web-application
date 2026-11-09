import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError, toApiError } from '../../core/api/api-error';
import { APP_CONFIG } from '../../core/config/app-config';
import { Ticker } from '../../core/time/ticker';
import { SOFTENER_LIVE_RENEW_MS, SoftenerApi } from '../../data-access/water/softener-api';

/** How often the card reads the softener while the live stream is open. */
export const SOFTENER_LIVE_READ_MS = 5_000;
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import {
  hasSoftenerReading,
  isSoftenerOutOfDate,
  saltLevelOf,
  toSoftenerView,
} from './softener-views';
import { TemperatureGauge } from './temperature-gauge';
import { MessageKey } from '../../i18n/messages';
import { describeWaterError } from './water-errors';

/** A command of the regeneration the card asks about before it is sent. */
export type RegenerationCommand = 'now' | 'tonight' | 'cancel';

/**
 * How long after a command the softener is read again: the service sends the command at once, but the cloud tells the
 * new state of the regeneration only with the next read of the service (every five minutes) - the read 2.5 s later is
 * the poll answering at once, not the proof; the card keeps polling.
 */
export const SOFTENER_READ_AFTER_MS = 2_500;

let nextQuestion = 0;

/**
 * The water softener (HAS-402, epic HAS-396): the salt on a gauge with the days left and the day it runs out, the water
 * used today, the daily average and the treated water left, the hardness in mg/l of CaCO3 (the gpg set on the device in
 * a tooltip), the last regeneration and the count, whether one is scheduled or going on, the flags of the softener and
 * whether the cloud hears it - from `GET /water/softener`, one call, one card. A field the answer leaves out is not known,
 * never zero or off. The age of the reading is `measuredAt`, out of date past `SOFTENER_OUT_OF_DATE_MS` or when the
 * service says it is stale.
 *
 * Its writes (`water-service` >= 0.18.0): a regeneration now or tonight and the cancel of a scheduled one, **always
 * after a question** in the card, "Cancel" focused; sent once and the softener read again whatever it came to - the
 * answer is never used. The live flow (>= 0.19.0): a switch while the page is open - `PUT /water/softener/live` every
 * `SOFTENER_LIVE_RENEW_MS`, the softener read every 5 s meanwhile; the switch off or the page left closes it. Without
 * the stream the flow is what the cloud last had, and the card says so.
 */
@Component({
  selector: 'app-softener-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    HouseDateTimePipe,
    LocalNumberPipe,
    TemperatureGauge,
  ],
  templateUrl: './softener-card.html',
  styleUrl: './softener-card.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoftenerCard {
  private readonly api = inject(SoftenerApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly hidden = () => this.document.visibilityState === 'hidden';

  protected readonly softener = this.api.watchSoftener();

  protected readonly softenerView = computed(() => toSoftenerView(this.softener.value(), this.zone));
  protected readonly known = computed(() => hasSoftenerReading(this.softenerView()));
  protected readonly outOfDate = computed(() => isSoftenerOutOfDate(this.softenerView(), this.ticker.now()));
  protected readonly saltLevel = computed(() => saltLevelOf(this.softenerView().saltPercent));
  protected readonly describe = describeWaterError;
  protected readonly QUESTIONS: Readonly<Record<RegenerationCommand, MessageKey>> = {
    now: 'softener.question.now',
    tonight: 'softener.question.tonight',
    cancel: 'softener.question.cancel',
  };
  protected readonly CONFIRMS: Readonly<Record<RegenerationCommand, MessageKey>> = {
    now: 'softener.question.confirmNow',
    tonight: 'softener.question.confirmTonight',
    cancel: 'softener.question.confirmCancel',
  };
  protected readonly COMMANDS: Readonly<Record<RegenerationCommand, MessageKey>> = {
    now: 'softener.command.now',
    tonight: 'softener.command.tonight',
    cancel: 'softener.command.cancel',
  };

  protected readonly oneDecimal: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly whole: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  // ---- the regeneration (HAS-400) ----

  protected readonly question = signal<RegenerationCommand | undefined>(undefined);
  protected readonly questionId = `softener-question-${nextQuestion++}`;
  protected readonly commanding = signal(false);
  protected readonly commandFailure = signal<ApiError | undefined>(undefined);
  private readonly keep = viewChild<unknown, ElementRef<HTMLElement>>('keep', { read: ElementRef });
  private readAfterCommand?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  /** The commands offered: the cancel while one is scheduled, none while one goes on, both starts otherwise. */
  protected readonly commands = computed((): readonly RegenerationCommand[] => {
    const state = this.softenerView().regeneration;
    if (state === 'running') {
      return [];
    }
    return state === 'scheduled' ? ['now', 'cancel'] : ['now', 'tonight'];
  });

  // ---- the live flow (HAS-401) ----

  protected readonly liveOn = signal(false);
  protected readonly liveFailure = signal<ApiError | undefined>(undefined);
  private liveRenewal?: ReturnType<typeof setInterval>;
  /** The softener read every `SOFTENER_LIVE_READ_MS` while the stream is open - the flow moves at every frame. */
  private liveRead?: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => this.keep()?.nativeElement.focus());
    // a question with nothing left to ask goes for good: the command is no longer offered (a regeneration began, or
    // the one to cancel is gone) - cleared, never hidden, or it would come back by itself (the rule of the heating switch)
    effect(() => {
      const asked = this.question();
      if (asked !== undefined && !this.commanding() && !this.commands().includes(asked)) {
        this.question.set(undefined);
      }
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.readAfterCommand);
      this.stopLive(true);
    });
  }

  /** Sends the command once, then reads the softener again whatever it came to - one without an answer may be carried out. */
  protected send(command: RegenerationCommand): void {
    if (this.commanding()) {
      return;
    }
    this.commanding.set(true);
    this.commandFailure.set(undefined);
    const after = (failure?: ApiError) => {
      if (this.destroyed) {
        return;
      }
      this.readAfterCommand = setTimeout(() => {
        void this.softener
          .refresh()
          .catch(() => undefined)
          .then(() => {
            this.commanding.set(false);
            this.question.set(undefined);
            this.commandFailure.set(failure);
          });
      }, SOFTENER_READ_AFTER_MS);
    };
    const call = command === 'cancel' ? this.api.cancelRegeneration() : this.api.regenerate(command);
    call.subscribe({
      error: (error: unknown) => after(toApiError(error)),
      complete: () => after(),
    });
  }

  /** The switch of the live flow: on opens the stream and holds it while the page is open, off closes it. */
  protected toggleLive(on: boolean): void {
    if (on) {
      this.startLive();
    } else {
      this.stopLive(true);
    }
  }

  private startLive(): void {
    if (this.liveOn()) {
      return;
    }
    this.liveOn.set(true);
    this.liveFailure.set(undefined);
    this.openLive();
    // a hidden tab makes no calls (the rule of pollingResource): the stream lapses by itself while nobody looks
    this.liveRenewal = setInterval(() => {
      if (!this.hidden()) {
        this.openLive();
      }
    }, SOFTENER_LIVE_RENEW_MS);
  }

  /** Opens the stream or extends it; the first open starts the faster read of the softener. */
  private openLive(): void {
    this.api.openLive().subscribe({
      next: () => {
        if (!this.destroyed && this.liveOn() && this.liveRead === undefined) {
          void this.softener.refresh();
          this.liveRead = setInterval(() => {
            if (!this.hidden()) {
              void this.softener.refresh();
            }
          }, SOFTENER_LIVE_READ_MS);
        }
      },
      error: (error: unknown) => {
        if (this.destroyed) {
          return;
        }
        this.liveFailure.set(toApiError(error));
        // the stream did not open: nothing to close
        this.stopLive(false);
      },
    });
  }

  /** The switch off: the timers stopped and - when asked, and the stream was on - the stream closed. */
  private stopLive(close: boolean): void {
    clearInterval(this.liveRenewal);
    clearInterval(this.liveRead);
    this.liveRenewal = undefined;
    this.liveRead = undefined;
    const wasOn = this.liveOn();
    this.liveOn.set(false);
    if (wasOn && close) {
      this.api.closeLive().subscribe({ error: () => undefined });
    }
  }
}
