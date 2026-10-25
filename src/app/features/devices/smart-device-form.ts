import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import {
  DeviceDetails,
  RegisteredDevice,
  SmartDevice,
} from '../../data-access/devices/device-registry-api';
import {
  OFFERED_KINDS,
  EATON_GATEWAYS,
  LIGHT_KINDS,
  PLACEMENTS,
  ROOM_NAMES,
} from '../../data-access/household/registry-values';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { normaliseMac, problemOf, validator } from '../../shared/form-rules/form-rules';
import { changeSummary, describeDeviceError } from './device-errors';
import {
  BINDING_LABELS,
  LIGHT_KIND_LABELS,
  PLACEMENT_LABELS,
  kindLabel,
  vendorLabel,
} from './device-labels';
import {
  Binding,
  channelsOf,
  isZone,
  FIRST_GENERATION_ON_MQTT,
  GENERATIONS,
  addressProblem,
  bindingOf,
  bindingTaken,
  bindingsOf,
  bluetoothAddressProblem,
  chosenProblem,
  deviceIdProblem,
  nameProblem,
  normaliseName,
  openingSensorsOf,
  pointOf,
  pointProblem,
  vendorsOf,
} from './device-rules';

/** The value of a toggle that stands for "not set" - a toggle group has no empty choice. */
const NOT_SET = '';

/**
 * The form of a device - a new one, or `device` as the registry holds it now. It checks what
 * the registry would refuse before anything is sent (`device-rules.ts`) and sends nothing
 * itself: `saved` carries the whole device as entered, and whoever shows the form makes the
 * change and tells how it ended (`busy`, `failure`).
 *
 * **The kind decides what the form asks for**: the ways such a device can be reached, and the
 * fields of that kind alone. The kind of a registered device cannot be changed - the registry
 * refuses it, because the services keep what they know of a device under its id.
 *
 * Created anew for every use, so it starts from the device as it is at that moment.
 */
