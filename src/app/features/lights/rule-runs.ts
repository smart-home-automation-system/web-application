import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { LightApi, RuleRun } from '../../data-access/light/light-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { runActionText, runErrorText, runReasonText } from '../../shared/lights/light-labels';

/**
 * What the rules engine sent in one room in the last 24 hours (HAS-262) - its own call, with its own
 * freshness and failure, newest first. Shown in the window of a room (HAS-266) and under the editor of
 * its rule (HAS-267). A light is named by the name the caller gives its registry id, else by the id.
 *
 * Made anew for another room: the room is read once, when the polling starts.
 */
@Component({
  selector: 'app-rule-runs',
  imports: [TranslocoDirective, ApiErrorStrip, DataFreshness, DisplayTextPipe, HouseDateTimePipe],
  templateUrl: './rule-runs.html',
  styleUrl: './rule-runs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class RuleRuns {
  readonly room = input.required<string>();
  /** The names of the lights by their registry id. */
  readonly names = input<ReadonlyMap<number, string | undefined>>(new Map());

  private readonly api = inject(LightApi);
  // the room is read when the first call is made - by then the input is set, and it never changes
  protected readonly runs = this.api.watchRuns(() => this.room());

  protected readonly runActionText = runActionText;
  protected readonly runReasonText = runReasonText;
  protected readonly runErrorText = runErrorText;
  protected readonly DAY_TIME: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };

  /** The runs, newest first; a light named by its name, else by its id. */
  protected readonly rows = computed(() => {
    const answer: unknown = this.runs.value();
    if (!Array.isArray(answer)) {
      return undefined;
    }
    const names = this.names();
    return [...(answer as RuleRun[])]
      .filter((run) => run !== null && typeof run === 'object')
      .sort((left, right) => (right.at ?? '').localeCompare(left.at ?? ''))
      .map((run) => ({
        run,
        light:
          (typeof run.deviceId === 'number' ? names.get(run.deviceId) : undefined) ??
          `#${String(run.deviceId ?? '?')}`,
      }));
  });
}
