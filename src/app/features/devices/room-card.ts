import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { RoomDevices as RoomGroup, countByKind } from './device-groups';
import { kindLabel } from './device-labels';

/**
 * One room on the page of the devices (HAS-290): what it has, counted by kind - every kind the
 * registry offers, "none" included, so every card says the same things and has the same size -
 * and the two ways into it. The devices themselves, and every change of them, are in the window
 * the buttons open (`RoomDialog`); the card holds no list, so a room of twenty devices takes no
 * more room than an empty one.
 */
@Component({
  selector: 'app-room-card',
  imports: [MatButtonModule, MatCardModule, MatIconModule, TranslocoDirective],
  templateUrl: './room-card.html',
  styleUrl: './room-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomCard {
  readonly group = input.required<RoomGroup>();
  /** A change of the registry is on its way: no window opens to start another. */
  readonly busy = input(false);

  /** The window with the devices of the room. */
  readonly details = output();
  /** The same window, with the form of a new device open. */
  readonly add = output();

  protected readonly kindLabel = kindLabel;
  protected readonly counts = computed(() => countByKind(this.group().devices));
}
