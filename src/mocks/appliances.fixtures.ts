import {
  Appliance,
  ApplianceRun,
  ApplianceSample,
} from '../app/data-access/appliance/appliance-api';
import { householdProfiles } from './household.fixtures';
import { houseTime } from './house-time';
import type { MockReply } from './handlers';

/**
 * The appliances of the mock household (HAS-282), as `appliance-service` answers them: the washing
 * machine runs, the dryer has finished and waits to be emptied, the dishwasher is idle. The times
 * are worked out from "now", a little off a round age. An acknowledgement changes what the next
 * read answers, in the memory of the page; `resetAppliances()` for a unit test that changed it.
 * Invented names and ids only - the repository is public.
 */
interface StoredAppliance {
  readonly id: number;
  readonly name: string;
  readonly room: string;
  state: 'idle' | 'running' | 'finishing' | 'finished';
  readonly watts: number;
  /** Seconds before "now" the cycle started, finished, began to wait. */
  readonly runningFor?: number;
  readonly finishedFor?: number;
  readonly awaitingFor?: number;
}

const AT_THE_START: readonly StoredAppliance[] = [
  {
    id: 61,
    name: 'Washing machine',
    room: 'boiler',
    state: 'running',
    watts: 1987.5,
    runningFor: 2_405,
  },
  {
    id: 62,
    name: 'Dryer',
    room: 'bathroom up',
    state: 'finished',
    watts: 0.4,
    runningFor: 5_405,
    finishedFor: 1_505,
    awaitingFor: 905,
  },
  { id: 63, name: 'Dishwasher', room: 'kitchen', state: 'idle', watts: 0.36 },
];

let appliances: StoredAppliance[] = AT_THE_START.map((one) => ({ ...one }));

export function resetAppliances(): void {
  appliances = AT_THE_START.map((one) => ({ ...one }));
}

function view(appliance: StoredAppliance, now: Date): Appliance {
  const cycle = appliance.state === 'running' || appliance.state === 'finishing';
  const finished = appliance.state === 'finished';
  return {
    id: appliance.id,
    name: appliance.name,
    room: appliance.room,
    state: appliance.state,
    watts: appliance.watts,
    sampledAt: houseTime(now, 12),
    ...(cycle && appliance.runningFor !== undefined
      ? { runningSince: houseTime(now, appliance.runningFor) }
      : {}),
    ...(finished && appliance.finishedFor !== undefined
      ? { finishedAt: houseTime(now, appliance.finishedFor) }
      : {}),
    ...(finished && appliance.awaitingFor !== undefined
      ? { awaitingSince: houseTime(now, appliance.awaitingFor) }
      : {}),
    reachable: true,
  };
}

/** `GET /home/appliance`; `no-readings`: just after a start of the service - nothing read yet. */
export function appliancesNow(fresh: boolean, now = new Date()): readonly Appliance[] {
  return appliances.map((appliance) =>
    fresh
      ? { id: appliance.id, name: appliance.name, room: appliance.room, state: 'idle' }
      : view(appliance, now),
  );
}

/** `GET /home/appliance/{id}`. */
export function oneAppliance(id: string, fresh: boolean): MockReply {
  const found = appliancesNow(fresh).find((appliance) => String(appliance.id) === id);
  return found === undefined ? notFound(id) : { status: 200, body: found };
}

/** `POST /home/appliance/{id}/acknowledge`: 204, or 409 when nothing waits. */
export function acknowledgeAppliance(id: string, member: string | null = null): MockReply {
  // HAS-347: a member the profiles do not have is refused before anything is acknowledged
  if (
    member !== null &&
    !householdProfiles().some((profile) => profile.name.toLowerCase() === member.trim().toLowerCase())
  ) {
    return {
      status: 400,
      body: {
        errors: [
          {
            message: 'Unknown household member',
            details: `No switched-on household member is named ${member}`,
            code: 'UNKNOWN_MEMBER',
          },
        ],
      },
    };
  }
  const appliance = appliances.find((one) => String(one.id) === id);
  if (appliance === undefined) {
    return notFound(id);
  }
  // HAS-348: a cycle still finishing is acknowledged too
  if (appliance.state !== 'finished' && appliance.state !== 'finishing') {
    return {
      status: 409,
      body: {
        errors: [
          {
            message: 'Nothing to acknowledge',
            details: `Appliance ${id} has no finished cycle waiting to be acknowledged`,
            code: 'NOTHING_TO_ACKNOWLEDGE',
          },
        ],
      },
    };
  }
  appliance.state = 'idle';
  return { status: 204, body: null };
}

/** `GET /home/appliance/{id}/runs` - the cycles of the day: a finished one, and the one that runs. */
export function applianceRuns(id: string, now = new Date()): readonly ApplianceRun[] {
  return id === '61'
    ? [
        {
          id: 1,
          startedAt: houseTime(now, 18_000),
          finishedAt: houseTime(now, 12_700),
          energyWh: 812,
          maxWatts: 2140,
          acknowledgedAt: houseTime(now, 11_000),
        },
        { id: 2, startedAt: houseTime(now, 2_405) },
      ]
    : [];
}

/** `GET /home/appliance/{id}/samples` - a few samples of the last minutes. */
export function applianceSamples(now = new Date()): readonly ApplianceSample[] {
  return [90, 60, 30].map((secondsAgo, index) => ({
    at: houseTime(now, secondsAgo),
    watts: [1950.2, 2010.8, 1987.5][index],
  }));
}

function notFound(id: string): MockReply {
  return {
    status: 404,
    body: {
      errors: [
        {
          message: 'Appliance not found',
          details: `No appliance with id ${id} is watched`,
          code: 'NOT_FOUND_APPLIANCE',
        },
      ],
    },
  };
}
