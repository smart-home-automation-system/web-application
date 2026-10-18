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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { ApiError, toApiError } from '../../../core/api/api-error';
import { PollingResource } from '../../../core/api/polling-resource';
import { isRecord } from '../../../core/util/is-record';
import { BlindSchedule, ScheduleToday } from '../../../data-access/blinds/blind-schedule';
import { BlindsApi } from '../../../data-access/blinds/blinds-api';
import { MessageKey } from '../../../i18n/messages';
import { ApiErrorStrip } from '../../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../../shared/data-freshness/data-freshness';
import { shortName } from '../../../shared/device-names/device-names';
import { DisplayTextPipe } from '../../../shared/display-text/display-text.pipe';
import { problemOf, validator } from '../../../shared/form-rules/form-rules';
import { LocalNumberPipe } from '../../../shared/local-number/local-number.pipe';
import { DAY_TYPE_LABELS, METRIC_LABELS, decisionText } from '../blind-labels';
import { AddressedBlind } from '../blind-room-card';
import { blindsOf, floorsOf } from '../blinds';
import { describeBlindsError } from '../blinds-errors';
import { ConditionForm, WindowEndForm, targetKey, targetOf } from './schedule-form';
import {
  ACTIONS,
  DAY_TYPES,
  MAX_CONDITIONS,
  MAX_HOLD_MINUTES,
  MAX_OFFSET_MINUTES,
  METRICS,
  WINDOW_KINDS,
  isTruth,
  nameProblem,
  normaliseName,
  rangeOf,
  targetsProblem,
  windowProblem,
} from './schedule-rules';

/** A choice of the select of the targets: a whole room, or one blind of it. */
interface TargetOption {
  readonly key: string;
  /** What the option reads, in its group. */
  readonly label?: string;
  /** What the field shows once it is chosen: the room or the whole name of the blind. */
  readonly chosen?: string;
  readonly wholeRoom?: boolean;
  /** A blind the select has no name for: told by its id of the registry. */
  readonly blindId?: number;
}

/** The options of one room, or of what the blinds no longer know (`room` left out). */
interface TargetGroup {
  readonly room?: string;
  /** For the group without a room: whether the blinds answered, so that they are known not to have it. */
  readonly answered?: boolean;
  readonly options: readonly TargetOption[];
}

/** How loading the schedule to change went. */
type Load =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly error: ApiError }
  | { readonly state: 'missing' }
  | { readonly state: 'ready' };

/**
 * The editor of a schedule of the blinds (HAS-253, the administrator's): `/blinds/schedules/new`
 * - with `?room=` to start with every blind of that room - and `/blinds/schedules/{id}`. The
 * fields of `Schedule` of `blinds-service`, each checked by the rule of the service before
 * anything is sent (`schedule-rules.ts`).
 *
 * **Nothing optimistic**: a save sends the schedule whole, then reads it again and shows what the
 * service stored - a new schedule by the id its answer carries, at its own address. A save that
 * failed keeps the form as it was entered, with the failure under it; one that got no answer may
 * have been carried out, and says so. Removing asks first, in place.
 *
 * The line of today is what the engine makes of the saved schedule (`/schedules/{id}/today`),
 * polled like the blinds page - never worked out here from the form.
 *
 * The id is read once: no link of the application leads from one schedule straight to another,
 * so the router never reuses this page for a second id.
 */
