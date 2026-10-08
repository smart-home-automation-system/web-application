import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  Signal,
  afterNextRender,
  computed,
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

import { HeatingSwitchControl } from '../../data-access/heating/heating-api';
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

  /**
   * The change the question on screen is about. A question whose answer the house already gives
   * - somebody else switched in the meantime - is no question any more.
   */
  protected readonly question = computed(() => {
    const asked = this.asked();
    return asked !== undefined && asked !== this.enabled() ? asked : undefined;
  });

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
