import type { MembersReport } from '../app/data-access/appliance/appliance-api';
import type { MockReply } from './handlers';
import { householdProfiles } from './household.fixtures';

/**
 * The chores report of the mock appliance service (HAS-345, HAS-346): the members of the mock registry on
 * the three mock appliances (61-63), made-up counts that grow with the length of the period, a former member,
 * a chore done away from home, muted cycles and cycles without the presence. `no-readings`: every member
 * with zeros - the report of a house where nothing was recorded yet. Invented names only.
 */
const APPLIANCES = [
  { applianceId: 61, name: 'Washing machine' },
  { applianceId: 62, name: 'Dryer' },
  { applianceId: 63, name: 'Dishwasher' },
] as const;

/** Per member in the order of the registry, per appliance: [opportunities, done, done away] of one month. */
const MONTH: readonly (readonly (readonly [number, number, number])[])[] = [
  [
    [9, 6, 0],
    [7, 3.5, 0],
    [12, 5, 1],
  ],
  [
    [8, 2, 0],
    [6, 2.5, 0],
    [10, 4, 0],
  ],
  [
    [4, 1, 0],
    [3, 0, 0],
    [6, 3, 0],
  ],
  [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
];

function count(opportunities: number, done: number, doneAway: number) {
  return {
    opportunities,
    done,
    doneAway,
    ...(opportunities > 0 ? { share: Math.round((done / opportunities) * 1000) / 1000 } : {}),
  };
}

function months(from: string, to: string): number {
  const [fromYear, fromMonth] = from.slice(0, 7).split('-').map(Number);
  const [toYear, toMonth] = to.slice(0, 7).split('-').map(Number);
  return Math.max(1, (toYear - fromYear) * 12 + (toMonth - fromMonth));
}

/** `GET /home/appliance/reports/members?from=&to=`; 400 INVALID_RANGE as the service refuses a range. */
export function membersReport(from: string | null, to: string | null, fresh: boolean): MockReply {
  if (from === null || to === null || to <= from) {
    return {
      status: 400,
      body: {
        errors: [
          { message: 'Invalid range', details: 'to must be after from', code: 'INVALID_RANGE' },
        ],
      },
    };
  }
  const factor = fresh ? 0 : months(from, to);
  const member = (name: string, rows: readonly (readonly [number, number, number])[]) => {
    const appliances = APPLIANCES.map((appliance, index) => {
      const [opportunities, done, doneAway] = rows[index] ?? [0, 0, 0];
      return { ...appliance, ...count(opportunities * factor, done * factor, doneAway * factor) };
    });
    const sum = (pick: (one: (typeof appliances)[number]) => number) =>
      appliances.reduce((total, one) => total + pick(one), 0);
    return {
      member: name,
      appliances,
      total: count(
        sum((one) => one.opportunities),
        sum((one) => one.done),
        sum((one) => one.doneAway),
      ),
    };
  };
  const report: MembersReport = {
    from,
    to,
    members: householdProfiles().map((profile, index) =>
      member(profile.name, MONTH[index % MONTH.length]),
    ),
    former: fresh
      ? []
      : [
          member('Zenon', [
            [2, 1, 0],
            [0, 0, 0],
            [1, 1, 0],
          ]),
        ],
    unattributed: fresh ? [] : [{ applianceId: 63, name: 'Dishwasher', count: 2 * factor }],
    unknownPresence: fresh ? 0 : 3,
  };
  return { status: 200, body: report };
}
