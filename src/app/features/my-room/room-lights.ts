import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { LightApi, RoomRule, RoomTurnAnswer } from '../../data-access/light/light-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { shortName } from '../../shared/device-names/device-names';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LightControl } from '../../shared/lights/light-control';
import { describeLightError, lightFailureOf } from '../../shared/lights/light-errors';
import {
  OCCUPANCY_LABELS,
  illuminationText,
  isLux,
  occupancyOf,
} from '../../shared/lights/light-labels';
import { lightReadBack } from '../../shared/lights/light-read-back';
import { lightRoomsOf } from '../lights/light-rooms';
import { ruleSummary } from '../lights/rule-summary';

/**
 * The lights of one room on "My room" (HAS-268): the occupancy of the room, each light with its
 * controls (on, off, the brightness of a dimmer, the colour of an rgbw light), the room at once
 * ("all off"), and the rule of the room in a few words with **the switch of the resident** - the
 * one way a resident stops the automation of their room (`PUT .../rules/resident-enabled`); the
 * rule itself is the administrator's, on the lights page.
 *
 * Pressable by the membership of the room, no permission (owner, 2026-10-18, as the blinds). **No
 * card for a room without lights** - an empty list, or the 404 `NOT_FOUND_LIGHT` - also while the
 * first answer is on its way; any other failure before an answer is told. Nothing optimistic: a
 * command is followed by the two reads of the lights (`lightReadBack`), the switch by a read of
 * the rule, and only those answers move the screen. **The switch does not flip itself**
 * (`disableToggleValue`): it shows `enabledByResident` as stored, also after a write that failed.
 */
@Component({
  selector: 'app-room-lights',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DisplayTextPipe,
    HouseAgePipe,
    LightControl,
  ],
  templateUrl: './room-lights.html',
  styleUrl: './room-lights.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class RoomLights {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  private readonly api = inject(LightApi);
  // the name is read when a call is made - by then the input is set, and it never changes
  protected readonly answer = this.api.watchRoom(() => this.room());
  protected readonly rule = this.api.watchRoomRule(() => this.room());

  protected readonly commands = new DeviceCommands<number>();
  protected readonly roomCommands = new DeviceCommands<string, RoomTurnAnswer | null>();
  protected readonly ruleCommands = new DeviceCommands<string, RoomRule | null>();
  protected readonly refresh = lightReadBack(() => this.answer.refresh());
  protected readonly describeError = describeLightError;
  protected readonly OCCUPANCY_LABELS = OCCUPANCY_LABELS;
  protected readonly illuminationText = illuminationText;
  protected readonly isLux = isLux;
  protected readonly lightFailureOf = lightFailureOf;

  /** `light-service` answers a room command for a room without lights with this code. */
  private readonly none = computed(() => this.answer.error()?.hasCode('NOT_FOUND_LIGHT') === true);

  /** The room as answered; `undefined` while the service has not answered with it. */
  private readonly view = computed(() => {
    if (this.none()) {
      return { room: this.room(), lights: [] as const };
    }
    const answer = this.answer.value();
    return lightRoomsOf(answer === undefined || answer === null ? undefined : [answer])?.[0];
  });

  /** The lights by name, each named without its room and its kind. */
  protected readonly lights = computed(() => {
    const view = this.view();
    return view === undefined
      ? undefined
      : [...view.lights]
          .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
          .map((light) => ({ light, name: shortName(light.name, this.room(), 'light') }));
  });

  /** Whether the card is shown: the room has lights, or nothing is known of them but a failure. */
  protected readonly shown = computed(() => {
    const lights = this.lights();
    return lights === undefined ? this.answer.error() !== undefined : lights.length > 0;
  });

  protected readonly occupancy = computed(() => this.view()?.occupancy);
  protected readonly occupancyState = computed(() => occupancyOf(this.occupancy()));

  /** The room has no rule: the service's 404 with its code - not a failure, nothing to switch. */
  protected readonly noRule = computed(() => this.rule.error()?.hasCode('NOT_FOUND_RULE') === true);
  protected readonly ruleKnown = computed(() => this.noRule() || this.rule.value() != null);
  protected readonly ruleView = computed((): RoomRule | undefined => {
    const rule = this.rule.value();
    return this.noRule() || rule === undefined || rule === null ? undefined : rule;
  });
  protected readonly summary = computed(() => {
    const rule = this.ruleView();
    return rule === undefined ? undefined : ruleSummary(rule);
  });

  protected readonly roomState = computed(() => this.roomCommands.stateOf(this.room()));
  protected readonly roomBusy = computed(() => this.roomState()?.sending === true);
  protected readonly lightSending = computed(() =>
    (this.lights() ?? []).some(({ light }) => this.commands.stateOf(light.id)?.sending),
  );
  protected readonly switchState = computed(() => this.ruleCommands.stateOf(this.room()));

  protected roomOff(): void {
    this.roomCommands.send(this.room(), this.api.roomTurn(this.room(), false), this.refresh);
  }

  /** The switch of the resident: the opposite of what is stored, read back from the service. */
  protected toggleAutomation(): void {
    const enabled = this.ruleView()?.enabledByResident;
    if (enabled === undefined) {
      return;
    }
    this.ruleCommands.send(this.room(), this.api.residentEnabled(this.room(), !enabled), () =>
      this.rule.refresh(),
    );
  }
}
