import {
  Battery,
  EnergyAlert,
  EnergyDay,
  EnergyFlows,
  EnergyForecast,
  EnergyMonths,
  EnergyStatus,
  GridOutage,
  GridReading,
  Inverter,
} from '../app/data-access/energy/energy-api';
import { houseTime } from './house-time';
import type { MockReply } from './handlers';

/**
 * The energy of the mock house (`energy-service`, HAS-341): a bright afternoon - the panels give
 * more than the house takes, the battery charges and the rest goes to the grid; phase B is above
 * its warning current, the SOFAR has one fault, the SOLAX cloud is silent. Invented values; the
 * times are worked out from the moment of the call, so they read as fresh.
 */
const at = (now: Date, secondsAgo: number) => houseTime(now, secondsAgo).slice(0, 26);

export function energyStatus(fresh: boolean, now: Date = new Date()): EnergyStatus {
  if (fresh) {
    // after a start nothing has been read: reachable null, the grid not known
    return {
      sources: ['meter', 'solax', 'sofar', 'solaxCloud'].map((source) => ({
        source,
        reachable: null,
      })),
      grid: { state: null },
    };
  }
  return {
    sources: [
      { source: 'meter', reachable: true, lastReadingAt: at(now, 4) },
      { source: 'solax', reachable: true, lastReadingAt: at(now, 9) },
      { source: 'sofar', reachable: true, lastReadingAt: at(now, 185) },
      { source: 'solaxCloud', reachable: false, lastReadingAt: at(now, 3_905) },
    ],
    grid: { state: 'present', since: at(now, 9 * 86_400) },
  };
}

export function energyFlows(fresh: boolean, now: Date = new Date()): EnergyFlows {
  if (fresh) {
    return {
      inputs: {
        grid: { stale: true },
        solax: { stale: true },
        sofar: { stale: true },
        battery: { stale: true },
      },
    };
  }
  return {
    production: 5_320,
    solaxPv: 3_410,
    sofarPv: 1_910,
    gridPower: -1_480,
    batteryPower: 2_150,
    houseLoad: 1_690,
    today: {
      production: 18.42,
      imported: 3.1,
      exported: 6.85,
      charged: 7.2,
      discharged: 1.4,
      houseLoad: 8.87,
      selfConsumption: 0.628,
      gridShare: 0.349,
    },
    inputs: {
      grid: { measuredAt: at(now, 4), stale: false },
      solax: { measuredAt: at(now, 9), stale: false },
      sofar: { measuredAt: at(now, 185), stale: false },
      battery: { measuredAt: at(now, 9), stale: false },
    },
  };
}

export function gridReading(fresh: boolean, now: Date = new Date()): GridReading {
  if (fresh) {
    return { stale: true };
  }
  return {
    phases: {
      a: {
        voltage: 236.4,
        current: 6.2,
        activePower: -480.2,
        apparentPower: 1_466,
        powerFactor: 0.33,
        frequency: 50,
      },
      b: {
        voltage: 233.9,
        current: 23.4,
        activePower: 412.6,
        apparentPower: 5_473,
        powerFactor: 0.08,
        frequency: 50,
      },
      c: {
        voltage: 237.1,
        current: 5.8,
        activePower: -1_412.4,
        apparentPower: 1_375,
        powerFactor: 0.97,
        frequency: 50,
      },
    },
    totalActivePower: -1_480,
    importEnergy: 1_234.5678,
    exportEnergy: 2_345.6789,
    direction: 'export',
    measuredAt: at(now, 4),
    stale: false,
  };
}

export function inverters(fresh: boolean, now: Date = new Date()): Inverter[] {
  const registry = [
    { id: 'solax', registryId: 64, name: 'SOLAX inverter', room: 'garage' },
    { id: 'sofar', registryId: 65, name: 'SOFAR inverter', room: 'boiler' },
  ];
  if (fresh) {
    return registry.map((inverter) => ({ ...inverter, stale: true }));
  }
  return [
    {
      ...registry[1],
      state: 'Grid connected',
      faults: ['GridOVP'],
      acPower: 1_850,
      pvPower: 1_910,
      pv: {
        pv1: { voltage: 512.3, current: 2.1, power: 1_076 },
        pv2: { voltage: 498.6, current: 1.7, power: 834 },
      },
      frequency: 50.01,
      temperature: 41,
      dailyYield: 6.92,
      totalYield: 5_432.1,
      measuredAt: at(now, 185),
      stale: false,
      source: 'solarman-cloud',
    },
    {
      ...registry[0],
      runMode: 'normal',
      acPower: 1_180,
      pvPower: 3_410,
      pv: {
        pv1: { voltage: 402.5, current: 5.3, power: 2_133 },
        pv2: { voltage: 380.1, current: 3.4, power: 1_277 },
      },
      gridPower: -1_455,
      frequency: 50.02,
      powerFactor: 0.99,
      temperature: 52,
      dailyYield: 11.5,
      totalYield: 4_567.8,
      measuredAt: at(now, 9),
      stale: false,
      source: 'local',
    },
  ];
}