@Component({
  selector: 'app-smart-device-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
  ],
  templateUrl: './smart-device-form.html',
  styleUrl: './smart-device-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartDeviceForm implements OnInit {
  /** Two forms on one page must not share the ids their groups are named by. */
  private static forms = 0;
  protected readonly id = `device-form-${SmartDeviceForm.forms++}`;

  /** The device to change; without one the form adds a device. */
  readonly device = input<RegisteredDevice>();
  /** Every other device of the registry: a binding belongs to one device. */
  readonly others = input<readonly SmartDevice[]>([]);
  /** The room a new device is offered first - the card the form was opened from. */
  readonly room = input<string>();
  /** A change is on its way. */
  readonly busy = input(false);
  /** Why the last attempt to save was not carried out. */
  readonly failure = input<ApiError>();

  readonly saved = output<DeviceDetails>();
  readonly cancelled = output();

  protected readonly notSet = NOT_SET;
  protected readonly generations = GENERATIONS;
  protected readonly isZone = isZone;
  protected readonly gateways = EATON_GATEWAYS;
  protected readonly lightKinds = LIGHT_KINDS;
  protected readonly lightKindLabels = LIGHT_KIND_LABELS;
  protected readonly placements = PLACEMENTS;
  protected readonly placementLabels = PLACEMENT_LABELS;
  protected readonly bindingLabels = BINDING_LABELS;
  protected readonly kindLabel = kindLabel;
  protected readonly vendorLabel = vendorLabel;
  protected readonly problemOf = problemOf;
  protected readonly describe = describeDeviceError;
  protected readonly summary = changeSummary;
  protected readonly firstGenerationOnMqtt = FIRST_GENERATION_ON_MQTT;

  // before the controls: the rule of the device id reads it, and a control is checked the
  // moment it is made
  protected readonly generation = signal<number>(FIRST_GENERATION_ON_MQTT);

  protected readonly name = new FormControl('', {
    nonNullable: true,
    validators: validator(nameProblem),
  });
  protected readonly roomName = new FormControl('', {
    nonNullable: true,
    validators: validator(chosenProblem('devices.problem.room')),
  });
  protected readonly kind = new FormControl('', {
    nonNullable: true,
    validators: validator(chosenProblem('devices.problem.kind')),
  });
  protected readonly address = new FormControl('', {
    nonNullable: true,
    validators: validator(addressProblem),
  });
  protected readonly deviceId = new FormControl('', {
    nonNullable: true,
    validators: validator((text) => deviceIdProblem(text, this.generation())),
  });
  protected readonly point = new FormControl('', {
    nonNullable: true,
    validators: validator(pointProblem),
  });
  protected readonly bluetooth = new FormControl('', {
    nonNullable: true,
    validators: validator(bluetoothAddressProblem),
  });

  protected readonly binding = signal<Binding>('shelly');
  protected readonly vendor = signal('shelly');
  /** `undefined`: a device without channels. */
  protected readonly channel = signal<number | undefined>(undefined);
  protected readonly gateway = signal<string>(EATON_GATEWAYS[0]);
  protected readonly lightKind = signal<string | undefined>(undefined);
  protected readonly placement = signal<string | undefined>(undefined);
  /** `undefined`: not known. */
  protected readonly positioning = signal<boolean | undefined>(undefined);
  protected readonly enabled = signal(true);
  /**
   * Blinds only (HAS-290): the ids of the opening sensors on their window - as the registry holds
   * them until the select is touched, then in the order of its options (the order means nothing).
   */
  protected readonly openingSensors = signal<readonly number[]>([]);
  /** Which binding of the form another device already has - found when the form was sent. */
  protected readonly taken = signal<MessageKey | undefined>(undefined);

  /** What the kind field holds, as a signal - a form control is none. */
  protected readonly chosenKind = signal('');

  /** The rooms and the kinds on offer - with the one the device has, known here or not. */
  protected readonly rooms = computed(() =>
    withHeld(withHeld(ROOM_NAMES, this.device()?.room), this.room()),
  );
  protected readonly kinds = computed(() => withHeld(OFFERED_KINDS, this.device()?.kind));
  /** The channels on offer for the chosen kind - with the one the device has, whatever it is. */
  protected readonly channels = computed(() =>
    channelsOf(this.chosenKind(), this.device()?.shelly?.channel),
  );

  /**
   * The opening sensors of the registry a window can be given, by room and name - and an id the
   * blinds hold that is none of them, kept as it is, so that saving does not drop it unseen.
   */
  /** What the field shows of the sensors chosen: their names, without the rooms of the list. */
  protected readonly chosenSensors = computed(() =>
    this.openingSensors().map(
      (id) => this.sensorOptions().find((option) => option.id === id) ?? { id, name: undefined },
    ),
  );

  protected readonly sensorOptions = computed((): readonly SensorOption[] => {
    const registered = this.others()
      .filter(
        (device): device is SmartDevice & { id: number } =>
          device.kind === 'opening sensor' && typeof device.id === 'number',
      )
      .map((device) => ({
        id: device.id,
        name: device.name,
        room: device.room,
        // blinds-service leaves a switched-off sensor out of its window
        off: device.enabled === false,
      }))
      .sort(
        (left, right) =>
          roomOrder(left.room) - roomOrder(right.room) ||
          (left.name ?? '').localeCompare(right.name ?? ''),
      );
    const held = openingSensorsOf(this.device() ?? {})
      .filter((id) => !registered.some((option) => option.id === id))
      .map((id) => ({ id, name: undefined, room: undefined, off: false }));
    return [...registered, ...held];
  });

  /** The ways a device of the chosen kind can be reached. */
  protected readonly bindings = computed(() => bindingsOf(this.chosenKind()));
  /**
   * The vendors a device reached that way can have - and the one the device has, should the
   * registry hold one this version does not know, for as long as its binding is kept.
   */
  protected readonly vendors = computed(() => {
    const offered = vendorsOf(this.binding());
    const held = this.device();
    return held?.vendor !== undefined && bindingOf(held) === this.binding()
      ? withHeld(offered, held.vendor)
      : offered;
  });

  constructor() {
    this.kind.valueChanges.subscribe((value) => this.chosenKind.set(value));
    // another kind may not be reached the way the form says, and another way not by that vendor
    effect(() => {
      const possible = this.bindings();
      if (!possible.includes(untracked(this.binding))) {
        this.binding.set(possible[0]);
      }
    });
    effect(() => {
      const possible = this.vendors();
      if (!possible.includes(untracked(this.vendor))) {
        this.vendor.set(possible[0]);
      }
    });
    // a zone is the channel of a presence sensor alone: another kind drops it
    // (the channels are read first: read after a check that can stop short, they would never be
    // tracked by an effect that first ran without a channel)
    effect(() => {
      const possible = this.channels();
      const channel = untracked(this.channel);
      if (channel !== undefined && !possible.includes(channel)) {
        this.channel.set(undefined);
      }
    });
    // what was found taken was found for the binding as it was then
    for (const control of [this.address, this.deviceId, this.point, this.bluetooth]) {
      control.valueChanges.subscribe(() => this.taken.set(undefined));
    }
  }

  ngOnInit(): void {
    const device = this.device();
    if (device === undefined) {
      this.roomName.setValue(this.room() ?? '');
      return;
    }
    this.name.setValue(device.name ?? '');
    this.roomName.setValue(device.room ?? '');
    this.kind.setValue(device.kind ?? '');
    // the registry refuses another kind for a device it already has
    this.kind.disable();
    this.enabled.set(device.enabled !== false);
    this.binding.set(bindingOf(device) ?? this.bindings()[0]);
    this.vendor.set(device.vendor ?? this.vendors()[0]);
    this.address.setValue(device.shelly?.address ?? '');
    this.generation.set(device.shelly?.generation ?? FIRST_GENERATION_ON_MQTT);
    this.deviceId.setValue(device.shelly?.deviceId ?? '');
    this.channel.set(device.shelly?.channel);
    this.gateway.set(device.eaton?.gateway ?? EATON_GATEWAYS[0]);
    this.point.setValue(device.eaton?.point === undefined ? '' : String(device.eaton.point));
    this.bluetooth.setValue(device.bthome?.address ?? '');
    this.lightKind.set(device.lightKind);
    this.placement.set(device.placement);
    this.positioning.set(device.positioning);
    this.openingSensors.set(openingSensorsOf(device));
    this.taken.set(undefined);
  }

  protected reachThrough(binding: Binding): void {
    this.binding.set(binding);
    this.taken.set(undefined);
  }

  protected setGeneration(generation: number): void {
    this.generation.set(generation);
    this.taken.set(undefined);
    // whether the id is needed follows from the generation
    this.deviceId.updateValueAndValidity();
  }

  protected setChannel(value: string): void {
    this.channel.set(value === NOT_SET ? undefined : Number(value));
    this.taken.set(undefined);
  }

  protected setGateway(gateway: string): void {
    this.gateway.set(gateway);
    this.taken.set(undefined);
  }

  protected setPositioning(value: string): void {
    this.positioning.set(value === NOT_SET ? undefined : value === 'yes');
  }

  protected orNotSet(value: string): string | undefined {
    return value === NOT_SET ? undefined : value;
  }

  protected submit(): void {
    const controls = [this.name, this.roomName, this.kind, ...this.controlsOf(this.binding())];
    for (const control of controls) {
      control.markAsTouched();
      // checked again now: a control keeps the verdict of its last change
      control.updateValueAndValidity();
    }
    // a disabled control is neither valid nor invalid: the kind of a registered device
    if (controls.some((control) => control.invalid) || this.busy()) {
      return;
    }
    const details = this.details();
    const taken = bindingTaken(details, this.others());
    this.taken.set(taken);
    if (taken === undefined) {
      this.saved.emit(details);
    }
  }

  private controlsOf(binding: Binding): readonly FormControl<string>[] {
    switch (binding) {
      case 'shelly':
        return [this.address, this.deviceId];
      case 'eaton':
        return [this.point];
      case 'bthome':
        return [this.bluetooth];
    }
  }

  /** The device as it is sent: one binding, and only the fields of its kind. */
  private details(): DeviceDetails {
    const kind = this.kind.value;
    const binding = this.binding();
    const deviceId = this.deviceId.value.trim();
    const channel = this.channel();
    const lightKind = this.lightKind();
    const placement = this.placement();
    const positioning = this.positioning();
    const openingSensors = this.openingSensors();
    return {
      name: normaliseName(this.name.value),
      room: this.roomName.value,
      kind,
      enabled: this.enabled(),
      vendor: this.vendor(),
      ...(binding === 'shelly'
        ? {
            shelly: {
              address: this.address.value.trim(),
              generation: this.generation(),
              ...(deviceId === '' ? {} : { deviceId }),
              ...(channel === undefined ? {} : { channel }),
            },
          }
        : {}),
      ...(binding === 'eaton'
        ? { eaton: { gateway: this.gateway(), point: pointOf(this.point.value) } }
        : {}),
      ...(binding === 'bthome' ? { bthome: { address: normaliseMac(this.bluetooth.value) } } : {}),
      ...(kind === 'light' && lightKind !== undefined ? { lightKind } : {}),
      ...(kind === 'blinds' && placement !== undefined ? { placement } : {}),
      ...(kind === 'blinds' && positioning !== undefined ? { positioning } : {}),
      ...(kind === 'blinds' && openingSensors.length > 0 ? { openingSensors } : {}),
    };
  }
}

/** An opening sensor on offer: one of the registry, or an id it does not hold (no name, no room). */
interface SensorOption {
  readonly id: number;
  readonly name: string | undefined;
  readonly room: string | undefined;
  readonly off: boolean;
}

/** The rooms in the order of the SDK, the order of the registry; one it does not know last. */
function roomOrder(room: string | undefined): number {
  const index = room === undefined ? -1 : ROOM_NAMES.indexOf(room);
  return index === -1 ? ROOM_NAMES.length : index;
}

/** What is offered, with the value a device holds when that is none of them. */
function withHeld(offered: readonly string[], held: string | undefined): readonly string[] {
  return held === undefined || held === '' || offered.includes(held) ? offered : [...offered, held];
}
