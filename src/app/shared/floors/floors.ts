import { MessageKey } from '../../i18n/messages';

/** A part of the house and its rooms, in the order of the page. */
export interface Floor {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly string[];
}

/**
 * Which room lies where. The services know rooms, not floors: this list is the one place that
 * does, by the identifiers of `RoomName` in `smart-home-sdk`. The order is the order on a page,
 * within a floor too. Every page that lists rooms by floor reads it - the heating, the devices,
 * the rooms and the blinds.
 */
export const FLOORS: readonly Floor[] = [
  {
    id: 'ground',
    label: 'floors.ground',
    rooms: ['living room', 'kitchen', 'cinema', 'bathroom down', 'entrance', 'garage', 'boiler'],
  },
  {
    id: 'upper',
    label: 'floors.upper',
    rooms: ['office', 'tobi', 'livia', 'bedroom', 'wardrobe', 'bathroom up'],
  },
  // the halls and the stairs between the floors (owner, 2026-10-17, HAS-290): a group of their own
  {
    id: 'circulation',
    label: 'floors.circulation',
    rooms: ['hall down', 'stairs', 'hall up'],
  },
  { id: 'attic', label: 'floors.attic', rooms: ['loft'] },
  { id: 'outside', label: 'floors.outside', rooms: ['sanctum', 'sauna', 'garden'] },
];

/** The last group of a page: the rooms `FLOORS` does not know - one added to the house since. */
export const OTHER_FLOOR = { id: 'other', label: 'floors.other' } as const satisfies Omit<
  Floor,
  'rooms'
>;
