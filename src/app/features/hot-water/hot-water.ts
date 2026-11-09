import { NgTemplateOutlet } from '@angular/common';
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
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError, toApiError } from '../../core/api/api-error';
import { APP_CONFIG } from '../../core/config/app-config';
import { Ticker } from '../../core/time/ticker';
import {
  CONSUMPTION_RANGES,
  ConsumptionRange,
  HOT_WATER_BAND,
  WaterApi,
} from '../../data-access/water/water-api';
import { MessageKey } from '../../i18n/messages';
import { isOutOfDate, toWaterReading } from '../../data-access/water/water-reading';
import { sameRange } from '../../core/time/history-range';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { CirculationRuns } from './circulation-runs';
import { SoftenerAlerts } from './softener-alerts';
import { SoftenerCard } from './softener-card';
import { SoftenerHistory } from './softener-history';
import { stoppedByText, toCirculationView, todayRange, triggerText } from './circulation-views';
import { TemperatureGauge } from './temperature-gauge';
import { WaterBills } from './water-bills';
import { WaterConsumptionCard } from './water-consumption';
import { describeCirculationError, describeWaterError } from './water-errors';
import { WaterHistory } from './water-history';
import { hasValveReading, isValveOutOfDate, toValveView, unitOf, volumeIn } from './water-views';

/** The rows of the water of the running ranges in the card of the valve. */
const USAGE_LABELS: Readonly<Record<ConsumptionRange, MessageKey>> = {
  day: 'water.valve.usageDay',
  week: 'water.valve.usageWeek',
  month: 'water.valve.usageMonth',
  year: 'water.valve.usageYear',
};

/** One row of the water used: in the unit of its range, or not known. */
interface UsageRow {
  readonly key: string;
  readonly label: MessageKey;
  readonly value?: number;
  readonly unit: string;
  readonly format: Intl.NumberFormatOptions;
}

/**
 * The water of the house (HAS-322, the view was the hot water until then): the water valve of the garage - its state,
 * flow, pressure, the water temperature and the counter - and the consumption by day, week, month and year, then the
 * hot water as before. The page is the administrator's, like every card of it.
 *
 * The valve has a call of its own (`GET /water/valve`) and so a card of its own; a field the answer leaves out is
 * not known - never zero, never closed. Its age is the newest report of the valve, out of date once two reads of the
 * service were missed (`VALVE_OUT_OF_DATE_MS`). Under it the water of today, this week, this month and this year
 * (one call of four totals, its failure told in the card) and the counter of the valve (owner, 2026-11-05: the
 * counter alone says little). The page is a row of four cards of one size - the valve, the tank, the demand, the
 * circulation - with the consumption and the history under it, as on the heating page.
 *
 * Hot water: the temperature of the water in the tank on a gauge with the band it is kept in, whether the water asks
 * to be heated, the history of the tank and the circulation, and - since HAS-406 - the circulation pump: its state,
 * the return and a start (`GET` / `POST /water/circulation`, its own call, no question by the owner's choice), with
 * the runs of today in a card of their own. The writes of the page are the valve, the bills and the start of the pump.
 *
 * The freshness of a card is that of its call. For the temperatures that is not the age of the
 * reading: the service repeats its last row for as long as the sensor is silent, so the card
 * says when the sensors were read (`measuredAt`) and calls the reading out of date once two
 * polls of the service were missed. An answer without that time - an older `water-service` -
 * gets neither.
 */
/** How long after a command the valve is read again: it reports a change at once, a command takes a moment. */
export const VALVE_READ_AFTER_MS = 2_500;

/**
 * How long after a start the pump is read again: the service switches the relay before it answers, and reads the Uni
 * every 5 s while a run goes on - so a read 2.5 s later may still be the one before; the poll of 10 s follows.
 */
export const CIRCULATION_READ_AFTER_MS = 2_500;

let nextQuestion = 0;

