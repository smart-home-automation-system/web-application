import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { DayLane } from './day-lanes';

/**
 * One day as a bar from 00:00 to 24:00: filled where the resident was at home (or the house
 * occupied), pale where not, and hatched where nobody looked - before the history begins, and
 * after the last check. A period that is still going on ends in a marker instead of an edge.
 *
 * To a screen reader the bar is one picture whose name lists the filled periods by their times.
 */
@Component({
  selector: 'app-day-lane',
  imports: [TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      <div class="lane" role="img" [attr.aria-label]="t(label(), { periods: periods() })">
        <span
          class="lane__observed"
          [style.left.%]="lane().observed.left"
          [style.width.%]="lane().observed.width"
        ></span>
        @for (block of lane().blocks; track $index) {
          <span
            class="lane__block"
            [class.lane__block--open]="block.open"
            [style.left.%]="block.left"
            [style.width.%]="block.width"
            [attr.title]="block.from + ' – ' + block.to"
          ></span>
        }
      </div>
    </ng-container>
  `,
  styleUrl: './day-lane.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayLaneBar {
  readonly lane = input.required<DayLane>();
  /** The name of the picture when something is filled; it takes the periods as `periods`. */
  readonly filledLabel = input.required<MessageKey>();
  /** The name of the picture when nothing is. */
  readonly emptyLabel = input.required<MessageKey>();

  protected readonly label = computed(() =>
    this.lane().blocks.length > 0 ? this.filledLabel() : this.emptyLabel(),
  );

  /** `00:00–07:12, 07:32–10:41` - times of our own making, so they may be a parameter. */
  protected readonly periods = computed(() =>
    this.lane()
      .blocks.map((block) => `${block.from}–${block.to}`)
      .join(', '),
  );
}
