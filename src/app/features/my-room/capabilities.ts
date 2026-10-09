import { Type } from '@angular/core';

import { RoomHeating } from './room-heating';

/**
 * Something a room can show or do, as a card of the "My room" page. The page knows none of them
 * by name: it renders whatever this list holds, in this order, and hands each card the room it
 * is for. Heating is the first; lighting and blinds (control), the opening, motion and presence
 * sensors (view) and the air conditioning get an entry here when their services exist - and are
 * absent from the page until then, without a placeholder.
 */
export interface RoomCapability {
  /** Stable name of the capability, for tracking and tests. */
  readonly id: string;
  /**
   * The card. It takes one required input, `room` - the identifier of the room in the backend
   * (`living room`) - and is created anew for every room, so whatever it polls is asked for
   * that room alone and never shown under the name of another.
   */
  readonly component: Type<unknown>;
}

export const ROOM_CAPABILITIES: readonly RoomCapability[] = [
  { id: 'heating', component: RoomHeating },
];
