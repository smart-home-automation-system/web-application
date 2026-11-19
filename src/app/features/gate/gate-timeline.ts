import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { HistoryPreset } from '../../core/time/history-range';
import { GarageGate, GateApi, GateEvent } from '../../data-access/gate/gate-api';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { describeGateError, eventLine } from '../../shared/gate/gate-labels';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { historyPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

/** How many items are shown at first, and added by every "Show more" (owner, 2026-11-19). */
const PAGE = 20;

/** The periods of the timeline (the task: 7 and 30 days; the service answers at most 31). */
const PRESETS: readonly HistoryPreset[] = ['week', 'month'];

/**
 * The rings and openings of 7 or 30 days (HAS-450, HAS-474, `GET /gate/events`): the rings and the ended calls of
 * the door station, its unlocks, the commands of the driveway gate and the pulses of the garage gates with who
 * pressed, and every opening and closing of a garage gate with how long it stood open - the newest first. The newest
 * twenty at first and twenty more with every "Show more" (owner, 2026-11-19: a month is hundreds of items).
 */
@Component({
  selector: 'app-gate-timeline',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    DisplayTextPipe,
    HistoryFrame,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="timeline card--domain" data-testid="gate-timeline">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>history</mat-icon></div>
          <mat-card-title>{{ t('gate.events.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="period.preset"
            [presets]="presets"
            [waiting]="shown.waiting()"
            [empty]="events().length === 0"
            [error]="resource.error()"
            [describeWith]="describeError"
            [lastUpdated]="resource.lastUpdated()"
            [stale]="resource.stale()"
          >
            <ng-template>
              <ol class="events" data-testid="gate-events">
                @for (event of visible(); track $index) {
                  @let line = lineOf(event);
                  <li class="event" [attr.data-kind]="event.kind">
                    <span class="event__time">{{ event.at | houseDateTime }}</span>
                    <span class="event__what">
                      @if (line.gate; as gate) {
                        <strong>{{ gate }}</strong
                        >&ngsp;
                      }
                      {{ line.what | displayText }}
                      @if (line.lasted; as lasted) {
                        &ngsp;{{ t('gate.events.after') }}&ngsp;{{ lasted | displayText }}
                      }
                    </span>
                    @if (line.member; as member) {
                      <span class="event__who">{{ member }}</span>
                    }
                  </li>
                }
              </ol>
              @if (events().length > visible().length) {
                <div class="events__more">
                  <span class="note">{{
                    t('gate.events.shown', { shown: visible().length, total: events().length })
                  }}</span>
                  <button mat-button type="button" data-testid="events-more" (click)="showMore()">
                    {{ t('gate.events.more') }}
                  </button>
                </div>
              }
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './gate-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GateTimeline {
  private readonly api = inject(GateApi);

  /** The garage gates, to name the gate of an event. */
  readonly garages = input.required<readonly GarageGate[] | null | undefined>();

  protected readonly presets = PRESETS;
  protected readonly period = historyPeriod('week');
  protected readonly resource = this.api.watchEvents(() => this.period.range());
  protected readonly shown = shownHistory(this.resource, this.period);
  protected readonly describeError = describeGateError;

  protected readonly events = computed((): readonly GateEvent[] => {
    const answer = this.shown.answer();
    return Array.isArray(answer) ? answer : [];
  });

  /** The newest twenty, twenty more with every "Show more"; back to twenty with another period. */
  private readonly count = linkedSignal({ source: this.period.preset, computation: () => PAGE });
  protected readonly visible = computed(() => this.events().slice(0, this.count()));

  protected showMore(): void {
    this.count.update((shown) => shown + PAGE);
  }

  protected lineOf(event: GateEvent) {
    const gates = this.garages() ?? [];
    return eventLine(event, (id) => gates.find((gate) => gate.id === id)?.name);
  }
}