export function battery(fresh: boolean, now: Date = new Date()): Battery {
  if (fresh) {
    return { stale: true };
  }
  return {
    soc: 68,
    health: 99,
    power: 2_150,
    direction: 'charging',
    voltage: 52.4,
    current: 41,
    temperature: 24,
    cycles: 123,
    remainingKwh: 18.02,
    chargedToday: 7.2,
    dischargedToday: 1.4,
    measuredAt: at(now, 9),
    stale: false,
    source: 'local',
  };
}

export function energyAlerts(fresh: boolean, now: Date = new Date()): EnergyAlert[] {
  if (fresh) {
    return [];
  }
  return [
    { source: 'sofar', kind: 'alarm', openedAt: at(now, 2 * 3_600 + 5), detail: 'GridOVP' },
    { source: 'phase b', kind: 'overload', openedAt: at(now, 7 * 60 + 5) },
  ];
}

export function gridOutages(fresh: boolean, now: Date = new Date()): GridOutage[] {
  if (fresh) {
    return [];
  }
  return [
    {
      startedAt: at(now, 23 * 86_400),
      endedAt: at(now, 23 * 86_400 - 2 * 3_600 - 600),
      socAtStart: 81,
      socAtEnd: 47,
      lowestSoc: 46,
    },
    // one long ago without a known end SOC
    { startedAt: at(now, 140 * 86_400), endedAt: at(now, 140 * 86_400 - 900), socAtStart: 55 },
  ];
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const dayOf = (text: string) => Date.parse(`${text}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `GET /home/energy/days?from=&to=`: a closed day per date up to yesterday, the third day of every week of the meter alone. */
export function energyDays(
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): MockReply {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    from === null ||
    to === null ||
    !pattern.test(from) ||
    !pattern.test(to) ||
    dayOf(from) > dayOf(to)
  ) {
    return { status: 400, body: { errors: [{ message: 'Invalid range', code: 'INVALID_RANGE' }] } };
  }
  if (fresh) {
    return { status: 200, body: [] };
  }
  const yesterday = dayOf(houseTime(now, 0).slice(0, 10)) - DAY_MS;
  const days: EnergyDay[] = [];
  for (let day = dayOf(from); day <= Math.min(dayOf(to), yesterday); day += DAY_MS) {
    const index = Math.round(day / DAY_MS);
    const sunny = 8 + ((index * 7) % 13);
    if (index % 7 === 3) {
      // a day the inverters were not read: the meter alone
      days.push({ day: isoDay(day), imported: 14.2, exported: 0.3 });
      continue;
    }
    const solaxYield = Math.round(sunny * 0.62 * 10) / 10;
    const sofarYield = Math.round(sunny * 0.38 * 10) / 10;
    const exported = Math.round(Math.max(0, sunny - 9) * 10) / 10;
    const imported = Math.round((19 - sunny * 0.8) * 10) / 10;
    days.push({
      day: isoDay(day),
      solaxYield,
      sofarYield,
      production: Math.round((solaxYield + sofarYield) * 10) / 10,
      imported,
      exported,
      charged: 4,
      discharged: 3.6,
      houseLoad: Math.round((solaxYield + sofarYield + imported - exported - 0.4) * 10) / 10,
    });
  }
  return { status: 200, body: days };
}

/** `GET /home/energy/months?year=`: the billing year from September, the first months closed. */
export function energyMonths(year: string | null, fresh: boolean): MockReply {
  const asked = Number(year);
  if (!Number.isInteger(asked)) {
    return { status: 400, body: { errors: [{ message: 'Malformed request' }] } };
  }
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = new Date(Date.UTC(asked, 8 + index, 1)).toISOString().slice(0, 7);
    return { month, days: 0, credited: 0, drawn: 0, bought: 0, expired: 0, stored: 0 };
  });
  const answer: EnergyMonths = {
    year: asked,
    from: months[0].month,
    to: months[11].month,
    ratio: 0.7,
    months: fresh
      ? months
      : months.map((month, index) =>
          asked === 2026 && index < 3
            ? [
                {
                  ...month,
                  days: 30,
                  production: 412.5,
                  imported: 120.4,
                  exported: 210.8,
                  houseLoad: 322.1,
                  credited: 147.56,
                  drawn: 120.4,
                  bought: 0,
                  expired: 0,
                  stored: 27.16,
                },
                {
                  ...month,
                  days: 31,
                  production: 198.2,
                  imported: 260.3,
                  exported: 52.1,
                  houseLoad: 406.4,
                  credited: 36.47,
                  drawn: 63.63,
                  bought: 196.67,
                  expired: 0,
                  stored: 0,
                },
                {
                  ...month,
                  days: 2,
                  production: 9.1,
                  imported: 31.2,
                  exported: 1.4,
                  houseLoad: 38.9,
                  credited: 0.98,
                  drawn: 0.98,
                  bought: 30.22,
                  expired: 0,
                  stored: 0,
                },
              ][index]
            : month,
        ),
  };
  return { status: 200, body: answer };
}

/**
 * `GET /home/energy/forecast` (HAS-372): a grey start of the week and the sun back on the fourth
 * day - today poor, tomorrow none, then poor, good, good, fair, poor - so the sentence reads "little
 * production for 3 days, better on <weekday>"; the SOLAX at a calibrated 0.62 on 9 days, the SOFAR
 * still at the initial 0.8; the two closed days with what the forecast gave beside what was
 * produced; 48 hours of power from the hour now. `no-readings` answers a service that has fetched
 * nothing: stale, no day.
 */
export function energyForecast(fresh: boolean, now: Date = new Date()): EnergyForecast {
  const ratios = {
    solax: { ratio: 0.62, calibratedOnDays: fresh ? 0 : 9 },
    sofar: { ratio: 0.8, calibratedOnDays: 0 },
  };
  if (fresh) {
    return { stale: true, performanceRatio: ratios, days: [], past: [], hourly: [] };
  }
  const today = dayOf(houseTime(now, 0).slice(0, 10));
  const plan: readonly [number, number, string, number, number][] = [
    // solax, sofar, category, cloud cover, sunshine hours
    [4.3, 2.5, 'poor', 96, 1],
    [1.1, 0.7, 'none', 100, 0],
    [3.9, 2.4, 'poor', 92, 1],
    [17.8, 10.6, 'good', 25, 6],
    [18.6, 11.2, 'good', 12, 7],
    [11.4, 6.9, 'fair', 55, 4],
    [5.2, 3.1, 'poor', 88, 2],
  ];
  const houseLoad = 24.6;
  const days = plan.map(([solax, sofar, category, cloudCover, sunshineHours], index) => {
    const total = Math.round((solax + sofar) * 100) / 100;
    return {
      day: isoDay(today + index * DAY_MS),
      solaxKwh: solax,
      sofarKwh: sofar,
      totalKwh: total,
      coverage: Math.round((total / houseLoad) * 100) / 100,
      category,
      cloudCover,
      sunshineHours,
    };
  });
  const start = Date.parse(`${houseTime(now, 0).slice(0, 13)}:00:00Z`);
  const hourly = Array.from({ length: 48 }, (_, index) => {
    const hour = start + index * 3_600_000;
    const sun = Math.max(0, Math.sin(((new Date(hour).getUTCHours() - 7) / 9) * Math.PI));
    const bright = index >= 24 ? 0.15 : 0.35;
    return {
      hour: `${new Date(hour).toISOString().slice(0, 13)}:00:00`,
      solaxKw: Math.round(sun * bright * 6.5 * 100) / 100,
      sofarKw: Math.round(sun * bright * 4 * 100) / 100,
      cloudCover: index >= 24 ? 100 : 90,
    };
  });
  return {
    fetchedAt: at(now, 17 * 60 + 5).slice(0, 19),
    stale: false,
    houseLoadKwh: houseLoad,
    houseLoadDays: 7,
    performanceRatio: ratios,
    days,
    past: [
      {
        day: isoDay(today - 2 * DAY_MS),
        solax: { forecastKwh: 12.4, actualKwh: 11.1 },
        sofar: { forecastKwh: 7.5, actualKwh: 7.9 },
      },
      {
        day: isoDay(today - DAY_MS),
        solax: { forecastKwh: 6.2, actualKwh: 5.4 },
        sofar: { forecastKwh: 3.8, actualKwh: 3.1 },
      },
    ],
    hourly,
    outlook: { sunBackOn: isoDay(today + 3 * DAY_MS), daysWithoutSun: 3 },
  };
}
