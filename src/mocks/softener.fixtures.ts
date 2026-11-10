import {
  Softener,
  SoftenerAlert,
  SoftenerDay,
  SoftenerHistory,
  SoftenerRegeneration,
} from '../app/data-access/water/softener-api';
import type { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The water softener of the mock house (HAS-402), in the shapes of `water-service`: a reading of the cloud, 30 days of
 * the salt going down from a refill, five regenerations every six days at 02:00 and two alerts of the cloud - invented
 * numbers in the range of the real softener. The regeneration can be scheduled, cancelled or started, and the live
 * stream opened, as the service would.
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

/** The regeneration scheduled for tonight by a command of the page; `running` after "now". */
let regeneration: 'none' | 'scheduled' | 'running' = 'none';
let liveUntil: number | undefined;
let lastCommandAt: number | undefined;

export function resetSoftener(): void {
  regeneration = 'none';
  liveUntil = undefined;
  lastCommandAt = undefined;
}

const refusal = (status: number, code: string, message: string, details: string): MockReply => ({
  status,
  body: { errors: [{ code, message, details }] },
});

/** `GET /home/water/softener` - read by the service 90 s ago; the flow moves only while the live stream is open. */
export function softener(now: Date = new Date()): Softener {
  const live = liveUntil !== undefined && liveUntil > now.getTime();
  return {
    reachable: true,
    online: true,
    measuredAt: houseTime(now, live ? 3 : 90).slice(0, 19),
    stale: false,
    water: {
      usedTodayLitres: 214,
      averageDailyLitres: 503,
      treatedAvailableLitres: 2_870,
      totalLitres: 425_526,
      flowLitresPerMinute: live ? 6.4 : 0,
    },
    // low on purpose: the amber warning of the salt and its flag are seen in the mock house (HAS-402)
    salt: { levelPercent: 15, daysLeft: 18, outOfSaltDate: dayOf(now.getTime() + 18 * DAY_MS) },
    regeneration: { daysSinceLast: 2, lastAt: dayOf(now.getTime() - 2 * DAY_MS), total: 156, status: regeneration },
    hardnessGpg: 12,
    hardnessMgCaco3: 205.4,
    daysInOperation: 917,
    signalDbm: -70,
    alerts: {
      lowSalt: true,
      leak: false,
      excessiveWaterUse: false,
      shutoffValve: false,
      resin: false,
      error: false,
    },
    live,
    ...(live && liveUntil !== undefined ? { liveUntil: houseTime(new Date(liveUntil), 0).slice(0, 19) } : {}),
  };
}

/** The salt over a range: a refill to 100 % 30 days ago, then about 2.8 % a day down to 15 %, a point a day. */
export function softenerHistory(from: string | null, to: string | null, now: Date = new Date()): SoftenerHistory {
  const points = [];
  for (let days = 30; days >= 0; days--) {
    const at = now.getTime() - days * DAY_MS;
    const level = Math.max(0, Math.round(100 - ((30 - days) * 85) / 30));
    points.push({ at: `${dayOf(at)}T00:00:00`, avg: level, min: level, max: level });
  }
  return { metric: 'saltLevel', from: from ?? undefined, to: to ?? undefined, bucketSeconds: 86_400, points };
}

/** Five regenerations, every six days at 02:01 for two hours, newest first. */
export function softenerRegenerations(now: Date = new Date()): SoftenerRegeneration[] {
  return [2, 8, 14, 20, 26].map((days) => {
    const day = dayOf(now.getTime() - days * DAY_MS);
    return {
      startedAt: `${day}T02:01:51`,
      endedAt: `${day}T04:03:46`,
      deviceStartedAt: `${day}T02:01:51`,
      running: false,
    };
  });
}

/** The litres through the softener on every day of the range up to today. */
export function softenerDays(from: string | null, to: string | null, now: Date = new Date()): SoftenerDay[] {
  const today = dayOf(now.getTime());
  const days: SoftenerDay[] = [];
  if (from === null || to === null) {
    return days;
  }
  for (let at = Date.parse(`${from}T00:00:00Z`); at <= Date.parse(`${to}T00:00:00Z`); at += DAY_MS) {
    const day = new Date(at).toISOString().slice(0, 10);
    if (day > today) {
      break;
    }
    days.push({ day, litres: 380 + ((Number(day.slice(8, 10)) * 37) % 160) });
  }
  return days;
}

/** Two alerts of the cloud: the salt, new; a connection lost and found, read. */
export function softenerAlerts(now: Date = new Date()): SoftenerAlert[] {
  return [
    {
      id: 'mock-salt',
      type: 'salt_level_2',
      title: 'Low Salt',
      message: 'Salt level is low',
      level: 'warning',
      at: houseTime(new Date(now.getTime() - 3 * DAY_MS), 0).slice(0, 19),
      read: false,
    },
    {
      id: 'mock-offline',
      type: 'connection_status_offline',
      title: 'Disconnected',
      message: 'Device went offline',
      level: 'critical',
      at: houseTime(new Date(now.getTime() - 40 * DAY_MS), 0).slice(0, 19),
      read: true,
    },
  ];
}

/** `POST` / `DELETE /home/water/softener/regeneration` - one command a minute, none while it regenerates. */
export function commandSoftener(when: string | null, cancel: boolean, now: number = Date.now()): MockReply {
  if (regeneration === 'running') {
    return refusal(409, 'REGENERATION_IN_PROGRESS', 'Regeneration in progress', 'The softener regenerates now');
  }
  if (lastCommandAt !== undefined && now - lastCommandAt < 60_000) {
    return refusal(409, 'COMMAND_TOO_SOON', 'Command too soon', 'One command a minute at most');
  }
  if (!cancel && when !== null && when !== 'now' && when !== 'tonight') {
    return refusal(400, 'INVALID_COMMAND', 'Invalid valve command', `when must be now or tonight, not '${when}'`);
  }
  lastCommandAt = now;
  let command = 'regenerate now';
  regeneration = 'running';
  if (cancel) {
    command = 'cancel the scheduled regeneration';
    regeneration = 'none';
  } else if (when === 'tonight') {
    command = 'regenerate tonight';
    regeneration = 'scheduled';
  }
  return {
    status: 202,
    body: {
      command,
      status: 'success',
      message: 'Command sent',
      sentAt: houseTime(new Date(now), 0).slice(0, 19),
    },
  };
}

/** `PUT /home/water/softener/live` - held for 5 minutes from now; `DELETE` closes it. */
export function openSoftenerLive(now: number = Date.now()): MockReply {
  liveUntil = now + 5 * 60_000;
  return { status: 200, body: { live: true, liveUntil: houseTime(new Date(liveUntil), 0).slice(0, 19) } };
}

export function closeSoftenerLive(): MockReply {
  liveUntil = undefined;
  return { status: 204, body: null };
}

/** A day of the house, `YYYY-MM-DD`. */
function dayOf(instant: number): string {
  return houseTime(new Date(instant), 0).slice(0, 10);
}
