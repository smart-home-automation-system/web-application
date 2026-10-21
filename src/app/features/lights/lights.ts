import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { LightApi, RoomTurnAnswer } from '../../data-access/light/light-api';
import { MessageKey } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { houseText, phaseText } from '../../shared/lights/light-labels';
import { lightReadBack } from '../../shared/lights/light-read-back';
import { SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { LightRoomCard } from './light-room-card';
import { LIGHT_ROOM_WINDOW_SIZE, LightRoomWindow, LightRoomWindowData } from './light-room-window';
import { LightFloor, countStates, floorsOf, lightRoomsOf, rulesByRoom } from './light-rooms';

/**
 * The lights of the house (HAS-266, the administrator's): every light of `light-service` and the
 * occupancy of every room that has one, the rules of the rooms and the empty house. The layout is
 * the one of the blinds page (owner, 2026-10-18): at the top the whole house and the empty house
 * side by side; under them the floors, each a row of **room cards of one size**; what a room holds
 * besides its switches - the brightness and the colour of a light, its sensors, its rule and what
 * the engine did there - in a window of its own, from the button of its card.
 *
 * Three calls, each told once in the strip of sources at the top and never on a card: the lights
 * (with the occupancy of each room, one answer), the rules and the empty house. What a service did
 * not answer is "not known" - never off or empty.
 *
 * No optimistic state and no question first (the rule of the room view): a command is sent, the
 * lights are read again - and once more a moment later for an Eaton light (HAS-293) - and only that
 * answer moves the screen. One command per light and per room at a time, whichever card or window
 * sends it. The rules are only shown here: they are written by their editor (HAS-267).
 */
@Component({
  selector: 'app-lights',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
    HouseDateTimePipe,
    LightRoomCard,
    SourcesStrip,
  ],
  templateUrl: './lights.html',
  styleUrl: './lights.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class Lights {
  private readonly api = inject(LightApi);
  private readonly dialog = inject(MatDialog);
  protected readonly lights = this.api.watchLights();
  protected readonly rules = this.api.watchRules();
  protected readonly emptyHouse = this.api.watchEmptyHouse();

  protected readonly sources = [
    { id: 'lights', label: 'lights.sources.lights' as MessageKey, resource: this.lights },
    { id: 'rules', label: 'lights.sources.rules' as MessageKey, resource: this.rules },
    {
      id: 'empty-house',
      label: 'lights.sources.emptyHouse' as MessageKey,
      resource: this.emptyHouse,
    },
  ];

  /** The commands of the page - one per light and per room at a time, whichever card or window sends them. */
  protected readonly lightCommands = new DeviceCommands<number>();
  protected readonly roomCommands = new DeviceCommands<string, RoomTurnAnswer | null>();

  // a command is followed by a read of the lights, and a second one for an Eaton light (HAS-293)
  protected readonly readLights = lightReadBack(() => this.lights.refresh());

  protected readonly houseText = houseText;
  protected readonly phaseText = phaseText;
  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

  /** Every room with a light, as the service orders them; `undefined` while it has not answered with a list. */
  protected readonly rooms = computed(() => lightRoomsOf(this.lights.value()));

  protected readonly floors = computed(() => floorsOf(this.rooms() ?? []));

  /**
   * The cards of a floor are of one size: each has room for as many lights as the room of that floor
   * with the most. Not the most of the house - the seven lights of one outbuilding made every card of
   * the house seven lines tall and mostly empty (found on the live page).
   */
  protected linesOf(floor: LightFloor): number {
    return Math.max(1, ...floor.rooms.map((room) => room.lights.length));
  }

  /** The rules by room; `undefined` while the service has not answered with a list. */
  protected readonly ruleOf = computed(() => rulesByRoom(this.rules.value()));

  protected readonly counts = computed(() => countStates(this.rooms() ?? []));

  /** The rooms a presence sensor says somebody is in - by the name the service gives them. */
  protected readonly occupied = computed(() =>
    (this.rooms() ?? [])
      .filter((room) => room.occupancy?.occupied === true)
      .map((room) => room.room),
  );

  /** The name of a light by its registry id, for what the empty house lights. */
  private readonly names = computed(
    () =>
      new Map(
        (this.rooms() ?? []).flatMap((room) =>
          room.lights.map((light) => [light.id, light.name] as const),
        ),
      ),
  );

  protected readonly house = computed(() => {
    const answer = this.emptyHouse.value();
    return answer !== null && typeof answer === 'object' ? answer : undefined;
  });

  /** What the simulation lights now, by name - an id the lights did not answer with as it came. */
  protected readonly lit = computed(() => {
    const lit = this.house()?.lit;
    return Array.isArray(lit)
      ? lit.map((id) => this.names().get(id) ?? `#${String(id)}`).join(', ')
      : undefined;
  });

  protected openRoom(room: string): void {
    const data: LightRoomWindowData = {
      room,
      // signals: the window follows the service while it is open
      lights: computed(() => this.rooms()?.find((one) => one.room === room)?.lights ?? []),
      occupancy: computed(() => this.rooms()?.find((one) => one.room === room)?.occupancy),
      rule: computed(() => {
        const rules = this.ruleOf();
        return rules === undefined ? undefined : { rule: rules.get(room) };
      }),
      commands: this.lightCommands,
      roomBusy: computed(() => this.roomCommands.stateOf(room)?.sending === true),
      refresh: this.readLights,
    };
    this.dialog.open(LightRoomWindow, { ...LIGHT_ROOM_WINDOW_SIZE, data, autoFocus: 'dialog' });
  }
}
