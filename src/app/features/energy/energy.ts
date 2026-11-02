import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { EnergyApi, EnergyPhase, Inverter } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { DomainTile } from '../../shared/domain-tile/domain-tile';
import { historyPeriod } from '../../shared/history-chart/history-period';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { EnergyChartCard } from './energy-chart-card';
import { ENERGY_CHARTS, energyChart } from './energy-charts';
import { EnergyDays, shiftDay } from './energy-days';
import { describeEnergyError } from './energy-errors';
import { EnergyFlow } from './energy-flow';
import { EnergySettlement } from './energy-settlement';
import {
  alertKindLabel,
  alertsOf,
  batteryDirectionLabel,
  gridDirectionLabel,
  gridStateOf,
  numberOf,
  readingSourceLabel,
  runModeAlarming,
  runModeLabel,
  sourceLabel,
  sourcesOf,
  toFlowView,
} from './energy-views';
import { PowerValue } from './power-value';

/**
 * The current above which a phase of the grid meter is overloaded - `energy.overload.phase-current-warn`
 * of energy-service (22 A), copied: the service warns after three minutes above it, the page
 * colours the phase at once.
 */
export const PHASE_CURRENT_WARN_AMPERES = 22;

/** The phases of the meter and of an inverter, in order. */
const PHASES = ['a', 'b', 'c'] as const;

/** The strings of panels of an inverter, in order, with their names. */
const STRINGS = ['pv1', 'pv2'] as const;
const STRING_LABELS: Readonly<Record<(typeof STRINGS)[number], MessageKey>> = {
  pv1: 'energy.inverter.pv1',
  pv2: 'energy.inverter.pv2',
};

/**
 * The energy of the house (HAS-341, the administrator's): where it goes now, the two inverters, the
 * battery, the grid meter, the sources, the open alarms and the outages of the grid, the history of
 * the powers and of the battery, the closed days and the net-metering of the billing year - in kWh,
 * never money (the owner settles by "opusty").
 *
 * **A card per call**, the rule of the weather page: every card tells the freshness and the
 * failure of its call; the two inverters come from one call and have a card each, so each tells it.
 * **What the answer leaves out is "not known"**, never 0 - the service leaves out what it has not
 * read. The charts share one period; the days and the settlement choose their own.
 */
@Component({
  selector: 'app-energy',
  imports: [
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    DomainTile,
    EnergyChartCard,
    EnergyDays,
    EnergyFlow,
    EnergySettlement,
    HouseAgePipe,
    HouseDateTimePipe,
    LocalNumberPipe,
    PowerValue,
  ],
  templateUrl: './energy.html',
  styleUrl: './energy.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Energy {
  private readonly api = inject(EnergyApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);

  protected readonly status = this.api.watchStatus();
  protected readonly flows = this.api.watchFlows();
  protected readonly grid = this.api.watchGrid();
  protected readonly inverters = this.api.watchInverters();
  protected readonly battery = this.api.watchBattery();
  protected readonly alerts = this.api.watchAlerts();

  /** The outages of the last year: from the midnight a year back to the midnight after today. */
  private readonly outageRange = computed(
    () => {
      const today = houseDay(this.ticker.now(), this.zone);
      return { from: `${shiftDay(today, -365)}T00:00:00`, to: `${shiftDay(today, 1)}T00:00:00` };
    },
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );
  protected readonly outages = this.api.watchOutages(this.outageRange);

  protected readonly period = historyPeriod();
  protected readonly charts = ENERGY_CHARTS.map((spec) => energyChart(spec, this.period));

  protected readonly phases = PHASES;
  protected readonly strings = STRINGS;
  protected readonly stringLabels = STRING_LABELS;
  protected readonly warnAmperes = PHASE_CURRENT_WARN_AMPERES;

  protected readonly ONE: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly TWO: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  protected readonly flow = computed(() => toFlowView(this.flows.value()));
  protected readonly today = computed(() => {
    const today = this.flows.value()?.today;
    return {
      production: numberOf(today?.production),
      houseLoad: numberOf(today?.houseLoad),
      imported: numberOf(today?.imported),
      exported: numberOf(today?.exported),
      charged: numberOf(today?.charged),
      discharged: numberOf(today?.discharged),
      selfConsumption: numberOf(today?.selfConsumption),
      gridShare: numberOf(today?.gridShare),
    };
  });

  protected readonly sources = computed(() => sourcesOf(this.status.value()));
  protected readonly gridState = computed(() => gridStateOf(this.status.value()));
  protected readonly gridSince = computed(() => this.status.value()?.grid?.since);

  /** An inverter of the answer by its id; `undefined` while the answer does not name it. */
  private inverterOf(id: string): Inverter | undefined {
    const answer: unknown = this.inverters.value();
    return Array.isArray(answer)
      ? (answer as Inverter[]).find((inverter) => inverter?.id === id)
      : undefined;
  }

  protected readonly solax = computed(() => this.inverterOf('solax'));
  protected readonly sofar = computed(() => this.inverterOf('sofar'));

  protected readonly openAlerts = computed(() => alertsOf(this.alerts.value()));
  protected readonly outageList = computed(() => {
    const answer: unknown = this.outages.value()?.answer;
    return Array.isArray(answer)
      ? [...answer].sort((a, b) => String(b?.startedAt).localeCompare(String(a?.startedAt)))
      : undefined;
  });

  protected readonly runModeLabel = runModeLabel;
  protected readonly runModeAlarming = runModeAlarming;
  protected readonly batteryDirectionLabel = batteryDirectionLabel;
  protected readonly gridDirectionLabel = gridDirectionLabel;
  protected readonly readingSourceLabel = readingSourceLabel;
  protected readonly sourceLabel = sourceLabel;
  protected readonly alertKindLabel = alertKindLabel;
  protected readonly numberOf = numberOf;
  protected readonly describe = describeEnergyError;

  /** A phase above the warning current - coloured, and said in words. */
  protected overloaded(phase: EnergyPhase | undefined): boolean {
    const current = numberOf(phase?.current);
    return current !== undefined && current > PHASE_CURRENT_WARN_AMPERES;
  }

  /** The faults of the SOFAR as a list, `undefined` while the answer says nothing of them. */
  protected faultsOf(inverter: Inverter | undefined): readonly string[] | undefined {
    const faults: unknown = inverter?.faults;
    return Array.isArray(faults)
      ? faults.filter((fault): fault is string => typeof fault === 'string')
      : undefined;
  }

  /** The SOC of the battery, 0 to 100 for the gauge; `undefined` while not known. */
  protected readonly soc = computed(() => {
    const soc = numberOf(this.battery.value()?.soc);
    return soc === undefined ? undefined : Math.min(100, Math.max(0, soc));
  });

  /** The range the history of the outages is asked for - for the words under the list. */
  protected readonly outagesSince = computed(() => this.outageRange().from);
}
