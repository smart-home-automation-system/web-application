import { Blind, RoomBlinds } from '../app/data-access/blinds/blinds-api';
import type { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The blinds of the mock house (`blinds-service`), which can be moved: a command changes what the
 * next read answers, in the memory of the page - a reload is the house as it started. The ids are
 * those of the mock device registry (`devices.fixtures.ts`) - the two office blinds and the
 * terrace blinds of the living room - and one of the bedroom the registry does not list (HAS-254). A
 * blind moves at once here; a real one takes up to a minute.
 */
interface StoredBlind {
  readonly id: number;
  readonly name: string;
  readonly room: string;
  readonly vendor: string;
  readonly positioning: boolean;
  position?: number;
  state?: string;
  movedSecondsAgo?: number;
  window: string;
  pausedSecondsAgo?: number;
}

const AT_THE_START: readonly StoredBlind[] = [
  {
    id: 1,
    name: 'Office window blinds',
    room: 'office',
    vendor: 'shelly',
    positioning: true,
    position: 40,
    state: 'stopped',
    movedSecondsAgo: 2 * 3600 + 5,
    window: 'closed',
  },
  {
    id: 2,
    name: 'Office door blinds',
    room: 'office',
    vendor: 'shelly',
    positioning: true,
    position: 100,
    state: 'open',
    movedSecondsAgo: 5 * 3600 + 5,
    window: 'no sensor',
    pausedSecondsAgo: 25 * 60 + 5,
  },
  // an Eaton actuator: no position, and nothing heard of it since the start
  {
    id: 7,
    name: 'Living room terrace blinds',
    room: 'living room',
    vendor: 'eaton',
    positioning: false,
    window: 'no sensor',
  },
  // the blinds of the room of a resident (HAS-254, "My room"): closed for the night
  {
    id: 14,
    name: 'Bedroom window blinds',
    room: 'bedroom',
    vendor: 'shelly',
    positioning: true,
    position: 0,
    state: 'closed',
    movedSecondsAgo: 9 * 3600 + 5,
    window: 'closed',
  },
];

let blinds: StoredBlind[] = AT_THE_START.map((one) => ({ ...one }));

/** For a unit test that moved a blind. */
export function resetBlinds(): void {
  blinds = AT_THE_START.map((one) => ({ ...one }));
}

function view(blind: StoredBlind, now: Date): Blind {
  return {
    id: blind.id,
    name: blind.name,
    room: blind.room,
    vendor: blind.vendor,
    placement: 'external',
    positioning: blind.positioning,
    ...(blind.state !== undefined ? { state: blind.state } : {}),
    ...(blind.position !== undefined ? { position: blind.position } : {}),
    ...(blind.movedSecondsAgo !== undefined
      ? { movedAt: houseTime(now, blind.movedSecondsAgo), source: 'dashboard', reachable: true }
      : {}),
    window: blind.window,
    ...(blind.pausedSecondsAgo !== undefined
      ? { schedulePausedSince: houseTime(now, blind.pausedSecondsAgo) }
      : {}),
  };
}

export function blindsByRoom(now: Date = new Date()): RoomBlinds[] {
  const rooms = [...new Set(blinds.map((blind) => blind.room))];
  return rooms.map((room) => ({
    room,
    blinds: blinds.filter((blind) => blind.room === room).map((blind) => view(blind, now)),
  }));
}

function find(id: string): StoredBlind | undefined {
  return blinds.find((blind) => String(blind.id) === id);
}

const notFound: MockReply = {
  status: 404,
  body: { errors: [{ message: 'Blinds not found', code: 'NOT_FOUND_BLINDS' }] },
};

export function moveBlind(id: string, command: string | null): MockReply {
  const blind = find(id);
  if (!blind) {
    return notFound;
  }
  if (command === 'open' || command === 'close') {
    blind.state = command === 'open' ? 'open' : 'closed';
    blind.position = blind.positioning ? (command === 'open' ? 100 : 0) : undefined;
  } else if (command === 'stop') {
    blind.state = 'stopped';
  } else {
    return { status: 400, body: { errors: [{ message: 'command must be open, close or stop' }] } };
  }
  blind.movedSecondsAgo = 0;
  return { status: 202, body: null };
}

export function moveBlindTo(id: string, value: string | null): MockReply {
  const blind = find(id);
  const position = Number(value);
  if (!blind) {
    return notFound;
  }
  if (!blind.positioning) {
    return {
      status: 400,
      body: {
        errors: [{ message: 'Blinds cannot be sent to a position', code: 'UNSUPPORTED_POSITION' }],
      },
    };
  }
  if (!Number.isInteger(position) || position < 0 || position > 100) {
    return { status: 400, body: { errors: [{ message: 'value must be between 0 and 100' }] } };
  }
  blind.position = position;
  blind.state = 'stopped';
  blind.movedSecondsAgo = 0;
  return { status: 202, body: null };
}

export function pauseBlind(id: string, paused: boolean): MockReply {
  const blind = find(id);
  if (!blind) {
    return notFound;
  }
  if (!paused) {
    blind.pausedSecondsAgo = undefined;
  } else if (blind.pausedSecondsAgo === undefined) {
    blind.pausedSecondsAgo = 0;
  }
  return { status: 204, body: null };
}

/**
 * Every blind of a room, one after the other, as the service does it: the answer lists the blinds
 * moved and those skipped - none here, since a mock blind always takes the command.
 */
export function moveRoom(room: string, command: string | null): MockReply {
  const here = blinds.filter((blind) => blind.room === room);
  if (here.length === 0) {
    return notFound;
  }
  if (command !== 'open' && command !== 'close' && command !== 'stop') {
    return { status: 400, body: { errors: [{ message: 'command must be open, close or stop' }] } };
  }
  here.forEach((blind) => moveBlind(String(blind.id), command));
  return {
    status: 202,
    body: {
      room,
      command,
      moved: here.map((blind) => ({ id: blind.id, name: blind.name })),
      failed: [],
    },
  };
}
