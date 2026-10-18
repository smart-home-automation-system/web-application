import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { heaterState } from '../../shared/room-heating/heater-labels';
import { RoomOverview } from './room-overview';
import { blindPositionLabel, shortWindowLabel } from './room-labels';

/**
 * One room of the room view (HAS-232): a card of one size, like the cards of the devices page,
 * with a line for every row of the owner - temperature, heating, lights, blinds, motion,
 * presence, opening sensors, the rest - each saying in short what the room has and what is known
 * of it. Nothing on it changes the house: "Details" opens the window with the controls.
 */
@Component({
  selector: 'app-room-tile',
  imports: [MatButtonModule, MatCardModule, MatIconModule, TranslocoDirective, LocalNumberPipe],
  templateUrl: './room-tile.html',
  styleUrl: './room-tile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomTile {
  readonly overview = input.required<RoomOverview>();

  /** The window with the devices of the room and their controls. */
  readonly details = output();

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly heaterState = heaterState;
  protected readonly windowLabel = shortWindowLabel;
  protected readonly positionLabel = blindPositionLabel;
}