@Component({
  selector: 'app-schedule-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSliderModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DisplayTextPipe,
    LocalNumberPipe,
  ],
  templateUrl: './schedule-editor.html',
  styleUrl: './schedule-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleEditor {
  private readonly api = inject(BlindsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private destroyed = false;

  private readonly param = this.route.snapshot.paramMap.get('id');
  /** The schedule to change; `undefined` for a new one. */
  protected readonly id = idOf(this.param);

  /**
   * The blinds to choose from, read once - the select needs their names, not their state, so
   * nothing is polled. `undefined` until they answered with a list.
   */
  protected readonly blinds = signal<readonly AddressedBlind[] | undefined>(undefined);
  protected readonly blindsError = signal<ApiError | undefined>(undefined);
  protected readonly today: PollingResource<ScheduleToday | null> | undefined =
    this.id === undefined ? undefined : this.api.watchToday(this.id);

  protected readonly load = signal<Load>(
    // an address that names no id names no schedule
    this.param !== null && this.id === undefined
      ? { state: 'missing' }
      : this.id === undefined
        ? { state: 'ready' }
        : { state: 'loading' },
  );
  /** The schedule as the service stored it - what the form was filled from. */
  protected readonly stored = signal<BlindSchedule | undefined>(undefined);

  // the form
  protected readonly name = new FormControl('', {
    nonNullable: true,
    validators: validator(nameProblem),
  });
  protected readonly enabled = signal(true);
  protected readonly dayType = signal<string | undefined>(undefined);
  protected readonly from = new WindowEndForm();
  protected readonly to = new WindowEndForm();
  protected readonly targets = new FormControl<readonly string[]>([], {
    nonNullable: true,
    validators: (control) => {
      const problem = targetsProblem((control.value as readonly string[]).length);
      return problem === undefined ? null : { problem };
    },
  });
  protected readonly conditions = signal<readonly ConditionForm[]>([]);
  protected readonly action = signal<string | undefined>(undefined);
  protected readonly position = signal(50);

  /** Set by the first attempt to save: from then on a choice not made is told. */
  protected readonly attempted = signal(false);
  /** The two ends of the window as clock times say the same - checked at a save and after it. */
  protected readonly windowEmpty = signal<MessageKey | undefined>(undefined);

  protected readonly saving = signal(false);
  /** Why the last save did not end in the schedule read back, and what to say first. */
  protected readonly saveError = signal<Failure | undefined>(undefined);
  /** The last save was carried out and read back. */
  protected readonly saved = signal(false);
  protected readonly removing = signal(false);
  protected readonly askRemove = signal(false);
  protected readonly removeError = signal<Failure | undefined>(undefined);
  private readonly keep = viewChild<unknown, ElementRef<HTMLElement>>('keep', { read: ElementRef });

  protected readonly DAY_TYPES = DAY_TYPES;
  protected readonly WINDOW_KINDS = WINDOW_KINDS;
  protected readonly ACTIONS = ACTIONS;
  protected readonly METRICS = METRICS;
  protected readonly MAX_CONDITIONS = MAX_CONDITIONS;
  protected readonly MAX_OFFSET_MINUTES = MAX_OFFSET_MINUTES;
  protected readonly MAX_HOLD_MINUTES = MAX_HOLD_MINUTES;
  protected readonly METRIC_LABELS = METRIC_LABELS;
  protected readonly DAY_TYPE_LABELS = DAY_TYPE_LABELS;
  protected readonly problemOf = problemOf;
  protected readonly isTruth = isTruth;
  protected readonly rangeOf = rangeOf;
  protected readonly describeError = describeBlindsError;

  protected readonly kindLabels: Readonly<Record<string, MessageKey>> = {
    clock: 'blinds.editor.end.clock',
    sunrise: 'blinds.editor.end.sunrise',
    sunset: 'blinds.editor.end.sunset',
  };
  protected readonly actionLabels: Readonly<Record<string, MessageKey>> = {
    open: 'blinds.editor.action.open',
    close: 'blinds.editor.action.close',
    position: 'blinds.editor.action.position',
  };

  /** What the targets field holds, as a signal - a form control is none. */
  private readonly chosenKeys = signal<readonly string[]>([]);

  /**
   * The rooms with blinds and their blinds, in the order of the house - and every target the
   * schedule holds that the blinds do not know, kept as an option of its own so that a save does
   * not drop it unseen.
   */
  protected readonly targetGroups = computed((): readonly TargetGroup[] => {
    const rooms = floorsOf(this.blinds() ?? []).flatMap((floor) => floor.rooms);
    const groups: TargetGroup[] = rooms.map(({ room, blinds }) => ({
      room,
      options: [
        { key: `room:${room}`, chosen: room, wholeRoom: true },
        ...blinds.map((blind) => ({
          key: `blind:${blind.id}`,
          label: shortName(blind.name, room, 'blinds') ?? blind.name,
          chosen: blind.name,
        })),
      ],
    }));
    const known = new Set(groups.flatMap((group) => group.options.map((option) => option.key)));
    const held = [
      ...(this.stored()?.targets ?? []).flatMap((target) => targetKey(target) ?? []),
      ...this.chosenKeys(),
    ].filter((key, index, all) => !known.has(key) && all.indexOf(key) === index);
    return held.length === 0
      ? groups
      : [
          ...groups,
          {
            // until the blinds answered, nobody has said they are unknown
            answered: this.blinds() !== undefined,
            options: held.map((key) =>
              key.startsWith('room:')
                ? { key, chosen: key.slice('room:'.length), wholeRoom: true }
                : { key, blindId: Number(key.slice('blind:'.length)) },
            ),
          },
        ];
  });

  /** The chosen targets in words, for the field: "Every blind of office, Office window blinds". */
  protected readonly chosenTargets = computed(() => {
    const options = new Map(
      this.targetGroups().flatMap((group) => group.options.map((one) => [one.key, one])),
    );
    return this.chosenKeys().map((key) => ({ key, option: options.get(key) }));
  });

  /** The line of today: the window as it falls and what the engine does in this minute. */
  protected readonly todayLine = computed(() => {
    const today = this.today?.value();
    if (!isRecord(today)) {
      return undefined;
    }
    const answer = today as ScheduleToday;
    return {
      window: isRecord(answer.window) ? answer.window : undefined,
      decision: decisionText(answer.decision),
    };
  });

  constructor() {
    // "saved" goes with the first change after it: a click or a key in the form, or the select of
    // the targets, whose options are outside the form
    this.targets.valueChanges.subscribe((keys) => {
      this.chosenKeys.set(keys);
      this.saved.set(false);
    });
    for (const control of [...this.from.controls(), ...this.to.controls()]) {
      control.valueChanges.subscribe(() => this.checkWindow());
    }
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    // the question of removing takes the focus to its "Cancel"
    effect(() => this.keep()?.nativeElement.focus());

    if (this.id === undefined) {
      const room = this.route.snapshot.queryParamMap.get('room');
      if (room) {
        this.targets.setValue([`room:${room}`]);
      }
    } else if (this.id !== undefined) {
      void this.read(this.id, true);
    }
    firstValueFrom(this.api.readBlinds()).then(
      (answer) => this.blinds.set(blindsOf(answer)),
      (failure: unknown) => this.blindsError.set(toApiError(failure)),
    );
  }

  /**
   * The values of the stored schedule this version does not offer - a kind of an end, a metric, a
   * day type, an action - as they came. Sent back unchanged they would be read as something else
   * by nobody, or mixed with fields of another kind: the form refuses to save until each is chosen
   * anew.
   */
  protected readonly unknownValues = computed((): readonly string[] => {
    const known = (offered: readonly string[], value: string | undefined) =>
      value === undefined || offered.includes(value) ? [] : [value];
    return [
      ...known(DAY_TYPES, this.dayType()),
      ...known(WINDOW_KINDS, this.from.kind()),
      ...known(WINDOW_KINDS, this.to.kind()),
      ...this.conditions().flatMap((row) => known(METRICS, row.metric())),
      ...known(ACTIONS, this.action()),
    ];
  });

  protected setKind(end: WindowEndForm, kind: string): void {
    end.setKind(kind);
    this.checkWindow();
  }

  protected addCondition(): void {
    if (this.conditions().length < MAX_CONDITIONS) {
      this.conditions.update((rows) => [...rows, new ConditionForm()]);
    }
  }

  protected removeCondition(row: ConditionForm): void {
    this.conditions.update((rows) => rows.filter((one) => one !== row));
  }

  protected setPosition(value: number): void {
    this.position.set(value);
    this.saved.set(false);
  }

  /** Every rule checked again, the whole schedule sent, then read back. */
  protected async save(): Promise<void> {
    this.attempted.set(true);
    const controls = [
      this.name,
      this.targets,
      ...this.from.controls(),
      ...this.to.controls(),
      ...this.conditions().flatMap((row) => row.controls()),
    ];
    for (const control of controls) {
      control.markAsTouched();
      // checked again now: a control keeps the verdict of its last change
      control.updateValueAndValidity();
    }
    this.checkWindow();
    if (
      this.saving() ||
      controls.some((control) => control.invalid) ||
      this.dayType() === undefined ||
      this.action() === undefined ||
      this.windowEmpty() !== undefined ||
      this.unknownValues().length > 0
    ) {
      return;
    }
    const schedule = this.body();
    this.saving.set(true);
    this.saveError.set(undefined);
    this.saved.set(false);
    try {
      if (this.id === undefined) {
        const id = await firstValueFrom(this.api.createSchedule(schedule));
        // the new schedule is read at its own address; without an id it is on the blinds page
        await this.router.navigate(id === undefined ? ['/blinds'] : ['/blinds/schedules', id], {
          replaceUrl: true,
        });
        return;
      }
      await firstValueFrom(this.api.replaceSchedule(this.id, schedule));
      if (await this.read(this.id, true)) {
        this.saved.set(true);
      }
    } catch (failure: unknown) {
      this.saveError.set(
        failureOf(failure, 'blinds.editor.saveFailed', 'blinds.editor.saveNoAnswer'),
      );
    } finally {
      this.saving.set(false);
    }
    // what the engine makes of it follows the save, carried out or not
    void this.today?.refresh();
  }

  protected async remove(): Promise<void> {
    if (this.id === undefined || this.removing()) {
      return;
    }
    this.removing.set(true);
    this.removeError.set(undefined);
    try {
      await firstValueFrom(this.api.deleteSchedule(this.id));
      await this.router.navigate(['/blinds']);
    } catch (failure: unknown) {
      const said = failureOf(failure, 'blinds.editor.removeFailed', 'blinds.editor.removeNoAnswer');
      // a schedule the service does not know is gone all the same
      if (said.error.hasCode('NOT_FOUND_SCHEDULE')) {
        await this.router.navigate(['/blinds']);
        return;
      }
      this.removeError.set(said);
    } finally {
      this.removing.set(false);
      this.askRemove.set(false);
    }
  }

  /**
   * Reads the schedule and, with `fill`, puts it into the form. Answers whether it was read. A
   * failure of the first read is the page's; of a read after a save, the save's.
   */
  private async read(id: number, fill: boolean): Promise<boolean> {
    try {
      const schedule = await firstValueFrom(this.api.getSchedule(id));
      if (this.destroyed) {
        return false;
      }
      if (!isRecord(schedule)) {
        // after a save the schedule exists: an empty answer is a read that failed, not a schedule gone
        if (this.load().state === 'ready') {
          this.saveError.set({
            error: new ApiError('invalid-response', 200),
            summary: 'blinds.editor.readBackFailed',
          });
        } else {
          this.load.set({ state: 'missing' });
        }
        return false;
      }
      this.stored.set(schedule);
      if (fill) {
        this.fill(schedule);
      }
      this.load.set({ state: 'ready' });
      return true;
    } catch (failure: unknown) {
      const error = toApiError(failure);
      if (this.load().state !== 'ready') {
        this.load.set(
          error.hasCode('NOT_FOUND_SCHEDULE') ? { state: 'missing' } : { state: 'failed', error },
        );
      } else {
        this.saveError.set({ error, summary: 'blinds.editor.readBackFailed' });
      }
      return false;
    }
  }

  private fill(schedule: BlindSchedule): void {
    this.name.setValue(schedule.name ?? '');
    this.enabled.set(schedule.enabled !== false);
    this.dayType.set(schedule.dayType);
    this.from.fill(schedule.window?.from);
    this.to.fill(schedule.window?.to);
    this.targets.setValue((schedule.targets ?? []).flatMap((target) => targetKey(target) ?? []));
    this.conditions.set(
      (Array.isArray(schedule.conditions) ? schedule.conditions : []).map(
        (condition) => new ConditionForm(condition),
      ),
    );
    this.action.set(schedule.action);
    this.position.set(typeof schedule.position === 'number' ? schedule.position : 50);
    for (const control of [this.name, this.targets]) {
      control.markAsPristine();
      control.markAsUntouched();
    }
    this.attempted.set(false);
    this.checkWindow();
  }

  private checkWindow(): void {
    this.windowEmpty.set(
      this.attempted() ? windowProblem(this.from.value(), this.to.value()) : undefined,
    );
  }

  /** The schedule as it is sent - whole, `enabled` included: a write replaces it. */
  private body(): BlindSchedule {
    const action = this.action();
    return {
      name: normaliseName(this.name.value),
      enabled: this.enabled(),
      dayType: this.dayType(),
      window: { from: this.from.value(), to: this.to.value() },
      targets: this.targets.value.map(targetOf),
      conditions: this.conditions().map((row) => row.value()),
      action,
      ...(action === 'position' ? { position: this.position() } : {}),
    };
  }
}

/** What failed, with the sentence that comes first. */
interface Failure {
  readonly error: ApiError;
  readonly summary: MessageKey;
}

/** A change that got no answer may have been carried out all the same: that is not "failed". */
function failureOf(failure: unknown, failed: MessageKey, unanswered: MessageKey): Failure {
  const error = toApiError(failure);
  return { error, summary: error.kind === 'network' ? unanswered : failed };
}

/** The id of the address; `undefined` for `new`, or for anything that is no id. */
function idOf(text: string | null): number | undefined {
  return text !== null && /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : undefined;
}
