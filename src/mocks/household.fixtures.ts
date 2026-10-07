import { HouseholdMember } from '../app/data-access/household/household-api';

/**
 * `GET /home/household`, in the shape of a real answer: `rooms` is left out when a member has
 * none, and a deactivated member is still listed. Invented people; the room identifiers are the
 * public ones of `smart-home-sdk`. (The real registry also sends a phone number and the Wi-Fi
 * devices of every member - the application reads neither, so the fixture carries neither.)
 */
export const HOUSEHOLD: HouseholdMember[] = [
  { name: 'Aurelia', active: true, role: 'admin', rooms: ['office', 'living room'] },
  { name: 'Borys', active: true, role: 'resident', rooms: ['loft'] },
  { name: 'Celina', active: true, role: 'resident', rooms: ['bedroom', 'wardrobe'] },
  { name: 'Damian', active: true, role: 'resident' },
  { name: 'Emil', active: false, role: 'resident', rooms: ['garage'] },
];
