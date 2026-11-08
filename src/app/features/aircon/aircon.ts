import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { AirconApi, AirconRule, AirconUnit } from '../../data-access/aircon/aircon-api';
import { MessageKey } from '../../i18n/messages';
import { airconReadBack } from '../../shared/aircon/aircon-read-back';
import { FLOORS } from '../../shared/floors/floors';
import { historyPeriod } from '../../shared/history-chart/history-period';
import { Source, SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { AirconPower } from './aircon-power';
import { AirconPowerChart } from './aircon-power-chart';
import { AirconUnitCard } from './aircon-unit';

/** The units are commanded here: read as often as on My room, so a command is followed by its state. */
const POLL_UNITS_EVERY_MS = 10_000;

// the rooms in the order of the house; a room `FLOORS` does not know comes last
const ROOM_ORDER = FLOORS.flatMap((floor) => floor.rooms);

const rankOf = (unit: AirconUnit): number => {
  const at = ROOM_ORDER.indexOf(unit.room ?? '');
  return at < 0 ? ROOM_ORDER.length : at;
};

/**
 * The air conditioners of the house (HAS-395, the administrator's; `aircon-service` >= 0.10.0, the filters from
 * 0.11.0): every unit by room - its state and controls, its filter, its rule with the editor, its changes of 24
 * hours - then the two plugs that feed them with the power cycle of the indoor one, and the draw of each plug as
 * a chart. Four calls, each told once in the strip of sources at the top; the charts have a call each and tell it
 * on their card. No write is optimistic: a command, a rule, a cleaned filter or a power cycle is followed by a
 * read of what it changed.
 */
@Component({
  selector: 'app-aircon',
  imports: [
    MatCardModule,
    TranslocoDirective,
    AirconPower,
    AirconPowerChart,
    AirconUnitCard,
    SourcesStrip,
  ],
  templateUrl: './aircon.html',
  styleUrl: './aircon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Aircon {
  private readonly api = inject(AirconApi);
  protected readonly units = this.api.watchUnits(POLL_UNITS_EVERY_MS);
  protected readonly rules = this.api.watchRules();
  protected readonly power = this.api.watchPower();
  protected readonly cycle = this.api.watchPowerCycle();

  protected readonly sources: readonly Source[] = [
    { id: 'units', label: 'aircon.page.sources.units' as MessageKey, resource: this.units },
    { id: 'rules', label: 'aircon.page.sources.rules' as MessageKey, resource: this.rules },
    { id: 'power', label: 'aircon.page.sources.power' as MessageKey, resource: this.power },
    { id: 'cycle', label: 'aircon.page.sources.cycle' as MessageKey, resource: this.cycle },
  ];

  /** One command per unit at a time, one write of a rule and one of a filter per unit. */
  protected readonly commands = new DeviceCommands<number>();
  protected readonly ruleCommands = new DeviceCommands<number>();
  protected readonly filterCommands = new DeviceCommands<number>();
  // a command changes the unit and whether the indoor plug may be power cycled
  protected readonly refresh = airconReadBack(async () => {
    await Promise.all([this.units.refresh(), this.cycle.refresh()]);
  });
  protected readonly refreshRules = (): Promise<void> => this.rules.refresh();
  // a power cycle changes what the plugs draw and whether the units answer
  protected readonly refreshCycle = async (): Promise<void> => {
    await Promise.all([this.cycle.refresh(), this.power.refresh(), this.units.refresh()]);
  };

  /** The period of both charts of the draw. */
  protected readonly period = historyPeriod('day');

  /** The units with an id, in the order of the rooms of the house; `undefined` until the first answer. */
  protected readonly shown = computed(() => {
    const units = this.units.value();
    if (units === undefined) {
      return undefined;
    }
    return Array.isArray(units)
      ? units.filter((unit) => unit.id !== undefined).sort((a, b) => rankOf(a) - rankOf(b))
      : [];
  });

  /** The rule of each unit by its id; `undefined` while the rules are not known. */
  private readonly ruleById = computed(() => {
    const rules = this.rules.value();
    if (!Array.isArray(rules)) {
      return undefined;
    }
    const byId = new Map<number, AirconRule>();
    rules.forEach((rule) => {
      if (rule.unitId !== undefined) {
        byId.set(rule.unitId, rule);
      }
    });
    return byId;
  });

  protected ruleOf(id: number | undefined): AirconRule | null | undefined {
    const byId = this.ruleById();
    return byId === undefined || id === undefined ? undefined : (byId.get(id) ?? null);
  }

  protected readonly plugs = computed(() => this.power.value() ?? undefined);
  protected readonly cycleState = computed(() => this.cycle.value() ?? undefined);
}