@Component({
  selector: 'app-hot-water',
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    CirculationRuns,
    SoftenerAlerts,
    SoftenerCard,
    SoftenerHistory,
    DataFreshness,
    DisplayTextPipe,
    HouseAgePipe,
    LocalNumberPipe,
    TemperatureGauge,
    WaterBills,
    WaterConsumptionCard,
    WaterHistory,
  ],
  templateUrl: './hot-water.html',
  styleUrl: './hot-water.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HotWater {
  private readonly api = inject(WaterApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  protected readonly temperatures = this.api.watchTemperatures();
  protected readonly demand = this.api.watchHeatingDemand();
  protected readonly valve = this.api.watchValve();
  protected readonly totals = this.api.watchConsumptionTotals();
  protected readonly pump = this.api.watchCirculation();
  /** Today of the house, a new object only when the day changes - the question of the runs. */
  protected readonly today = computed(() => todayRange(this.ticker.now(), this.zone), {
    equal: sameRange,
  });
  protected readonly runs = this.api.watchCirculationRuns(() => this.today());

  // ---- the circulation pump (HAS-406): its state and a start, no question (owner, 2026-11-06) ----

  protected readonly pumpView = computed(() => toCirculationView(this.pump.value(), this.zone));
  /** A start was sent and the pump is being read again. */
  protected readonly starting = signal(false);
  protected readonly startFailure = signal<ApiError | undefined>(undefined);
  protected readonly describeCirculation = describeCirculationError;
  protected readonly triggerText = triggerText;
  protected readonly stoppedByText = stoppedByText;
  /** The read of the pump after a start, waiting; cleared with the page. */
  private readAfterStart?: ReturnType<typeof setTimeout>;

  // ---- the command of the valve (HAS-323) ----

  /** The command asked about; the valve is closed or opened only once it is confirmed. */
  protected readonly valveQuestion = signal<'open' | 'close' | undefined>(undefined);
  protected readonly valveQuestionId = `valve-question-${nextQuestion++}`;
  /** A command was sent and the valve is being read again. */
  protected readonly commanding = signal(false);
  protected readonly commandFailure = signal<ApiError | undefined>(undefined);
  private readonly keepValve = viewChild<unknown, ElementRef<HTMLElement>>('keepValve', {
    read: ElementRef,
  });
  private readonly destroyRef = inject(DestroyRef);
  /** The read of the valve after a command, waiting; cleared with the page. */
  private readAfterCommand?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  protected readonly describeWater = describeWaterError;
  protected readonly band = HOT_WATER_BAND;
  protected readonly oneDecimal: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };

  private readonly reading = computed(() => toWaterReading(this.temperatures.value(), this.zone));
  protected readonly tank = computed(() => this.reading().tank);
  /** House wall-clock time the sensors were read; `undefined` when the answer does not say. */
  protected readonly measuredAt = computed(() => this.reading().measuredAt);
  /** The service has missed two of its polls: the card shows its last row, not the water as it is. */
  protected readonly outOfDate = computed(() => isOutOfDate(this.reading(), this.ticker.now()));

  protected readonly twoDecimals: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  protected readonly threeDecimals: Intl.NumberFormatOptions = {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  };

  protected readonly valveView = computed(() => toValveView(this.valve.value(), this.zone));
  protected readonly valveKnown = computed(() => hasValveReading(this.valveView()));
  /** The reports of the valve stopped: the card shows the last of them. */
  protected readonly valveOutOfDate = computed(() =>
    isValveOutOfDate(this.valveView(), this.ticker.now()),
  );

  /** The water of the running day, week, month and year, then the counter of the valve. */
  protected readonly usage = computed((): readonly UsageRow[] => {
    const totals = this.totals.value();
    const rows = CONSUMPTION_RANGES.map((range): UsageRow => {
      const { unit, decimals } = unitOf(range);
      return {
        key: range,
        label: USAGE_LABELS[range],
        value: volumeIn(range, totals?.[range]),
        unit,
        format: { minimumFractionDigits: decimals, maximumFractionDigits: decimals },
      };
    });
    return [
      ...rows,
      {
        key: 'counter',
        label: 'water.valve.counter',
        value: this.valveView().counter,
        unit: 'm³',
        format: this.threeDecimals,
      },
    ];
  });

  constructor() {
    // the question takes the focus on "Cancel", the safe answer - an Enter pressed out of habit cuts no water
    effect(() => this.keepValve()?.nativeElement.focus());
    // a question that has nothing left to ask goes: the valve reached that state by other means, or is not known
    // any more - cleared, never hidden, or it would come back by itself (the rule of the heating switch)
    effect(() => {
      const asked = this.valveQuestion();
      const open = this.valveView().open;
      const settled = (asked === 'close' && open === false) || (asked === 'open' && open === true);
      if (asked !== undefined && !this.commanding() && (settled || !this.valveKnown())) {
        this.valveQuestion.set(undefined);
      }
    });
    // a failed start goes once the pump is read running: a start without an answer was carried out after all, and
    // a refused one is overtaken by a run - the rule of the heating switch, cleared in an effect
    effect(() => {
      if (this.pumpView().running === true && !this.starting() && this.startFailure()) {
        this.startFailure.set(undefined);
      }
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.readAfterCommand);
      clearTimeout(this.readAfterStart);
    });
  }

  /** The commands offered: the one that changes the state, both while the state is not known. */
  protected commandsOf(open: boolean | undefined): readonly ('open' | 'close')[] {
    if (open === undefined) {
      return ['close', 'open'];
    }
    return open ? ['close'] : ['open'];
  }

  /**
   * Sends the command once, then reads the valve again after `VALVE_READ_AFTER_MS` - the valve reports its new
   * state within that - whatever the command came to: a command without an answer may have been carried out. Taken
   * is not done: the read says whether the valve confirmed it (`lastCommandConfirmed`).
   */
  protected command(state: 'open' | 'close'): void {
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
        void this.valve
          .refresh()
          .catch(() => undefined)
          .then(() => {
            this.commanding.set(false);
            this.valveQuestion.set(undefined);
            this.commandFailure.set(failure);
          });
      }, VALVE_READ_AFTER_MS);
    };
    this.api.commandValve(state).subscribe({
      error: (error: unknown) => after(toApiError(error)),
      complete: () => after(),
    });
  }

  /**
   * Starts a run of the circulation pump, sent once, then reads the pump and the runs of today again
   * `CIRCULATION_READ_AFTER_MS` later whatever the start came to - a start without an answer may have been carried
   * out. The service stops the run by itself; a run already going on is answered as it is.
   */
  protected startPump(): void {
    if (this.starting()) {
      return;
    }
    this.starting.set(true);
    this.startFailure.set(undefined);
    const after = (failure?: ApiError) => {
      if (this.destroyed) {
        return;
      }
      this.readAfterStart = setTimeout(() => {
        void Promise.all([
          this.pump.refresh().catch(() => undefined),
          this.runs.refresh().catch(() => undefined),
        ]).then(() => {
          this.starting.set(false);
          this.startFailure.set(failure);
        });
      }, CIRCULATION_READ_AFTER_MS);
    };
    this.api.startCirculation().subscribe({
      error: (error: unknown) => after(toApiError(error)),
      complete: () => after(),
    });
  }

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly heatingNeeded = computed(() => {
    const active: unknown = this.demand.value()?.active;
    return typeof active === 'boolean' ? active : undefined;
  });
}
