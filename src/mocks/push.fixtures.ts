import type { MockReply } from './handlers';
import { householdRegistry } from './household.fixtures';

/**
 * The Web Push subscriptions of the mock household (HAS-284), as database-service keeps them
 * (HAS-272): an upsert by the endpoint, a member switched off refused with `MEMBER_SWITCHED_OFF`, a
 * removal of what is not there answered 204. The public key is a made-up one of the right shape.
 */
export const MOCK_PUSH_PUBLIC_KEY = 'B' + 'Mock0Push0Key'.repeat(6) + 'AA';

const stored = new Map<string, { member: string; endpoint: string }>();

export function resetPush(): void {
  stored.clear();
}

/** Who holds which endpoint now - for the tests. */
export function pushSubscriptions(): readonly { member: string; endpoint: string }[] {
  return [...stored.values()];
}

export function pushConfig(fresh: boolean): MockReply {
  // a deployment without a key answers {} - the scenario of services that know nothing yet
  return { status: 200, body: fresh ? {} : { publicKey: MOCK_PUSH_PUBLIC_KEY } };
}

export function storePushSubscription(name: string, body: unknown): MockReply {
  const member = memberOf(name);
  if (!member) {
    return notFound(name);
  }
  if (!member.active) {
    return {
      status: 409,
      body: {
        errors: [
          {
            message: `Household member [${member.name}] is switched off and takes no push subscription`,
            code: 'MEMBER_SWITCHED_OFF',
          },
        ],
      },
    };
  }
  const endpoint = (body as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return {
      status: 400,
      body: { errors: [{ message: 'endpoint: must match "^https://\\S+$"' }] },
    };
  }
  stored.set(endpoint, { member: member.name, endpoint });
  return { status: 200, body };
}

export function removePushSubscription(name: string, endpoint: string | null): MockReply {
  const member = memberOf(name);
  if (!member) {
    return notFound(name);
  }
  if (!endpoint) {
    return { status: 400, body: { errors: [{ message: 'endpoint: must not be blank' }] } };
  }
  if (stored.get(endpoint)?.member === member.name) {
    stored.delete(endpoint);
  }
  return { status: 204, body: null };
}

function memberOf(name: string) {
  return householdRegistry().find((member) => member.name.toLowerCase() === name.toLowerCase());
}

function notFound(name: string): MockReply {
  return {
    status: 404,
    body: {
      errors: [
        { message: `Household member [${name}] not found`, code: 'NOT_FOUND_HOUSEHOLD_MEMBER' },
      ],
    },
  };
}
