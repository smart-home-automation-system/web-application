import { GarageAlert, GarageGate, GateEvent, GateRead } from '../app/data-access/gate/gate-api';
import { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The gates of the mock house (HAS-454), the shape of `gate-service` 0.10.0 with invented names: the driveway gate
 * last opened from the indoor screen, the door station connected; the garage gate "Left" closed for two hours, "Right"
 * open for 35 minutes with its warning. An opening and a pulse change what the next reads answer and are refused as
 * the service refuses them (`OPEN_TOO_SOON` within 15 s, `NOT_FOUND_GATE`, a source that is not the dashboard);
 * `no-readings` answers the gates as just after a start - nothing known. `resetGate()` for a unit test that changed them.
 */
interface StoredGarage {
  id: number;
  name: string;
  open: boolean;
  /** Seconds ago since the gate stands as it does, at the start; a press sets `changedAt`. */
  sinceSecondsAgo: number;
  changedAt?: number;
  lastCommandConfirmed?: boolean;
}

interface StoredEvent {
  readonly secondsAgo?: number;
  readonly at?: number;
  readonly event: Omit<GateEvent, 'at'>;
}

const GARAGES_AT_THE_START: readonly StoredGarage[] = [
  { id: 31, name: 'Left', open: false, sinceSecondsAgo: 2 * 3600 + 305 },
  { id: 32, name: 'Right', open: true, sinceSecondsAgo: 35 * 60 + 5 },
];

const HOUR = 3600;
const DAY = 24 * HOUR;

// a week and more of the timeline, the newest first: rings, unlocks from the screen, the pulses and the moves of the
// garage gates, a failed and a refused command
const EVENTS_AT_THE_START: readonly StoredEvent[] = [
  { secondsAgo: 35 * 60 + 5, event: { kind: 'garage', gate: 32, state: 'open' } },
  {
    secondsAgo: 35 * 60 + 9,
    event: { kind: 'command', source: 'dashboard', member: 'Aurelia', outcome: 'pulsed', gate: 32 },
  },
  {
    secondsAgo: 2 * HOUR + 305,
    event: { kind: 'garage', gate: 31, state: 'closed', openForSeconds: 1_140 },
  },
  { secondsAgo: 2 * HOUR + 1_445, event: { kind: 'garage', gate: 31, state: 'open' } },
  { secondsAgo: 3 * HOUR, event: { kind: 'command', source: 'screen', outcome: 'opened' } },
  {
    secondsAgo: 3 * HOUR + 2,
    event: { kind: 'unlock', door: 1, unlockType: 'HOUSEHOLDER', screen: '10010110001' },
  },
  { secondsAgo: 3 * HOUR + 30, event: { kind: 'ring', button: '10010100000' } },
  // HAS-499: an opening from a wall panel - the entrance or the hall one, one source
  { secondsAgo: 5 * HOUR, event: { kind: 'command', source: 'panel', outcome: 'opened' } },
  { secondsAgo: DAY + 600, event: { kind: 'dismissed' } },
  { secondsAgo: DAY + 660, event: { kind: 'ring', button: '10010100000' } },
  {
    secondsAgo: 2 * DAY,
    event: { kind: 'command', source: 'dashboard', member: 'Borys', outcome: 'opened' },
  },
  {
    secondsAgo: 2 * DAY + 5,
    event: { kind: 'command', source: 'dashboard', member: 'Borys', outcome: 'too soon' },
  },
  {
    secondsAgo: 4 * DAY,
    event: { kind: 'command', source: 'dashboard', member: 'Celina', outcome: 'failed' },
  },
  {
    secondsAgo: 9 * DAY,
    event: { kind: 'garage', gate: 32, state: 'closed', openForSeconds: 3 * HOUR + 600 },
  },
  { secondsAgo: 9 * DAY + 3 * HOUR + 600, event: { kind: 'garage', gate: 32, state: 'open' } },
  { secondsAgo: 20 * DAY, event: { kind: 'ring', button: '10010100000' } },
  // a visit a day for a month - a ring, the unlock from the screen and the opening: more than one page of the card
  ...Array.from({ length: 26 }, (_, day): StoredEvent[] => {
    const at = (day + 3) * DAY + 5 * HOUR;
    return [
      { secondsAgo: at, event: { kind: 'command', source: 'screen', outcome: 'opened' } },
      {
        secondsAgo: at + 2,
        event: { kind: 'unlock', door: 1, unlockType: 'HOUSEHOLDER', screen: '10010110001' },
      },
      { secondsAgo: at + 25, event: { kind: 'ring', button: '10010100000' } },
    ];
  }).flat(),
];

const OPEN_IGNORE_REPEAT_FOR_MS = 15_000;

let garages: StoredGarage[] = structuredClone([...GARAGES_AT_THE_START]);
let events: StoredEvent[] = [...EVENTS_AT_THE_START];
let lastOpening: { at: number; source: string; member?: string } | undefined;

export function resetGate(): void {
  garages = structuredClone([...GARAGES_AT_THE_START]);
  events = [...EVENTS_AT_THE_START];
  lastOpening = undefined;
}

const notFound = (): MockReply => ({
  status: 404,
  body: { errors: [{ message: 'Gate not found', code: 'NOT_FOUND_GATE' }] },
});

const badSource = (): MockReply => ({
  status: 400,
  body: { errors: [{ message: 'source must be dashboard' }] },
});

function secondsSince(at: number, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - at) / 1_000));
}

