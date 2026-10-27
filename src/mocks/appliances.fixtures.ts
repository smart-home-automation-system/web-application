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

/**
 * A cycle of the mock history (HAS-283): when it started and ended, in seconds before "now", what it
 * used and who emptied it. Made up, the same for every load: an appliance's own rhythm over 30 days.
 */
interface MockRun {
  readonly start: number;
  readonly end?: number;
  readonly energyWh?: number;
  readonly maxWatts: number;
  readonly acknowledgedAfter?: number;
  readonly by?: string;
}

const HOUR = 3_600;
const DAY = 24 * HOUR;
const MEMBERS = ['Aurelia', 'Borys', 'Celina'];

/** The rhythm of each appliance: every how many hours a cycle starts, how long it takes, what it uses. */
const RHYTHM: Readonly<Record<string, { every: number; minutes: number; energyWh: number; maxWatts: number }>> = {
  '61': { every: 31, minutes: 85, energyWh: 760, maxWatts: 2180 },
  '62': { every: 43, minutes: 125, energyWh: 640, maxWatts: 520 },
  '63': { every: 26, minutes: 150, energyWh: 1180, maxWatts: 2050 },
};

/**
 * The cycles of 30 days, oldest first: the one going on now as the appliance list has it (the washing
 * machine runs, the dryer has finished and waits), one of the dishwasher without its energy - the
 * service leaves it out when it does not know it.
 */
function mockRuns(id: string): readonly MockRun[] {
  const rhythm = RHYTHM[id];
  if (rhythm === undefined) {
    return [];
  }
  const current = appliances.find((one) => String(one.id) === id);
  const runs: MockRun[] = [];
  // the past cycles, each a little off the rhythm so that the days differ
  for (let k = 1; k * rhythm.every * HOUR < 30 * DAY; k++) {
    const start = k * rhythm.every * HOUR + ((k * 37) % 120) * 60 + 3 * HOUR;
    const length = (rhythm.minutes + ((k * 13) % 25)) * 60;
    runs.push({
      start,
      end: start - length,
      energyWh: id === '63' && k === 4 ? undefined : rhythm.energyWh + ((k * 53) % 140),
      maxWatts: rhythm.maxWatts,
      acknowledgedAfter: 120 + ((k * 211) % 2_400),
      by: k % 4 === 3 ? undefined : MEMBERS[k % MEMBERS.length],
    });
  }
  if (current?.runningFor !== undefined) {
    runs.unshift({
      start: current.runningFor,
      end: current.finishedFor,
      energyWh: current.finishedFor === undefined ? undefined : rhythm.energyWh,
      maxWatts: rhythm.maxWatts,
    });
  }
  return runs;
}

/** `GET /home/appliance/{id}/runs?from=&to=` - the cycles that started in the range. */
export function applianceRuns(id: string, from: string | null, to: string | null, now = new Date()): readonly ApplianceRun[] {
  return mockRuns(id)
    .map((run, index): ApplianceRun => ({
      id: Number(id) * 1_000 + index,
      startedAt: houseTime(now, run.start),
      finishedAt: run.end === undefined ? undefined : houseTime(now, run.end),
      energyWh: run.energyWh,
      maxWatts: run.maxWatts,
      acknowledgedAt:
        run.end === undefined || run.acknowledgedAfter === undefined
          ? undefined
          : houseTime(now, run.end - run.acknowledgedAfter),
      acknowledgedBy: run.acknowledgedAfter === undefined ? undefined : run.by,
    }))
    .filter((run) => within(run.startedAt, from, to))
    .reverse();
}

/** The draw of a plug at a moment, in seconds before "now" - idle between cycles, the shape of each kind. */
function drawAt(id: string, secondsAgo: number): number {
  const run = mockRuns(id).find((one) => secondsAgo <= one.start && secondsAgo > (one.end ?? 0));
  const tick = Math.floor(secondsAgo / 30);
  if (run === undefined) {
    // the dryer turns its drum now and then after a cycle while it waits (the turns of 2026-10-26)
    const after = mockRuns(id).find((one) => one.end !== undefined && secondsAgo <= one.end && one.end - secondsAgo < 40 * 60);
    return id === '62' && after !== undefined && tick % 2 === 0 ? 170 + (tick % 5) * 8 : 0.4 + (tick % 3) * 0.1;
  }
  const into = run.start - secondsAgo;
  if (id === '61') {
    // heating, washing with a pause of three minutes - below idleBelowWatts - and the spin
    if (into < 15 * 60) return 2_050 + (tick % 4) * 30;
    if (into >= 40 * 60 && into < 43 * 60) return 1.8;
    return into > (run.start - (run.end ?? 0)) - 10 * 60 ? 420 + (tick % 6) * 25 : 140 + (tick % 7) * 20;
  }
  if (id === '62') {
    return 470 + (tick % 5) * 12;
  }
  return into < 25 * 60 || (into > 80 * 60 && into < 100 * 60) ? 1_980 + (tick % 3) * 25 : 35 + (tick % 4) * 5;
}

/** `GET /home/appliance/{id}/samples?from=&to=` - a sample every 30 s of the last 48 hours. */
export function applianceSamples(id: string, from: string | null, to: string | null, now = new Date()): readonly ApplianceSample[] {
  // the wall clock of the house as a timeline: one formatting, then arithmetic - 5760 samples of two days
  const nowWall = Date.parse(`${houseTime(now, 0).slice(0, 19)}Z`);
  const samples: ApplianceSample[] = [];
  for (let secondsAgo = 48 * HOUR; secondsAgo >= 0; secondsAgo -= 30) {
    const at = new Date(nowWall - secondsAgo * 1_000).toISOString().slice(0, 19);
    if (within(at, from, to)) {
      samples.push({ at, watts: Math.round(drawAt(id, secondsAgo) * 100) / 100 });
    }
  }
  return samples;
}

/** From included, to not - local date-times of the house compare as text. */
function within(at: string | undefined, from: string | null, to: string | null): boolean {
  const time = at?.slice(0, 19);
  return time !== undefined && (from === null || time >= from) && (to === null || time < to);
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
