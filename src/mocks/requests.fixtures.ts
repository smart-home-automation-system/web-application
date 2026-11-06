import { MemberRequest } from '../app/data-access/household/member-requests-api';
import { requestTextProblem } from '../app/features/household/member-rules';
import type { MockReply } from './handlers';
import { householdRegistry } from './household.fixtures';
import { houseTime } from './house-time';

/**
 * The household requests of the mock household (HAS-411), as database-service 0.22.0 keeps them (HAS-409):
 * per recipient, open oldest first, `?done=true` adds those done; a write refused as the service refuses
 * it - `INVALID_REQUEST` by the copied rule, `NOT_FOUND_HOUSEHOLD_MEMBER`, `MEMBER_SWITCHED_OFF`,
 * `NOT_FOUND_REQUEST`. At the start Aurelia, the administrator of the mock, has two open requests - one
 * texted this morning, one written for her by Borys after it - and one done yesterday.
 */
interface StoredRequest {
  id: number;
  member: string;
  text: string;
  author: string;
  createdAt: string;
  sentAt?: string;
  doneAt?: string;
  doneBy?: string;
}

const HOUR = 3_600;

function atTheStart(now: Date): StoredRequest[] {
  return [
    {
      id: 1,
      member: 'Aurelia',
      text: 'Bread and milk',
      author: 'Aurelia',
      createdAt: houseTime(now, 20 * HOUR),
      sentAt: houseTime(now, 4 * HOUR),
    },
    {
      id: 2,
      member: 'Aurelia',
      text: 'Batteries for the remote',
      author: 'Borys',
      createdAt: houseTime(now, HOUR),
    },
    {
      id: 3,
      member: 'Aurelia',
      text: 'Take the parcel',
      author: 'Celina',
      createdAt: houseTime(now, 40 * HOUR),
      sentAt: houseTime(now, 28 * HOUR),
      doneAt: houseTime(now, 26 * HOUR),
      doneBy: 'Aurelia',
    },
  ];
}

let stored: StoredRequest[] | undefined;
let nextId = 4;

function requests(): StoredRequest[] {
  stored ??= atTheStart(new Date());
  return stored;
}

/** The requests as they started - for a unit test that changed them. */
export function resetRequests(): void {
  stored = undefined;
  nextId = 4;
}

export function memberRequests(name: string, done: boolean, fresh: boolean): MockReply {
  const member = memberOf(name);
  if (!member) {
    return notFound(name);
  }
  if (fresh) {
    return { status: 200, body: [] };
  }
  const body: MemberRequest[] = requests()
    .filter((request) => request.member === member.name && (done || request.doneAt === undefined))
    .map((request) => ({ ...request }));
  return { status: 200, body };
}

export function addRequest(name: string, body: unknown): MockReply {
  const member = memberOf(name);
  if (!member) {
    return notFound(name);
  }
  if (!member.active) {
    return switchedOff(member.name);
  }
  const { text, author } = (body ?? {}) as { text?: unknown; author?: unknown };
  if (typeof text !== 'string' || requestTextProblem(text) !== undefined) {
    return invalid('The text of a request is required, one line of 1 to 100 characters');
  }
  const writer = typeof author === 'string' ? memberOf(author) : undefined;
  if (!writer?.active) {
    return invalid('The author of a request is no member switched on');
  }
  const request: StoredRequest = {
    id: nextId++,
    member: member.name,
    text: text.trim(),
    author: writer.name,
    createdAt: houseTime(new Date(), 0),
  };
  requests().push(request);
  return { status: 201, body: { ...request } };
}

export function markRequestDone(name: string, id: string, by: string | null): MockReply {
  const request = requestOf(name, id);
  if (!request) {
    return requestNotFound(id);
  }
  const who = by === null ? undefined : memberOf(by);
  if (!who?.active) {
    return invalid('Who ticks a request off is no member switched on');
  }
  // done twice keeps the first time
  request.doneAt ??= houseTime(new Date(), 0);
  request.doneBy ??= who.name;
  return { status: 200, body: { ...request } };
}

export function removeRequest(name: string, id: string): MockReply {
  const request = requestOf(name, id);
  if (!request) {
    return requestNotFound(id);
  }
  stored = requests().filter((kept) => kept !== request);
  return { status: 204, body: null };
}

function requestOf(name: string, id: string): StoredRequest | undefined {
  const member = memberOf(name);
  return requests().find((request) => request.member === member?.name && String(request.id) === id);
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

function switchedOff(name: string): MockReply {
  return {
    status: 409,
    body: {
      errors: [
        { message: `Household member [${name}] is switched off`, code: 'MEMBER_SWITCHED_OFF' },
      ],
    },
  };
}

function invalid(message: string): MockReply {
  return { status: 400, body: { errors: [{ message, code: 'INVALID_REQUEST' }] } };
}

function requestNotFound(id: string): MockReply {
  return {
    status: 404,
    body: {
      errors: [{ message: `Household request [${id}] not found`, code: 'NOT_FOUND_REQUEST' }],
    },
  };
}
