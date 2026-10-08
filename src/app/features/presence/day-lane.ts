import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { MessageKey } from '../../i18n/messages';
import { DayLane } from './day-lanes';

/**
 * One day as a bar from 00:00 to 24:00: filled where the resident was at home (or the house
 * occupied), pale where not, and hatched where nobody looked - before the history begins, and
 * after the last check. A period that is still going on ends in a marker instead of an edge. A
 * day whose periods the answer did not carry is hatched from end to end: not known is not "none".
 *
 * To a screen reader the bar is one picture, and its name says what the picture shows: the
 * filled periods by their times, which of them is still going on, and which part of the day was
 * observed at all - a day looked at until 15:29 is not a day spent away after it.
 */
@Component({
  selector: 'app-day-lane',
  template: `
    <div class="lane" role="img" [attr.aria-label]="name()">
      @if (lane().known) {
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
      }
    </div>
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

  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;

  /**
   * The words themselves, not a key: the name is put together from several texts. The times in
   * it are of our own making, so they may be parameters.
   */
  protected readonly name = computed(() => {
    // read so that the name follows a change of language
    this.language();
    const lane = this.lane();
    if (!lane.known) {
      return this.transloco.translate('presence.lane.unknown');
    }
    const stillGoingOn = this.transloco.translate('presence.legend.open');
    const periods = lane.blocks
      .map((block) => `${block.from}–${block.to}${block.open ? ` (${stillGoingOn})` : ''}`)
      .join(', ');
    const shown =
      lane.blocks.length > 0
        ? this.transloco.translate(this.filledLabel(), { periods })
        : this.transloco.translate(this.emptyLabel());
    return lane.whole
      ? shown
      : `${shown}. ${this.transloco.translate('presence.lane.observedPart', lane.observedClock)}.`;
  });
}
