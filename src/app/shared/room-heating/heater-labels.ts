import { MessageKey } from '../../i18n/messages';
import { HeaterKind, HeaterView } from './room-views';

const KIND_LABELS: Record<HeaterKind, MessageKey> = {
  radiator: 'heating.rooms.heater.radiator',
  floor: 'heating.rooms.heater.floor',
  other: 'heating.rooms.heater.other',
};

const KIND_ICONS: Record<HeaterKind, string> = {
  radiator: 'heat',
  floor: 'floor',
  other: 'device_thermostat',
};

export function heaterKindLabel(heater: HeaterView): MessageKey {
  return KIND_LABELS[heater.kind];
}

/** Name of a Material Symbols icon. */
export function heaterKindIcon(heater: HeaterView): string {
  return KIND_ICONS[heater.kind];
}

/** What the relay last reported, in words - "no status yet" where it has not, never "off". */
export function heaterStateLabel(heater: HeaterView): MessageKey {
  if (heater.working === undefined) {
    return 'heating.rooms.heater.noStatus';
  }
  return heater.working ? 'heating.rooms.heater.on' : 'heating.rooms.heater.off';
}

/** For a `data-state` attribute: what a test and a style can tell a heater by. */
export function heaterState(heater: HeaterView): 'unknown' | 'on' | 'off' {
  if (heater.working === undefined) {
    return 'unknown';
  }
  return heater.working ? 'on' : 'off';
}
