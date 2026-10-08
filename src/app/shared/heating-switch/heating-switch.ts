import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  Signal,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { FailedSwitch, HeatingSwitchControl } from '../../data-access/heating/heating-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../api-error/api-error-strip';
import { DataFreshness } from '../data-freshness/data-freshness';
import { HouseDateTimePipe } from '../house-date-time/house-date-time.pipe';

/**
 * The switch of the heating system, as a card: whether the heating of the whole house is on,
 * since when, and a button to change it. The view that shows it owns the data -
 * `<app-heating-switch [control]="heating" />` with `heating = inject(HeatingApi).watchSwitch()`.
 *
 * **The button asks before it acts**: it is replaced by the question and two buttons, in the
 * card itself, so nothing covers the state the question is about.
 *
 * **What the card says is what the service answered, never what was clicked.** A change is sent,
 * the service is asked again, and only that answer moves the state on screen; a change that
 * failed is reported and the state is the one the service gives.
 */
@Component({
  selector: 'app-heating-switch',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseDateTimePipe,
  ],
  templateUrl: './heating-switch.html',
  styleUrl: './heating-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeatingSwitch {
  /** Two of these cards on one page must not share the id their question is named by. */
  private static cards = 0;
  protected readonly questionId = `heating-switch-question-${HeatingSwitch.cards++}`;

  readonly control = input.required<HeatingSwitchControl>();

  private readonly injector = inject(Injector);
  private readonly trigger = viewChild('triggerButton', { read: ElementRef });
  private readonly cancelButton = viewChild('cancelButton', { read: ElementRef });

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly enabled = computed(() => {
    const enabled: unknown = this.control().value()?.isHeatingEnabled;
    return typeof enabled === 'boolean' ? enabled : undefined;
  });

  protected readonly since = computed(() => {
    const updatedAt: unknown = this.control().value()?.updatedAt;
    return typeof updatedAt === 'string' ? updatedAt : undefined;
  });

  /** The state somebody asked for with the button and has not confirmed yet. */
  private readonly asked = signal<boolean | undefined>(undefined);

  /** The change the question on screen is about. */
  protected readonly question = this.asked.asReadonly();

  /**
   * A change that failed, for as long as it says something: once the house is in the state that
   * was asked for - the change got through after all, or somebody else made it - there is no
   * failure left to tell.
   */
  protected readonly failure = computed(() => {
    const failed = this.control().switchFailure();
    return failed !== undefined && failed.on !== this.enabled() ? failed : undefined;
  });

  constructor() {
    // A question is about leaving the state on screen. When that state goes - somebody else
    // switched in the meantime, or the service stopped saying - the question goes for good:
    // it must not come back by itself when the house returns to where it was.
    effect(() => {
      const asked = this.asked();
      if (asked !== undefined && this.enabled() !== !asked) {
        this.asked.set(undefined);
      }
    });
  }

  /**
   * What to say about a failed change. A change that got no answer may have been carried out
   * all the same - or may still be: that is not "could not be switched".
   */
  protected failureText(failed: FailedSwitch): MessageKey {
    if (failed.error.kind === 'network') {
      return 'heatingSwitch.noAnswer';
    }
    return failed.on ? 'heatingSwitch.failedOn' : 'heatingSwitch.failedOff';
  }

  protected ask(on: boolean): void {
    if (this.control().switching()) {
      return;
    }
    this.asked.set(on);
    // the button that was pressed is gone with the question: the safe answer takes the focus
    this.focus(this.cancelButton);
  }

  protected cancel(): void {
    this.asked.set(undefined);
    this.focus(this.trigger);
  }

  protected confirm(on: boolean): void {
    this.asked.set(undefined);
    this.control().turn(on);
    this.focus(this.trigger);
  }

  private focus(element: Signal<ElementRef<HTMLElement> | undefined>): void {
    afterNextRender(() => element()?.nativeElement.focus(), { injector: this.injector });
  }
}
