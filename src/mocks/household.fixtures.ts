import { HouseholdProfile } from '../app/data-access/household/household-api';

/**
 * `GET /home/household/profiles`, in the shape of a real answer: the active members only,
 * `rooms` left out when a member has none. Invented people; the room identifiers are the public
 * ones of `smart-home-sdk`. (Emil, whom the tests know as switched off, is therefore not here:
 * the registry leaves such a member out.)
 */
export const HOUSEHOLD_PROFILES: HouseholdProfile[] = [
  { name: 'Aurelia', role: 'admin', rooms: ['office', 'living room'] },
  { name: 'Borys', role: 'resident', rooms: ['loft'] },
  // the one member the registry lets switch the heating of the whole house from their own page
  {
    name: 'Celina',
    role: 'resident',
    rooms: ['bedroom', 'wardrobe'],
    permissions: ['heating_switch'],
  },
  { name: 'Damian', role: 'resident' },
];
