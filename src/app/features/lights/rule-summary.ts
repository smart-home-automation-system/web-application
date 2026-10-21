import { MotionPeriod, RoomRule } from '../../data-access/light/light-api';
import { DisplayText } from '../../i18n/messages';

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The rule of a room in a few words, for the line of its card (HAS-266): what switches the lights
 * off, what switches them on, and how long a change by hand is left alone. A part the service did
 * not answer is not made up: a rule without `manualHoldMinutes` says nothing of the hold.
 */
export function ruleSummary(rule: RoomRule): readonly DisplayText[] {
  const parts: DisplayText[] = [];
  if (rule.autoOffEnabled === true) {
    parts.push(
      isCount(rule.autoOffDelayMinutes)
        ? { key: 'lights.rule.autoOffAfter', params: { minutes: rule.autoOffDelayMinutes } }
        : { key: 'lights.rule.autoOff' },
    );
  }
  if (rule.motionOnEnabled === true) {
    parts.push(
      isCount(rule.onlyBelowLux)
        ? { key: 'lights.rule.motionOnBelow', params: { lux: rule.onlyBelowLux } }
        : { key: 'lights.rule.motionOn' },
    );
  }
  if (rule.autoOffEnabled === false && rule.motionOnEnabled === false) {
    parts.push({ key: 'lights.rule.nothing' });
  }
  if (isCount(rule.manualHoldMinutes)) {
    parts.push({ key: 'lights.rule.hold', params: { minutes: rule.manualHoldMinutes } });
  }
  return parts;
}

/** A period of the motion-on rule: its times as the service wrote them, and what it lights. */
export function periodText(period: MotionPeriod): readonly DisplayText[] {
  const parts: DisplayText[] = [{ literal: `${period.from ?? '?'} – ${period.to ?? '?'}` }];
  if (isCount(period.brightness)) {
    parts.push({ key: 'lights.rule.periodBrightness', params: { value: period.brightness } });
  }
  if (Array.isArray(period.rgb)) {
    parts.push({ key: 'lights.rule.periodColor' });
  }
  if (isCount(period.white)) {
    parts.push({ key: 'lights.rule.periodWhite', params: { value: period.white } });
  }
  return parts;
}
