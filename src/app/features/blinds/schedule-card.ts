import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { ScheduleEntry } from '../../data-access/blinds/blind-schedule';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { DisplayText } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { toWindowView } from '../../shared/room-heating/room-views';
import { windowStateLabel } from '../../shared/room-heating/window-labels';
import {
  ConditionView,
  actionText,
  conditionStateText,
  conditionView,
  dayTypeText,
  decisionText,
  outcomeText,
  windowEndText,
} from './blind-labels';
import { AddressedBlind } from './blind-room-card';
import { describeBlindsError } from './blinds-errors';

/** A blind a schedule moves, as the card lists it. */
interface TargetRow {
  readonly key: string;
  /** The blind, when the target is one the page knows - which is what its pause needs. */
  readonly blind?: AddressedBlind;
  /** Its name, or the room for a target that is a whole room. */
  readonly name?: string;
  readonly room?: string;
  /** A whole room, from the schedule as stored: the engine did not say which blinds it has. */
  readonly wholeRoom?: boolean;
  readonly window?: DisplayText;
  readonly windowClosed?: DisplayText;
  readonly outcome?: DisplayText;
  readonly firedAt?: string;
}

/** A condition with what it says now. */
interface ConditionRow {
  readonly view: ConditionView;
  readonly state?: DisplayText;
  readonly trueSince?: string;
}

/**
 * One schedule of the blinds (HAS-252): the rule as stored, and what the engine of
 * `blinds-service` makes of it today - its window, the conditions and their values now, the
 * blinds it moves and what came of each - with the switch of the schedule and, per blind, the
 * pause of its schedules (HAS-232: it ends by itself with the next run it prevents).
 *
 * Neither switch flips itself: each shows the service, read again after the change. The schedules
 * are written by the editor of HAS-253; this card only switches one on and off.
 */
@Component({
  selector: 'app-schedule-card',
  imports: [
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    DisplayTextPipe,
    HouseAgePipe,
    LocalNumberPipe,
  ],
  templateUrl: './schedule-card.html',
  styleUrl: './schedule-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class ScheduleCard {
  readonly entry = input.required<ScheduleEntry>();
  /** The blinds of the page: their names, and whether their schedules are paused. */
  readonly blinds = input.required<readonly AddressedBlind[]>();
  /** Reads the schedules again, resolved when that call has answered. */
  readonly refreshSchedules = input.required<() => Promise<void>>();
  /** Reads the blinds again, resolved when that call has answered. */
  readonly refreshBlinds = input.required<() => Promise<void>>();

  private readonly api = inject(BlindsApi);
  private readonly switches = new DeviceCommands<'schedule'>();
  private readonly pauses = new DeviceCommands<number>();

  protected readonly describeError = describeBlindsError;

  protected readonly schedule = computed(() => this.entry().schedule);
  protected readonly today = computed(() => this.entry().today);
  protected readonly switchState = computed(() => this.switches.stateOf('schedule'));

  protected readonly dayType = computed(() => dayTypeText(this.schedule().dayType));
  protected readonly action = computed(() =>
    actionText(this.schedule().action, this.schedule().position),
  );
  protected readonly decision = computed(() => {
    const today = this.today();
    return today === undefined ? undefined : decisionText(today.decision);
  });

  /** The window as written: "06:30" to "sunrise + 60 min, at the latest 09:00". */
  protected readonly rule = computed(() => ({
    from: windowEndText(this.schedule().window?.from),
    to: windowEndText(this.schedule().window?.to),
  }));

  /** The conditions with their values now; the stored ones while the day is not known. */
  protected readonly conditions = computed((): readonly ConditionRow[] => {
    const today = this.today()?.conditions;
    if (Array.isArray(today)) {
      return today.map((condition) => ({
        view: conditionView(condition),
        state: conditionStateText(condition.state),
        ...(condition.trueSince !== undefined ? { trueSince: condition.trueSince } : {}),
      }));
    }
    const stored = this.schedule().conditions;
    return Array.isArray(stored)
      ? stored.map((condition) => ({ view: conditionView(condition) }))
      : [];
  });

  /** Whether the schedule says nothing of its conditions at all - not the same as none. */
  protected readonly conditionsUnknown = computed(
    () => !Array.isArray(this.today()?.conditions) && !Array.isArray(this.schedule().conditions),
  );

  protected readonly targets = computed((): readonly TargetRow[] => {
    const byId = new Map(this.blinds().map((blind) => [blind.id, blind]));
    const today = this.today()?.targets;
    if (Array.isArray(today)) {
      return today.map((target, index) => {
        const blind = typeof target.deviceId === 'number' ? byId.get(target.deviceId) : undefined;
        const outcome = outcomeText(target.outcome);
        return {
          key: `today-${target.deviceId ?? index}`,
          ...(blind ? { blind } : {}),
          name: target.name ?? blind?.name,
          room: target.room ?? blind?.room,
          ...(target.window !== undefined
            ? {
                window: {
                  key: windowStateLabel(toWindowView({ state: target.window })?.state ?? 'unknown'),
                },
              }
            : {}),
          ...(target.windowClosed !== undefined
            ? { windowClosed: conditionStateText(target.windowClosed) }
            : {}),
          ...(outcome ? { outcome } : {}),
          ...(target.firedAt !== undefined ? { firedAt: target.firedAt } : {}),
        };
      });
    }
    const stored = this.schedule().targets;
    return (Array.isArray(stored) ? stored : []).map((target, index): TargetRow => {
      if (typeof target.deviceId === 'number') {
        const blind = byId.get(target.deviceId);
        return {
          key: `stored-${target.deviceId}`,
          ...(blind ? { blind } : {}),
          name: blind?.name,
          room: blind?.room,
        };
      }
      return { key: `room-${target.room ?? index}`, room: target.room, wholeRoom: true };
    });
  });

  protected pauseState(id: number) {
    return this.pauses.stateOf(id);
  }

  protected setEnabled(): void {
    const id = this.schedule().id;
    if (typeof id !== 'number') {
      return;
    }
    // a click asks for the other state; the switch moves when the schedules read again say so
    const enabled = this.schedule().enabled !== true;
    this.switches.send(
      'schedule',
      this.api.setScheduleEnabled(id, enabled),
      this.refreshSchedules(),
    );
  }

  /** The pause of every schedule of one blind - the blinds are read again, then the schedules. */
  protected pause(blind: AddressedBlind): void {
    const call =
      blind.schedulePausedSince === undefined
        ? this.api.pauseSchedules(blind.id)
        : this.api.resumeSchedules(blind.id);
    const refreshBlinds = this.refreshBlinds();
    const refreshSchedules = this.refreshSchedules();
    this.pauses.send(blind.id, call, () => refreshBlinds().then(() => refreshSchedules()));
  }
}
