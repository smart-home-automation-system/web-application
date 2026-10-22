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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { ApiError, toApiError } from '../../../core/api/api-error';
import { DeviceCommands } from '../../../core/api/device-commands';
import { isRecord } from '../../../core/util/is-record';
import { DeviceRegistryApi, SmartDevice } from '../../../data-access/devices/device-registry-api';
import { LightApi, RoomRule, RoomRuleBody } from '../../../data-access/light/light-api';
import { MessageKey } from '../../../i18n/messages';
import { ApiErrorStrip } from '../../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../../shared/data-freshness/data-freshness';
import { shortName } from '../../../shared/device-names/device-names';
import { DisplayTextPipe } from '../../../shared/display-text/display-text.pipe';
import { problemOf, validator } from '../../../shared/form-rules/form-rules';
import { HouseAgePipe } from '../../../shared/house-age/house-age.pipe';
import { describeLightError, lightFailureOf } from '../../../shared/lights/light-errors';
import { sensorKindText } from '../../../shared/lights/light-labels';
import { RuleRuns } from '../rule-runs';
import { PeriodForm } from './rule-form';
import {
  MAX_DELAY_MINUTES,
  MAX_LUX,
  MAX_PERIODS,
  MIN_DELAY_MINUTES,
  MIN_LUX,
  RoomDevices,
  eatonOnly,
  luxProblem,
  minutesProblem,
  overlapping,
  roomProblem,
  ruleProblem,
  wholeOf,
} from './room-rule-rules';

/** How loading the rule of the room went. A room without a rule is ready, with nothing stored. */
type Load =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: ApiError }
  | { readonly state: 'ready' };

/** What failed, with the sentence that comes first. */
interface Failure {
  readonly error: ApiError;
  readonly summary: MessageKey;
}

/** A light of the room as the registry knows it, for the list of what the rule can rely on. */
interface RoomLightRow {
  readonly id?: number;
  readonly name?: string;
  readonly lightKind?: string;
}

/** A presence or motion sensor of the room as the registry knows it. */
interface RoomSensorRow {
  readonly id?: number;
  readonly name?: string;
  readonly kind?: string;
  readonly eaton: boolean;
}

const SENSOR_KINDS = ['presence sensor', 'motion sensor'];

/**
 * The editor of the rule of a room (HAS-267, the administrator's): `/lights/rooms/{room}/rules` -
 * auto-off, motion-on with its periods per time of day, the lux gate, the manual hold, and the switch
 * of the resident. The fields of `RoomRuleBody` of `light-service`, each checked by the rule of the
 * service before anything is sent (`room-rule-rules.ts`), the body alone and against the room.
 *
 * **What the rule can rely on** is the room as the device registry knows it - its lights (whether
 * they dim, whether they take a colour) and its presence and motion sensors - one call, read every
 * minute with its freshness: the service judges a rule by the same registry. A room whose only
 * sensors are Eaton PIRs gets no rule: its lights stay with NetLinx (owner, HAS-262).
 *
 * **Nothing optimistic**: a save sends the rule whole, then reads it again and fills the form from
 * what the service stored. A save that failed keeps the form as it was entered, with the failure
 * under it; one that got no answer may have been carried out, and says so. Removing asks first, in
 * place. The switch of the resident is not part of the rule the administrator writes - it is the
 * switch of My room, sent at once and read back, and a save keeps it.
 *
 * Under the form, what the engine did in the room in the last 24 hours.
 */
