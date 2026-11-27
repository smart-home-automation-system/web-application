import { readText } from '../app/core/storage/browser-storage';
import { MockReply } from './handlers';
import { householdProfiles } from './household.fixtures';

/**
 * The unlock of the amplifier of `media-service` (HAS-517): answered as the service answers - `source` must be
 * `dashboard`, the member a switched-on member of the household (`400 UNKNOWN_MEMBER`) granted `amplifier_unlock`
 * (`403 NOT_PERMITTED`), then 202 with no body. Nothing is kept: the amplifier has no state to read.
 *
 * `localStorage['mock-amplifier']` puts the amplifier in trouble: `off` - it cannot be reached (`503
 * AMPLIFIER_UNAVAILABLE`), `refused` - it did not take the file (`502 AMPLIFIER_REFUSED`), `slow` - no answer in time
 * (`504 AMPLIFIER_TIMEOUT`), `busy` - another unlock on its way (`409 UNLOCK_IN_PROGRESS`).
 */
const TROUBLE: Readonly<Record<string, MockReply>> = {
  off: refusal(503, 'The amplifier cannot be reached', 'AMPLIFIER_UNAVAILABLE'),
  refused: refusal(502, 'The amplifier refused the unlock', 'AMPLIFIER_REFUSED'),
  slow: refusal(504, 'The amplifier did not answer in time', 'AMPLIFIER_TIMEOUT'),
  busy: refusal(409, 'Another unlock of the amplifier is on its way', 'UNLOCK_IN_PROGRESS'),
};

function refusal(status: number, message: string, code: string): MockReply {
  return { status, body: { errors: [{ message, code }] } };
}

/** `POST /home/media/amplifier/unlock?source=dashboard&member=`. */
export function unlockAmplifier(source: string | null, member: string | null): MockReply {
  if (source !== 'dashboard') {
    return { status: 400, body: { errors: [{ message: 'source must be dashboard' }] } };
  }
  if (member === null || member.trim() === '') {
    return { status: 400, body: { errors: [{ message: 'member must not be blank' }] } };
  }
  const profile = householdProfiles().find(
    (candidate) => candidate.name.toLowerCase() === member.toLowerCase(),
  );
  if (profile === undefined) {
    return refusal(400, 'Unknown household member', 'UNKNOWN_MEMBER');
  }
  if (!(profile.permissions ?? []).includes('amplifier_unlock')) {
    return refusal(403, 'Not permitted to unlock the amplifier', 'NOT_PERMITTED');
  }
  const trouble = readText('mock-amplifier');
  if (trouble !== undefined && Object.hasOwn(TROUBLE, trouble)) {
    return TROUBLE[trouble];
  }
  return { status: 202, body: null };
}
