import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import {
  AIRCON_FAN_SPEEDS,
  AIRCON_MODES,
  AirconApi,
  AirconCommand,
  AirconMode,
  AirconUnit,
} from '../../data-access/aircon/aircon-api';
import {
  COOLING_MIN,
  NO_BOOST_MODES,
  TARGET_MAX,
  CommandProblem,
  commandProblem,
  lowestTarget,
} from '../../data-access/aircon/aircon-command-rules';
import { DisplayTextPipe } from '../display-text/display-text.pipe';
import { HouseAgePipe } from '../house-age/house-age.pipe';
import { HouseDateTimePipe } from '../house-date-time/house-date-time.pipe';
import {
  AIRCON_MODE_LABELS,
  AIRCON_STATE_LABELS,
  COMMAND_PROBLEM_TEXTS,
  airconFailureOf,
  airconStateOf,
  fanText,
  modeText,
} from './aircon-labels';

/**
 * One air conditioner with its controls (HAS-394, the card of My room; the page of the units of
 * HAS-395 takes it too): the state the unit last reported - on or off with its mode and target, the
 * reading of its own sensor, the window of its room and its restore, whether it answers - and the
 * commands: on and off, the mode, the target by a degree, the fan, quiet / turbo / sleep. **Nothing
 * optimistic**: a command goes through `commands` and is followed by `refresh` (a read at once and
 * one 2.5 s later), and only that answer moves what is shown; the switches do not flip themselves.
 * **A copy of `CommandRules` is checked first** (cooling never below 22 °C, 16-30 °C, turbo and
 * quiet not in dry or fan): a command it refuses is not sent and the reason is told. Switching to
 * cooling with a target below 22 °C sends 22 °C with it - the unit would refuse the mode alone.
 */
@Component({
  selector: 'app-aircon-control',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  templateUrl: './aircon-control.html',
  styleUrl: './aircon-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  host: { '[class.level]': 'level()' },
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class AirconControl {
  readonly unit = input.required<AirconUnit>();
  /** The name to show, without its room; the name of the registry when left out. */
  readonly name = input<string>();
  /** The commands of the page, one per unit at a time. */
  readonly commands = input.required<DeviceCommands<number>>();
  /** Reads the units again after a command. */
  readonly refresh = input.required<() => Promise<void>>();
  /**
   * Set where cards stand side by side (the page of the units): the seven rows of the control - the name, the
   * state, the notes, the modes, the settings, the switches, a failure - join the subgrid of the card, so each
   * row stands level with the same row of its neighbours whatever the notes above it say.
   */
  readonly level = input(false);

  private readonly api = inject(AirconApi);

  protected readonly MODES = AIRCON_MODES;
  protected readonly FAN_SPEEDS = AIRCON_FAN_SPEEDS;
  protected readonly MODE_LABELS = AIRCON_MODE_LABELS;
  protected readonly MODE_ICONS: Readonly<Record<AirconMode, string>> = {
    auto: 'autorenew',
    cool: 'ac_unit',
    dry: 'water_drop',
    fan: 'mode_fan',
    heat: 'sunny',
  };
  /** The icon of a mode by its word; a word this version does not know has none. */
  protected readonly MODE_ICONS_BY_WORD: Readonly<Record<string, string>> = this.MODE_ICONS;
  protected readonly STATE_LABELS = AIRCON_STATE_LABELS;
  protected readonly PROBLEM_TEXTS = COMMAND_PROBLEM_TEXTS;
  protected readonly TARGET_MAX = TARGET_MAX;
  protected readonly COOLING_MIN = COOLING_MIN;
  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  protected readonly modeText = modeText;
  protected readonly fanText = fanText;
  protected readonly airconFailureOf = airconFailureOf;

  protected readonly state = computed(() => airconStateOf(this.unit()));
  protected readonly commandState = computed(() => {
    const id = this.unit().id;
    return id === undefined ? undefined : this.commands().stateOf(id);
  });
  protected readonly busy = computed(
    () => this.unit().id === undefined || this.commandState()?.sending === true,
  );
  /** The settings can be changed once the unit has reported them: missing is never a choice. */
  protected readonly known = computed(() => this.unit().power !== undefined);
  protected readonly lowest = computed(() => lowestTarget(this.unit().mode));
  protected readonly noBoost = computed(() => {
    const mode = this.unit().mode;
    return mode !== undefined && NO_BOOST_MODES.includes(mode);
  });
  /** A mode this version knows, for the toggle group; a word it does not know selects nothing. */
  protected readonly knownMode = computed(() => {
    const mode = this.unit().mode;
    return (AIRCON_MODES as readonly string[]).includes(mode ?? '') ? mode : undefined;
  });
  /** Where the fan of the unit stands among the speeds of the service; -1 for one not known or not read. */
  protected readonly fanIndex = computed(() =>
    (AIRCON_FAN_SPEEDS as readonly string[]).indexOf(this.unit().fanSpeed ?? ''),
  );

  /** Why the last command was not sent - cleared by the next command. */
  protected readonly problem = signal<CommandProblem | undefined>(undefined);

  protected turn(on: boolean): void {
    this.send({ power: on });
  }

  protected setMode(mode: AirconMode): void {
    const target = this.unit().targetTemperature;
    // cooling with a target below 22 °C is refused by the unit: the target goes with the mode
    this.send(
      mode === 'cool' && target !== undefined && target < COOLING_MIN
        ? { mode, targetTemperature: COOLING_MIN }
        : { mode },
    );
  }

  protected step(by: number): void {
    const target = this.unit().targetTemperature;
    if (target !== undefined) {
      this.send({ targetTemperature: target + by });
    }
  }

  /** The next speed down or up, from auto through low to high (owner, 2026-11-13: a step, as the target). */
  protected stepFan(by: number): void {
    const next = AIRCON_FAN_SPEEDS[this.fanIndex() + by];
    if (this.fanIndex() >= 0 && next !== undefined) {
      this.send({ fanSpeed: next });
    }
  }

  protected flip(field: 'quiet' | 'turbo' | 'sleep'): void {
    const now = this.unit()[field];
    if (now !== undefined) {
      this.send({ [field]: !now });
    }
  }

  private send(command: AirconCommand): void {
    const unit = this.unit();
    if (unit.id === undefined) {
      return;
    }
    const problem = commandProblem(command, unit);
    this.problem.set(problem);
    if (problem !== undefined) {
      return;
    }
    this.commands().send(unit.id, this.api.command(unit.id, command), this.refresh());
  }
}