function sinceOf(garage: StoredGarage, now: Date): string {
  return houseTime(
    now,
    garage.changedAt === undefined ? garage.sinceSecondsAgo : secondsSince(garage.changedAt, now),
  );
}

/** `GET /home/gate`. */
export function gateRead(fresh: boolean, now = new Date()): GateRead {
  if (fresh) {
    return {};
  }
  return {
    gate: {
      id: 30,
      reachable: true,
      safe: true,
      autoOffSeconds: 1,
      checkedAt: houseTime(now, 125),
    },
    bridge: { online: true, at: houseTime(now, 6 * HOUR) },
    lastRing: { at: houseTime(now, 3 * HOUR + 30), button: '10010100000' },
    lastOpening:
      lastOpening === undefined
        ? { at: houseTime(now, 3 * HOUR), source: 'screen' }
        : {
            at: houseTime(now, secondsSince(lastOpening.at, now)),
            source: lastOpening.source,
            ...(lastOpening.member === undefined ? {} : { member: lastOpening.member }),
          },
  };
}

/** `GET /home/gate/garage`. */
export function garageGates(fresh: boolean, now = new Date()): readonly GarageGate[] {
  return garages.map((garage) =>
    fresh
      ? { id: garage.id, name: garage.name, state: 'unknown' }
      : {
          id: garage.id,
          name: garage.name,
          state: garage.open ? 'open' : 'closed',
          since: sinceOf(garage, now),
          confirmedAt: houseTime(now, 40),
          reachable: true,
          safe: true,
          ...(garage.lastCommandConfirmed === undefined
            ? {}
            : { lastCommandConfirmed: garage.lastCommandConfirmed }),
        },
  );
}

/** `GET /home/gate/garage/alerts`: open for 30 minutes is a warning - the mock judges only that one. */
export function garageAlerts(fresh: boolean, now = new Date()): readonly GarageAlert[] {
  if (fresh) {
    return [];
  }
  return garages
    .filter((garage) => garage.open)
    .map((garage) => ({ garage, openFor: secondsSinceOpen(garage, now) }))
    .filter(({ openFor }) => openFor >= 30 * 60)
    .map(({ garage, openFor }) => ({
      gate: garage.id,
      name: garage.name,
      kind: 'long',
      level: 'warning',
      openSince: houseTime(now, openFor),
      raisedAt: houseTime(now, openFor - 30 * 60),
      reminders: 0,
    }));
}

function secondsSinceOpen(garage: StoredGarage, now: Date): number {
  return garage.changedAt === undefined
    ? garage.sinceSecondsAgo
    : secondsSince(garage.changedAt, now);
}

/** `GET /home/gate/events?from=&to=`: the items of the range, the newest first. */
export function gateEvents(
  from: string | null,
  to: string | null,
  fresh: boolean,
  now = new Date(),
): MockReply {
  if (from === null || to === null || from >= to) {
    return { status: 400, body: { errors: [{ message: 'Invalid range', code: 'INVALID_RANGE' }] } };
  }
  if (fresh) {
    return { status: 200, body: [] };
  }
  const items = events
    .map((stored) => ({
      ...stored.event,
      at: houseTime(
        now,
        stored.at === undefined ? (stored.secondsAgo ?? 0) : secondsSince(stored.at, now),
      ),
    }))
    .filter((event) => event.at >= from && event.at < to)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return { status: 200, body: items };
}

/** `POST /home/gate/open?source=dashboard&member=`. */
export function openGate(
  source: string | null,
  member: string | null,
  now = new Date(),
): MockReply {
  if (source !== 'dashboard' || member === null || member.trim() === '') {
    return badSource();
  }
  if (lastOpening !== undefined && now.getTime() - lastOpening.at < OPEN_IGNORE_REPEAT_FOR_MS) {
    events = [
      { at: now.getTime(), event: { kind: 'command', source, member, outcome: 'too soon' } },
      ...events,
    ];
    return { status: 409, body: { errors: [{ message: 'Open too soon', code: 'OPEN_TOO_SOON' }] } };
  }
  lastOpening = { at: now.getTime(), source, member };
  events = [
    { at: now.getTime(), event: { kind: 'command', source, member, outcome: 'opened' } },
    ...events,
  ];
  return { status: 204, body: null };
}

/** `POST /home/gate/garage/{id}/pulse?source=dashboard&member=`: the gate moves and its sensor answers at once. */
export function pulseGarage(
  id: string,
  source: string | null,
  member: string | null,
  now = new Date(),
): MockReply {
  const garage = garages.find((candidate) => String(candidate.id) === id);
  if (garage === undefined) {
    return notFound();
  }
  if (source !== 'dashboard' || member === null || member.trim() === '') {
    return badSource();
  }
  const openedAt = garage.changedAt ?? now.getTime() - garage.sinceSecondsAgo * 1_000;
  garage.open = !garage.open;
  garage.changedAt = now.getTime();
  garage.lastCommandConfirmed = true;
  events = [
    {
      at: now.getTime(),
      event: {
        kind: 'garage',
        gate: garage.id,
        state: garage.open ? 'open' : 'closed',
        ...(garage.open ? {} : { openForSeconds: secondsSince(openedAt, now) }),
      },
    },
    {
      at: now.getTime(),
      event: { kind: 'command', source, member, outcome: 'pulsed', gate: garage.id },
    },
    ...events,
  ];
  return { status: 204, body: null };
}
