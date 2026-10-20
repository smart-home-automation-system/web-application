import { ConditionForm, WindowEndForm, targetKey, targetOf } from './schedule-form';

// what the parts of the form send: only the fields of their kind - the service refuses the others
describe('schedule form', () => {
  it('sends a clock time alone, and a time of the sun without one', () => {
    const end = new WindowEndForm();
    end.fill({ kind: 'sunrise', offsetMinutes: 60, latest: '09:00' });
    end.time.setValue('06:30');

    expect(end.value()).toEqual({ kind: 'sunrise', offsetMinutes: 60, latest: '09:00' });

    end.setKind('clock');
    expect(end.value()).toEqual({ kind: 'clock', time: '06:30' });
  });

  it('checks only the fields of the kind of the end', () => {
    const end = new WindowEndForm();
    expect(end.time.errors).toEqual({ problem: 'blinds.editor.problem.timeMissing' });

    end.setKind('sunset');
    expect(end.time.valid).toBe(true);
    end.offset.setValue('');
    expect(end.offset.errors).toEqual({ problem: 'blinds.editor.problem.offsetMissing' });
  });

  it('checks the latest again when the earliest changes', () => {
    const end = new WindowEndForm();
    end.setKind('sunrise');
    end.latest.setValue('08:00');
    expect(end.latest.valid).toBe(true);

    end.earliest.setValue('08:30');
    expect(end.latest.errors).toEqual({ problem: 'blinds.editor.problem.latestBeforeEarliest' });
  });

  it('sends a threshold or a truth, never both', () => {
    const row = new ConditionForm({
      metric: 'illuminance',
      operator: 'lt',
      threshold: 120,
      holdMinutes: 10,
    });
    row.threshold.setValue('120,5');
    expect(row.value()).toEqual({
      metric: 'illuminance',
      operator: 'lt',
      threshold: 120.5,
      holdMinutes: 10,
    });

    row.setMetric('window closed');
    row.truth.set(false);
    expect(row.value()).toEqual({
      metric: 'window closed',
      operator: 'is',
      value: false,
      holdMinutes: 10,
    });
    // a truth has no threshold to be wrong
    row.threshold.setValue('');
    expect(row.threshold.valid).toBe(true);
  });

  it('checks a threshold against the range of the metric chosen', () => {
    const row = new ConditionForm();
    row.threshold.setValue('80');
    expect(row.threshold.valid).toBe(true);

    row.setMetric('outside temperature');
    expect(row.threshold.errors).toEqual({ problem: 'blinds.editor.problem.thresholdRange' });
  });

  it('checks a threshold again when the operator changes - lt 0 lx is never true', () => {
    const row = new ConditionForm();
    row.threshold.setValue('0');
    expect(row.threshold.valid).toBe(true);

    row.setOperator('lt');
    expect(row.threshold.errors).toEqual({ problem: 'blinds.editor.problem.thresholdNeverBelow' });

    row.threshold.setValue('1');
    expect(row.threshold.valid).toBe(true);
  });

  it('keeps a target as one key of the select', () => {
    expect(targetKey({ room: 'living room' })).toBe('room:living room');
    expect(targetKey({ deviceId: 7 })).toBe('blind:7');
    expect(targetKey({})).toBeUndefined();
    expect(targetOf('room:living room')).toEqual({ room: 'living room' });
    expect(targetOf('blind:7')).toEqual({ deviceId: 7 });
  });
});