@Component({
  selector: 'app-rule-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DisplayTextPipe,
    HouseAgePipe,
    RuleRuns,
  ],
  templateUrl: './rule-editor.html',
  styleUrl: './rule-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // the switch of the resident shows what the service stored, never the click before its answer
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class RuleEditor {
  private readonly api = inject(LightApi);
  private readonly router = inject(Router);
  private destroyed = false;

  /** The room, as the address names it - read once: the router makes the page anew for another. */
  protected readonly room = inject(ActivatedRoute).snapshot.paramMap.get('room') ?? '';

  /** The lights and sensors of the room in the device registry: what the rule can rely on. */
  protected readonly registry = inject(DeviceRegistryApi).watchRoom(() => this.room);

  protected readonly load = signal<Load>({ state: 'loading' });
  /** The rule as the service stored it; `undefined` for a room without one. */
  protected readonly stored = signal<RoomRule | undefined>(undefined);

  // the form
  protected readonly autoOffEnabled = signal(false);
  protected readonly autoOffDelay = new FormControl('', {
    nonNullable: true,
    validators: validator((text) => minutesProblem(text, this.autoOffEnabled())),
  });
  protected readonly motionOnEnabled = signal(false);
  protected readonly onlyBelowLux = new FormControl('', {
    nonNullable: true,
    validators: validator(luxProblem),
  });
  protected readonly motionOffAfter = new FormControl('', {
    nonNullable: true,
    validators: validator((text) => minutesProblem(text, this.motionOnEnabled())),
  });
  protected readonly periods = signal<readonly PeriodForm[]>([]);
  protected readonly manualHold = new FormControl('', {
    nonNullable: true,
    validators: validator((text) => minutesProblem(text, true)),
  });

  /** Set by the first attempt to save: from then on what the rule breaks as a whole is told. */
  protected readonly attempted = signal(false);
  /** Moves with every change of the form, so that what is judged of it as a whole follows it. */
  private readonly revision = signal(0);

  protected readonly saving = signal(false);
  protected readonly saveError = signal<Failure | undefined>(undefined);
  /** The last save was carried out and read back. */
  protected readonly saved = signal(false);
  protected readonly removing = signal(false);
  protected readonly askRemove = signal(false);
  protected readonly removeError = signal<Failure | undefined>(undefined);
  private readonly keep = viewChild<unknown, ElementRef<HTMLElement>>('keep', { read: ElementRef });

  /** The switch of the resident: one write at a time, then the rule is read again. */
  protected readonly residentCommands = new DeviceCommands<string, RoomRule | null>();
  protected readonly residentState = computed(() => this.residentCommands.stateOf(this.room));

  protected readonly problemOf = problemOf;
  protected readonly describeError = describeLightError;
  protected readonly lightFailureOf = lightFailureOf;
  protected readonly sensorKindText = sensorKindText;
  protected readonly MIN_DELAY_MINUTES = MIN_DELAY_MINUTES;
  protected readonly MAX_DELAY_MINUTES = MAX_DELAY_MINUTES;
  protected readonly MIN_LUX = MIN_LUX;
  protected readonly MAX_LUX = MAX_LUX;
  protected readonly MAX_PERIODS = MAX_PERIODS;

  protected readonly lightKindLabels: Readonly<Record<string, MessageKey>> = {
    relay: 'lights.editor.kind.relay',
    dimmer: 'lights.editor.kind.dimmer',
    rgbw: 'lights.editor.kind.rgbw',
  };

  /** The devices of the room the registry answered with; `undefined` until it answered with a list. */
  private readonly devices = computed((): readonly SmartDevice[] | undefined => {
    const answer: unknown = this.registry.value();
    return Array.isArray(answer)
      ? (answer as unknown[])
          .filter((device): device is SmartDevice => isRecord(device))
          // the room the registry was asked for, checked again: an answer is not checked at runtime
          .filter((device) => device.room === undefined || device.room === this.room)
      : undefined;
  });

  /** The lights of the room - a light without a `lightKind` is no light of the service. */
  protected readonly lights = computed((): readonly RoomLightRow[] | undefined =>
    this.devices()
      ?.filter((device) => device.kind === 'light' && typeof device.lightKind === 'string')
      .map((device) => ({ id: device.id, name: device.name, lightKind: device.lightKind }))
      .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? '')),
  );

  protected readonly sensors = computed((): readonly RoomSensorRow[] | undefined =>
    this.devices()
      ?.filter((device) => SENSOR_KINDS.includes(device.kind ?? ''))
      .map((device) => ({
        id: device.id,
        name: device.name,
        kind: device.kind,
        eaton: device.vendor === 'eaton' || device.eaton !== undefined,
      }))
      .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? '')),
  );

  /** The room as the rules of the service judge it; `undefined` while the registry is not known. */
  private readonly roomDevices = computed((): RoomDevices | undefined => {
    const lights = this.lights();
    const sensors = this.sensors();
    return lights === undefined || sensors === undefined ? undefined : { lights, sensors };
  });

  /** The names of the lights by their id, without the room - for the runs. */
  protected readonly names = computed(
    () =>
      new Map(
        (this.lights() ?? []).flatMap((light) =>
          light.id === undefined
            ? []
            : [[light.id, shortName(light.name, this.room, 'light') ?? light.name] as const],
        ),
      ),
  );

  /** What makes any rule of the room impossible: no light, or Eaton PIRs only. */
  protected readonly roomBlocked = computed((): MessageKey | undefined => {
    const devices = this.roomDevices();
    if (devices === undefined) {
      return undefined;
    }
    if (devices.lights.length === 0) {
      return 'lights.editor.problem.noLight';
    }
    return eatonOnly(devices) ? 'lights.editor.problem.eatonOnly' : undefined;
  });

  /** Whether a colour is offered: the room has an rgbw light. */
  protected readonly colorOffered = computed(
    () => this.lights()?.some((light) => light.lightKind === 'rgbw') === true,
  );

  /**
   * What the rule breaks as a whole - two periods that overlap, motion-on without a period, what
   * the room cannot do - told once a save was tried, and following every change after it.
   */
  protected readonly problems = computed(() => {
    this.revision();
    if (!this.attempted()) {
      return { overlap: undefined, noPeriod: false, room: undefined };
    }
    const body = this.body();
    const devices = this.roomDevices();
    const room = devices === undefined ? undefined : roomProblem(body, devices);
    return {
      overlap: overlapping(body.periods),
      noPeriod: body.motionOnEnabled && body.periods.length === 0,
      // the two that block any rule are told at the top of the page already
      room: room === this.roomBlocked() ? undefined : room,
    };
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    // the question of removing takes the focus to its "Cancel"
    effect(() => this.keep()?.nativeElement.focus());
    void this.read(true);
  }

  /** A change of the form: "saved" goes, and what is judged of it as a whole is judged again. */
  protected changed(): void {
    this.saved.set(false);
    this.revision.update((value) => value + 1);
  }

  protected setAutoOff(enabled: boolean): void {
    this.autoOffEnabled.set(enabled);
    // the delay is needed while the rule is on
    this.autoOffDelay.updateValueAndValidity();
    this.changed();
  }

  protected setMotionOn(enabled: boolean): void {
    this.motionOnEnabled.set(enabled);
    this.motionOffAfter.updateValueAndValidity();
    this.changed();
  }

  protected addPeriod(): void {
    if (this.periods().length < MAX_PERIODS) {
      this.periods.update((rows) => [...rows, new PeriodForm()]);
      this.changed();
    }
  }

  protected removePeriod(row: PeriodForm): void {
    this.periods.update((rows) => rows.filter((one) => one !== row));
    this.changed();
  }

  protected setColorOn(row: PeriodForm, on: boolean): void {
    row.setColorOn(on);
    this.changed();
  }

  protected setColor(row: PeriodForm, hex: string): void {
    row.setColor(hex);
    this.changed();
  }

  /** Every rule checked again, the whole rule sent, then read back. */
  protected async save(): Promise<void> {
    this.attempted.set(true);
    const controls = this.controls();
    for (const control of controls) {
      control.markAsTouched();
      // checked again now: a control keeps the verdict of its last change
      control.updateValueAndValidity();
    }
    this.changed();
    const problems = this.problems();
    if (
      this.saving() ||
      this.roomBlocked() !== undefined ||
      controls.some((control) => control.invalid) ||
      this.periods().some((row) => row.unreadable() !== undefined) ||
      problems.overlap !== undefined ||
      problems.noPeriod ||
      problems.room !== undefined
    ) {
      return;
    }
    const rule = this.body();
    // the last check: the order of the service, on what is about to be sent
    if (ruleProblem(rule) !== undefined) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(undefined);
    this.saved.set(false);
    try {
      await firstValueFrom(this.api.replaceRule(this.room, rule));
      if (await this.read(true)) {
        this.saved.set(true);
      }
    } catch (failure: unknown) {
      this.saveError.set(
        failureOf(failure, 'lights.editor.saveFailed', 'lights.editor.saveNoAnswer'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (this.stored() === undefined || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.removeError.set(undefined);
    try {
      await firstValueFrom(this.api.removeRule(this.room));
      await this.router.navigate(['/lights']);
    } catch (failure: unknown) {
      const said = failureOf(failure, 'lights.editor.removeFailed', 'lights.editor.removeNoAnswer');
      // a rule the service does not know is gone all the same
      if (said.error.hasCode('NOT_FOUND_RULE')) {
        await this.router.navigate(['/lights']);
        return;
      }
      this.removeError.set(said);
    } finally {
      this.removing.set(false);
      this.askRemove.set(false);
    }
  }

  /** The switch of the resident: the opposite of what is stored, then the rule read again. */
  protected toggleResident(): void {
    const enabled = this.stored()?.enabledByResident;
    if (typeof enabled !== 'boolean') {
      return;
    }
    this.residentCommands.send(
      this.room,
      this.api.residentEnabled(this.room, !enabled),
      // the form stays as it is: only what is stored moves
      async () => void (await this.read(false)),
    );
  }

  /**
   * Reads the rule and, with `fill`, puts it into the form. Answers whether it was read. A failure of
   * the first read is the page's; of a read after a save, the save's. `NOT_FOUND_RULE` is a room
   * without a rule - but not after a save, which has just written one.
   */
  private async read(fill: boolean): Promise<boolean> {
    const first = this.load().state !== 'ready';
    try {
      const rule = await firstValueFrom(this.api.readRule(this.room));
      if (this.destroyed) {
        return false;
      }
      if (!isRecord(rule)) {
        if (first) {
          this.load.set({ state: 'failed', error: new ApiError('invalid-response', 200) });
        } else if (fill) {
          this.saveError.set({
            error: new ApiError('invalid-response', 200),
            summary: 'lights.editor.readBackFailed',
          });
        }
        return false;
      }
      this.stored.set(rule);
      if (fill) {
        this.fill(rule);
      }
      this.load.set({ state: 'ready' });
      return true;
    } catch (failure: unknown) {
      if (this.destroyed) {
        return false;
      }
      const error = toApiError(failure);
      if (first) {
        if (error.hasCode('NOT_FOUND_RULE')) {
          this.stored.set(undefined);
          this.load.set({ state: 'ready' });
        } else {
          this.load.set({ state: 'failed', error });
        }
      } else if (fill) {
        this.saveError.set({ error, summary: 'lights.editor.readBackFailed' });
      } else if (error.hasCode('NOT_FOUND_RULE')) {
        // removed elsewhere: there is no switch left to show
        this.stored.set(undefined);
      }
      return false;
    }
  }

  private fill(rule: RoomRule): void {
    const text = (value: unknown) => (typeof value === 'number' ? String(value) : '');
    this.autoOffEnabled.set(rule.autoOffEnabled === true);
    this.autoOffDelay.setValue(text(rule.autoOffDelayMinutes));
    this.motionOnEnabled.set(rule.motionOnEnabled === true);
    this.onlyBelowLux.setValue(text(rule.onlyBelowLux));
    this.motionOffAfter.setValue(text(rule.motionOffAfterMinutes));
    this.periods.set(
      (Array.isArray(rule.periods) ? rule.periods : [])
        .filter(isRecord)
        .map((period) => new PeriodForm(period)),
    );
    this.manualHold.setValue(text(rule.manualHoldMinutes));
    for (const control of this.controls()) {
      control.markAsPristine();
      control.markAsUntouched();
    }
    this.attempted.set(false);
    this.changed();
  }

  private controls(): readonly FormControl<string>[] {
    return [
      this.autoOffDelay,
      this.onlyBelowLux,
      this.motionOffAfter,
      this.manualHold,
      ...this.periods().flatMap((row) => row.controls()),
    ];
  }

  /**
   * The rule as it is sent - whole: the two switches, the hold and the list of periods always; a
   * delay or a lux left empty is left out (the delay of a rule that is off is kept when it is given).
   */
  private body(): RoomRuleBody {
    const autoOffDelayMinutes = wholeOf(this.autoOffDelay.value);
    const onlyBelowLux = wholeOf(this.onlyBelowLux.value);
    const motionOffAfterMinutes = wholeOf(this.motionOffAfter.value);
    return {
      autoOffEnabled: this.autoOffEnabled(),
      ...(autoOffDelayMinutes === undefined ? {} : { autoOffDelayMinutes }),
      motionOnEnabled: this.motionOnEnabled(),
      ...(onlyBelowLux === undefined ? {} : { onlyBelowLux }),
      ...(motionOffAfterMinutes === undefined ? {} : { motionOffAfterMinutes }),
      periods: this.periods().map((row) => row.value()),
      manualHoldMinutes: wholeOf(this.manualHold.value) ?? Number.NaN,
    };
  }
}

/** A change that got no answer may have been carried out all the same: that is not "failed". */
function failureOf(failure: unknown, failed: MessageKey, unanswered: MessageKey): Failure {
  const error = toApiError(failure);
  return { error, summary: error.kind === 'network' ? unanswered : failed };
}
