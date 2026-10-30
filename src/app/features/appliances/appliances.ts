import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { HistoryRange, historyRange, sameRange } from '../../core/time/history-range';
import { Ticker } from '../../core/time/ticker';
import { ApplianceApi, RunsOf, RunsQuery } from '../../data-access/appliance/appliance-api';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { DeviceRegistryApi, SmartDevice } from '../../data-access/devices/device-registry-api';
import { MessageKey } from '../../i18n/messages';
import { toApplianceViews } from '../../shared/appliances/appliance-views';
import { historyPeriod } from '../../shared/history-chart/history-period';
import { Source, SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { ApplianceCard } from './appliance-card';
import { AppliancePower } from './appliance-power';
import { CounterRow } from './counter-row';
import { MembersReport } from './members-report';
import { LIST_PRESETS, ListPreset, addedUp, countersOf, runsIn } from './appliance-history';

const LIST_LABELS: Readonly<Record<ListPreset, MessageKey>> = {
  week: 'history.preset.week',
  month: 'history.preset.month',
};

/**
 * The appliances page (HAS-283, the administrator's): every appliance of `appliance-service` with its
 * state, its cycles and the draw of its plug, to tune the thresholds - which are changed on the devices
 * page. Three calls, told once in the strip at the top: the appliances (the resource of the whole
 * application), their settings in the device registry, and the cycles of the last 30 days of every
 * appliance - one resource, so the counters of the house and of each appliance read one answer. The draw
 * is a call of each chart, told on its card.
 */
@Component({
  selector: 'app-appliances',
  imports: [
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    SourcesStrip,
    ApplianceCard,
    AppliancePower,
    CounterRow,
    MembersReport,
  ],
  templateUrl: './appliances.html',
  styleUrl: './appliances.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Appliances {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);

  protected readonly appliances = inject(ApplianceStore).appliances;
  protected readonly registry = inject(DeviceRegistryApi).watchKind('appliance');
  private readonly views = computed(() => toApplianceViews(this.appliances.value()));

  /** The cycles of 30 days of every appliance - the counters need all three periods. */
  private readonly runsQuery = computed(
    (): RunsQuery => ({
      ids: this.views().map((view) => view.id),
      range: historyRange('month', this.ticker.now(), this.zone),
    }),
    { equal: (a, b) => a.ids.join() === b.ids.join() && sameRange(a.range, b.range) },
  );
  protected readonly runs = inject(ApplianceApi).watchRunsOf(this.runsQuery);

  protected readonly sources: readonly Source[] = [
    { id: 'appliances', label: 'appliances.page.sources.appliances', resource: this.appliances },
    { id: 'registry', label: 'appliances.page.sources.registry', resource: this.registry },
    { id: 'runs', label: 'appliances.page.sources.runs', resource: this.runs },
  ];

  /** The period of the lists of the cycles. */
  protected readonly listPreset = signal<ListPreset>('week');
  protected readonly listPresets = LIST_PRESETS;
  protected readonly listLabels = LIST_LABELS;
  /** The period of the charts of the draw, shared by every chart of the page. */
  protected readonly power = historyPeriod('day');

  /** The answer of the cycles for the appliances on screen; `undefined` while there is none. */
  private readonly runsById = computed(() => {
    const answered = this.runs.value();
    return answered === undefined
      ? undefined
      : new Map<number, RunsOf>(answered.answer.map((entry) => [entry.id, entry]));
  });

  private readonly settingsById = computed(() => {
    const devices = this.registry.value();
    return new Map<number, SmartDevice>(
      Array.isArray(devices)
        ? devices.filter((device) => typeof device.id === 'number').map((device) => [device.id as number, device])
        : [],
    );
  });

  protected readonly rows = computed(() => {
    const now = this.ticker.now();
    const list: HistoryRange = historyRange(this.listPreset(), now, this.zone);
    const runs = this.runsById();
    return this.views().map((view) => {
      const entry = runs?.get(view.id);
      return {
        view,
        settings: this.settingsById().get(view.id)?.appliance,
        counters: entry?.runs === undefined ? undefined : countersOf(entry.runs, now, this.zone),
        runs: entry?.runs === undefined ? undefined : runsIn(entry.runs, list),
        error: entry?.error,
      };
    });
  });

  /** The line of the whole house: every appliance whose cycles are known, added up. */
  protected readonly house = computed(() => {
    const counted = this.rows().flatMap((row) => (row.counters === undefined ? [] : [row.counters]));
    return counted.length === 0 ? undefined : addedUp(counted);
  });

  /** Some appliance's cycles failed: the house line then says it is not the whole house. */
  protected readonly houseIncomplete = computed(() => this.rows().some((row) => row.counters === undefined));
}
