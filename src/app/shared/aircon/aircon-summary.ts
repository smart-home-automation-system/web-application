import { AirconUnit } from '../../data-access/aircon/aircon-api';
import { airconStateOf } from './aircon-labels';

/** A unit that is on, for the line of the overview: its room, its mode and its target as reported. */
export interface RunningUnit {
  readonly id: number;
  readonly room?: string;
  readonly mode?: string;
  readonly targetTemperature?: number;
}

/**
 * The units of the house counted for the tile of the overview (HAS-394): on, off and not known - a
 * unit that never reported its power is never off - how many do not answer, and the units that are
 * on, by room. `undefined` while the answer is no list.
 */
export interface AirconSummary {
  readonly total: number;
  readonly on: number;
  readonly off: number;
  readonly unknown: number;
  readonly unreachable: number;
  readonly running: readonly RunningUnit[];
}

export function summariseAircon(
  answer: readonly AirconUnit[] | null | undefined,
): AirconSummary | undefined {
  if (!Array.isArray(answer)) {
    return undefined;
  }
  const units = answer.filter((unit) => unit.id !== undefined);
  const states = units.map(airconStateOf);
  return {
    total: units.length,
    on: states.filter((state) => state === 'on').length,
    off: states.filter((state) => state === 'off').length,
    unknown: states.filter((state) => state === 'unknown').length,
    unreachable: units.filter((unit) => unit.reachable === false).length,
    running: units
      .filter((unit) => unit.power === true)
      .map((unit) => ({
        id: unit.id!,
        ...(unit.room === undefined ? {} : { room: unit.room }),
        ...(unit.mode === undefined ? {} : { mode: unit.mode }),
        ...(unit.targetTemperature === undefined
          ? {}
          : { targetTemperature: unit.targetTemperature }),
      })),
  };
}
