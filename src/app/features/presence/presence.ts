import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { provideCalendar } from '../../core/i18n/calendar';
import { houseDay, houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { isRecord } from '../../core/util/is-record';
import { PresenceApi, ReportRange, ResidentQuery } from '../../data-access/presence/presence-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { DayLaneBar } from './day-lane';
import { DayLane, Duration, observedLater, toDayLanes, toDuration } from './day-lanes';
import { PresenceDuration } from './presence-duration';
import {
  LONGEST_RANGE_DAYS,
  Preset,
  addDays,
  dayOf,
  fromDay,
  rangeOfDays,
  rangeOfPreset,
} from './report-range';

/** Somebody of the household as the "at home now" card lists them. */
interface ResidentNow {
  readonly name: string;
  /** At home, away, nothing stored about them yet, or an answer that does not say. */
  readonly state: 'home' | 'away' | 'not-observed' | 'unknown';
  readonly since?: string;
  readonly lastCheckedAt?: string;
  /** The last check is older than a detection that runs every minute would leave it. */
  readonly late: boolean;
}

/** A day of one resident: the bar and the figures of the service next to it. */
interface ResidentDay {
  readonly lane: DayLane;
  readonly atHome?: Duration;
  readonly percentage?: number;
  readonly firstArrival?: string;
  readonly lastDeparture?: string;
  readonly stillAtHome: boolean;
}

/** A day of the house. */
interface HouseDay {
  readonly lane: DayLane;
  readonly occupied?: Duration;
  readonly empty?: Duration;
  /** `undefined` when the answer does not say. */
  readonly wasEmpty?: boolean;
}

interface PresetOption {
  readonly value: Exclude<Preset, 'custom'>;
  readonly label: MessageKey;
}

const PRESETS: readonly PresetOption[] = [
  { value: 'today', label: 'presence.range.today' },
  { value: 'week', label: 'presence.range.week' },
  { value: 'month', label: 'presence.range.month' },
];

/** The detection looks once a minute; a check older than this means it is not looking. */
const CHECK_IS_LATE_AFTER_MS = 5 * 60_000;

const STATE_LABELS: Readonly<Record<ResidentNow['state'], MessageKey>> = {
  home: 'presence.now.atHome',
  away: 'presence.now.away',
  'not-observed': 'presence.now.notObserved',
  unknown: 'presence.now.unknown',
};

const STATE_ICONS: Readonly<Record<ResidentNow['state'], string>> = {
  home: 'home',
  away: 'directions_walk',
  'not-observed': 'visibility_off',
  unknown: 'help',
};

/**
 * Presence: who is at home now, when one resident was at home day by day, and when the house
 * stood empty - for a period of up to 366 days. Read-only; the administrator's page.
 *
 * **Only what was observed is drawn.** The reports say from when to when the history covers the
 * period (`observedFrom`, `observedUntil`): a day outside it gets no row, the part of a day
 * outside it is hatched, and the page says in words where the history begins. Nothing here
 * turns "nobody looked" into "was away".
 *
 * Three resources, three cards: who is at home now; the two reports of the chosen resident,
 * which are one resource because they are shown as one list; and the house.
 */
@Component({
  selector: 'app-presence',
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DayLaneBar,
    HouseAgePipe,
    HouseDateTimePipe,
    LocalNumberPipe,
    PresenceDuration,
  ],
  // the calendar and its texts come with this view, not with the first page of the application
  providers: [provideCalendar()],
  templateUrl: './presence.html',
  styleUrl: './presence.scss',
  // A row here is several pieces of text side by side - a date, a length of time, a share.
  // With the white space of the template kept, they are words to a screen reader and to
  // whoever copies a row; stripped, they run together ("Thu 8 Oct15 h 10 min").
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Presence {
  private readonly api = inject(PresenceApi);
  private readonly ticker = inject(Ticker);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;

  protected readonly presets = PRESETS;
  protected readonly stateLabels = STATE_LABELS;
  protected readonly stateIcons = STATE_ICONS;
  protected readonly dayFormat: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  };
  protected readonly timeFormat: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };
  protected readonly percent: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

  // ---- the period ----

  /** The calendar day of the house, as `2026-10-08`: a text, so it changes once a day. */
  private readonly today = computed(() => houseDay(this.ticker.now(), this.zone));
  protected readonly preset = signal<Preset>('week');
  /** The first and the last day somebody picked, both included. */
  private readonly picked = signal<{ first: string; last: string } | undefined>(undefined);

  protected readonly range = computed(
    (): ReportRange => {
      const picked = this.picked();
      return this.preset() === 'custom' && picked
        ? rangeOfDays(picked.first, picked.last)
        : rangeOfPreset(this.preset(), this.today());
    },
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );

  /** The calendar offers the days a report can cover: the last 366, today included. */
  protected readonly earliest = computed(() =>
    fromDay(addDays(this.today(), -(LONGEST_RANGE_DAYS - 1))),
  );
  protected readonly latest = computed(() => fromDay(this.today()));
  protected readonly dates = new FormGroup({
    first: new FormControl<Date | null>(null),
    last: new FormControl<Date | null>(null),
  });

  // ---- who ----

  protected readonly now = this.api.watchNow();
  protected readonly residents = computed(() => this.toResidents(this.now.value()));
  private readonly chosen = signal<string | undefined>(undefined);
  /** The resident whose history is shown: the one chosen, or the first of the list. */
  protected readonly resident = computed(() => {
    const names = this.residents().map((resident) => resident.name);
    const chosen = this.chosen();
    return chosen !== undefined && names.includes(chosen) ? chosen : names[0];
  });

  private readonly query = computed(
    (): ResidentQuery | undefined => {
      const name = this.resident();
      return name === undefined ? undefined : { name, range: this.range() };
    },
    { equal: (a, b) => a?.name === b?.name && a?.range === b?.range },
  );

  // ---- the reports ----

  protected readonly history = this.api.watchResident(() => this.query());
  protected readonly house = this.api.watchHouse(() => this.range());

  /**
   * The history on screen - `undefined` while the answer at hand is that of another resident or
   * period: the one asked before, still shown by the resource until the new one arrives.
   */
  protected readonly shownHistory = computed(() => {
    const answered = this.history.value();
    return answered !== undefined && answered.query === this.query() ? answered : undefined;
  });
  protected readonly shownHouse = computed(() => {
    const answered = this.house.value();
    return answered !== undefined && answered.query === this.range() ? answered : undefined;
  });

  protected readonly residentDays = computed((): ResidentDay[] => {
    const answer = this.shownHistory()?.answer;
    if (!answer) {
      return [];
    }
    const days = Array.isArray(answer.daily?.days) ? answer.daily.days : [];
    return toDayLanes(
      this.range(),
      answer.daily?.observedFrom,
      answer.daily?.observedUntil,
      answer.report?.intervals,
    ).map((lane) => {
      const day = days.find((candidate) => candidate?.date === lane.date);
      return {
        lane,
        atHome: toDuration(day?.secondsAtHome),
        percentage: finite(day?.presencePercentage),
        firstArrival: text(day?.firstArrival),
        lastDeparture: text(day?.lastDeparture),
        stillAtHome: lane.blocks.some((block) => block.open),
      };
    });
  });
  protected readonly residentObservedSince = computed(() =>
    observedLater(this.range(), this.shownHistory()?.answer?.daily?.observedFrom),
  );

  protected readonly houseDays = computed((): HouseDay[] => {
    const answer = this.shownHouse()?.answer;
    if (!answer) {
      return [];
    }
    const days = Array.isArray(answer.days) ? answer.days : [];
    const occupied = (Array.isArray(answer.intervals) ? answer.intervals : []).filter(
      (interval) => interval?.occupied === true,
    );
    return toDayLanes(this.range(), answer.observedFrom, answer.observedUntil, occupied).map(
      (lane) => {
        const day = days.find((candidate) => candidate?.date === lane.date);
        return {
          lane,
          occupied: toDuration(day?.secondsOccupied),
          empty: toDuration(day?.secondsEmpty),
          wasEmpty: typeof day?.wasEmpty === 'boolean' ? day.wasEmpty : undefined,
        };
      },
    );
  });
  protected readonly houseObservedSince = computed(() =>
    observedLater(this.range(), this.shownHouse()?.answer?.observedFrom),
  );

  constructor() {
    // the date field always shows the period the reports are for, whichever way it was chosen
    effect(() => this.showInDateField(this.range()));
  }

  protected choosePreset(preset: Exclude<Preset, 'custom'>): void {
    this.preset.set(preset);
  }

  /** Called when the calendar closes. A period has two ends: half a choice is no choice. */
  protected pickDates(): void {
    const { first, last } = this.dates.getRawValue();
    if (!first || !last || this.dates.invalid) {
      this.showInDateField(this.range());
      return;
    }
    this.picked.set({ first: toDay(first), last: toDay(last) });
    this.preset.set('custom');
  }

  private showInDateField(range: ReportRange): void {
    this.dates.setValue(
      { first: fromDay(dayOf(range.from)), last: fromDay(addDays(dayOf(range.to), -1)) },
      { emitEvent: false },
    );
  }

  protected chooseResident(name: string): void {
    this.chosen.set(name);
  }

  private toResidents(answer: unknown): ResidentNow[] {
    if (!Array.isArray(answer)) {
      return [];
    }
    const now = this.ticker.now();
    return answer.flatMap((entry: unknown): ResidentNow[] => {
      const resident = isRecord(entry) ? entry : {};
      const name = resident['name'];
      if (typeof name !== 'string' || name === '') {
        return [];
      }
      const lastCheckedAt = text(resident['lastCheckedAt']);
      const present = resident['present'];
      const checked = parseHouseDateTime(lastCheckedAt);
      return [
        {
          name,
          state:
            typeof present !== 'boolean'
              ? 'unknown'
              : present
                ? 'home'
                : // listed as not present with no check at all: nothing is stored about them
                  lastCheckedAt === undefined
                  ? 'not-observed'
                  : 'away',
          since: text(resident['since']),
          lastCheckedAt,
          late:
            checked !== undefined &&
            now - houseInstant(checked, this.zone) > CHECK_IS_LATE_AFTER_MS,
        },
      ];
    });
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The day a date of the calendar stands for - the calendar works in the zone of the browser. */
function toDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
