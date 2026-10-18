import {
  actionText,
  conditionView,
  dayTypeText,
  decisionText,
  outcomeText,
  sourceText,
  windowEndText,
} from './blind-labels';

// HAS-252: the words for the values of blinds-service - a value this version does not know is
// printed as it came, never read as one it knows
describe('blind labels', () => {
  it('names who moved a blind, and prints the word of a device as it came', () => {
    expect(sourceText('schedule')).toEqual({ key: 'blinds.source.schedule' });
    expect(sourceText('SHC')).toEqual({ literal: 'SHC' });
    expect(sourceText(undefined)).toEqual({ key: 'blinds.source.unknown' });
    // a value from outside must not find something on a plain object
    expect(sourceText('constructor')).toEqual({ literal: 'constructor' });
  });

  it('words the days, the action and the decision of a schedule', () => {
    expect(dayTypeText('day off')).toEqual({ key: 'blinds.schedule.dayType.dayOff' });
    expect(actionText('position', 30)).toEqual({
      key: 'blinds.schedule.action.position',
      params: { position: 30 },
    });
    expect(actionText('position', undefined)).toEqual({
      key: 'blinds.schedule.action.positionUnknown',
    });
    expect(actionText('close', undefined)).toEqual({ key: 'blinds.schedule.action.close' });
    expect(decisionText('waiting for the conditions')).toEqual({
      key: 'blinds.schedule.decision.waiting',
    });
    expect(decisionText('something new')).toEqual({ literal: 'something new' });
    expect(outcomeText(undefined)).toBeUndefined();
    expect(outcomeText('paused')).toEqual({ key: 'blinds.schedule.outcome.paused' });
  });

  it('reads a compared condition with its unit, its hold and its value now', () => {
    expect(
      conditionView({
        metric: 'outside temperature',
        operator: 'gt',
        threshold: 25,
        holdMinutes: 15,
        current: 21.4,
      }),
    ).toEqual({
      subject: { key: 'blinds.schedule.metric.outsideTemperature' },
      operator: '>',
      threshold: 25,
      unit: '°C',
      holdMinutes: 15,
      current: { value: 21.4, unit: '°C' },
    });
  });

  it('reads a truth as words, and 0 minutes as no hold', () => {
    expect(
      conditionView({
        metric: 'raining',
        operator: 'is',
        value: false,
        holdMinutes: 0,
        current: true,
      }),
    ).toEqual({
      subject: { key: 'blinds.schedule.metric.notRaining' },
      current: { text: { key: 'blinds.schedule.metric.raining' } },
    });
  });

  it('prints a metric it does not know as it came', () => {
    expect(conditionView({ metric: 'snow depth', operator: 'gt', threshold: 5 })).toEqual({
      subject: { literal: 'snow depth' },
      operator: '>',
      threshold: 5,
    });
  });

  it('writes an end of the window, the times of the service never as a parameter', () => {
    expect(windowEndText({ kind: 'clock', time: '06:30' })).toEqual([{ literal: '06:30' }]);
    expect(windowEndText({ kind: 'sunrise', offsetMinutes: 60, latest: '09:00' })).toEqual([
      { key: 'blinds.schedule.end.sunrise' },
      { key: 'blinds.schedule.end.after', params: { minutes: 60 } },
      { key: 'blinds.schedule.end.latest' },
      { literal: '09:00' },
    ]);
    expect(windowEndText({ kind: 'sunset', offsetMinutes: -15, earliest: '16:00' })).toEqual([
      { key: 'blinds.schedule.end.sunset' },
      { key: 'blinds.schedule.end.before', params: { minutes: 15 } },
      { key: 'blinds.schedule.end.earliest' },
      { literal: '16:00' },
    ]);
    expect(windowEndText(undefined)).toEqual([{ key: 'blinds.schedule.end.unknown' }]);
  });
});
