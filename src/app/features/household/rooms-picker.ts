import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { ROOM_NAMES } from '../../data-access/household/registry-values';

/**
 * The rooms of a member, in the order "My room" shows them: the chosen ones as a list that can
 * be reordered and shortened, and below it every room that can still be added. A room is in
 * the list once - one that is chosen is no longer offered, so the registry's refusal of a
 * repeated room cannot be reached from here.
 *
 * A room is shown by its identifier, as everywhere in the application, and a chosen room this
 * version does not know stays in the list: the registry holds it, and an edit must not drop it.
 * Being text from the registry, a room is printed next to the words of a button, never put
 * into them as a parameter.
 */
@Component({
  selector: 'app-rooms-picker',
  imports: [MatButtonModule, MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      @if (rooms().length > 0) {
        <ol class="chosen" [attr.aria-label]="t('household.rooms.chosen')">
          @for (room of rooms(); track room; let index = $index) {
            <li class="chosen__room" [attr.data-room]="room">
              <span class="chosen__name">{{ room }}</span>
              <button
                matIconButton
                type="button"
                [disabled]="disabled() || index === 0"
                (click)="move(index, -1)"
              >
                <mat-icon>arrow_upward</mat-icon>
                <span class="visually-hidden"
                  >{{ t('household.rooms.moveUp') }}&ngsp;{{ room }}</span
                >
              </button>
              <button
                matIconButton
                type="button"
                [disabled]="disabled() || index === rooms().length - 1"
                (click)="move(index, 1)"
              >
                <mat-icon>arrow_downward</mat-icon>
                <span class="visually-hidden"
                  >{{ t('household.rooms.moveDown') }}&ngsp;{{ room }}</span
                >
              </button>
              <button matIconButton type="button" [disabled]="disabled()" (click)="take(room)">
                <mat-icon>close</mat-icon>
                <span class="visually-hidden">{{ t('household.rooms.take') }}&ngsp;{{ room }}</span>
              </button>
            </li>
          }
        </ol>
      } @else {
        <p class="none">{{ t('household.rooms.none') }}</p>
      }

      @if (offered().length > 0) {
        <ul class="offered" [attr.aria-label]="t('household.rooms.offered')">
          @for (room of offered(); track room) {
            <li>
              <button
                matButton="outlined"
                type="button"
                class="offered__room"
                [disabled]="disabled()"
                (click)="add(room)"
              >
                <mat-icon>add</mat-icon>
                <span class="visually-hidden">{{ t('household.rooms.add') }}&ngsp;</span>{{ room }}
              </button>
            </li>
          }
        </ul>
      }
    </ng-container>
  `,
  styles: `
    .chosen,
    .offered {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .chosen__room {
      display: flex;
      align-items: center;
      gap: 2px;
      padding-left: 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);

      & + & {
        margin-top: 4px;
      }
    }

    .chosen__name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
      font-weight: 600;
    }

    .none {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }

    .offered {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }

    // smaller than a button that does something: twenty of them stand side by side
    .offered__room {
      --mat-button-outlined-container-height: 32px;
      --mat-button-outlined-horizontal-padding: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsPicker {
  /** The chosen rooms, in display order. */
  readonly rooms = model.required<readonly string[]>();
  readonly disabled = input(false);

  protected readonly offered = computed(() =>
    ROOM_NAMES.filter((room) => !this.rooms().includes(room)),
  );

  protected add(room: string): void {
    this.rooms.update((rooms) => (rooms.includes(room) ? rooms : [...rooms, room]));
  }

  protected take(room: string): void {
    this.rooms.update((rooms) => rooms.filter((one) => one !== room));
  }

  protected move(index: number, by: -1 | 1): void {
    this.rooms.update((rooms) => {
      const target = index + by;
      if (target < 0 || target >= rooms.length) {
        return rooms;
      }
      const moved = [...rooms];
      [moved[index], moved[target]] = [moved[target], moved[index]];
      return moved;
    });
  }
}
