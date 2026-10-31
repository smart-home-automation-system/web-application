import {
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  TEMPERATURE_STEP,
  daysProblem,
  minutesOf,
  orderProblem,
  overlapping,
  scheduleProblem,
  temperatureOf,
  temperatureProblem,
  timeProblem,
  timeText,
} from './heating-schedule-rules';

// The cases of ScheduleRulesTest of heating-service 1.14.0, one by one: a rule changed there fails here
describe('the rules of a period of a heater', () => {
  it('pins the numbers of the service', () => {
    expect([MIN_TEMPERATURE, MAX_TEMPERATURE, TEMPERATURE_STEP]).toEqual([5, 30, 0.5]);
  });

  it('needs at least one day', () => {
    expect(daysProblem([])).toBe('heating.editor.rule.noDays');
    expect(daysProblem([0])).toBeUndefined();
  });

  it.each(['8:00', '08:00:00', '24:00', '08:60', '0800', 'noon', ''])(
    'refuses %s as a time',
    (text) => {
      expect(timeProblem(text)).toBe('heating.editor.rule.time');
      expect(minutesOf(text)).toBeUndefined();
    },
  );

  it('reads and writes HH:mm', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('23:59')).toBe(1439);
    expect(timeText(1020)).toBe('17:00');
    expect(timeText(65)).toBe('01:05');
  });

  it('needs the start before the end - a period never runs across midnight', () => {
    expect(orderProblem(1320, 480)).toBe('heating.editor.rule.order');
    expect(orderProblem(480, 480)).toBe('heating.editor.rule.order');
    expect(orderProblem(480, 1020)).toBeUndefined();
  });

  it('reads a temperature typed with a comma or a dot', () => {
    expect(temperatureOf('20,5')).toBe(20.5);
    expect(temperatureOf(' 21 ')).toBe(21);
    expect(temperatureOf('warm')).toBeUndefined();
    expect(temperatureOf('')).toBeUndefined();
  });

  it.each([4.5, 30.5, -1, 100])('refuses %s degrees as out of range', (value) => {
    expect(temperatureProblem(value)).toBe('heating.editor.rule.temperatureRange');
  });

  it.each([20.2, 20.25, 21.75, 5.1])('refuses %s degrees as off the half degree', (value) => {
    expect(temperatureProblem(value)).toBe('heating.editor.rule.temperatureStep');
  });

  it.each([5, 30, 20.5, 13])('takes %s degrees', (value) => {
    expect(temperatureProblem(value)).toBeUndefined();
  });

  it('needs a temperature', () => {
    expect(temperatureProblem(undefined)).toBe('heating.editor.rule.temperatureMissing');
  });

  describe('the overlap within a heater', () => {
    const others = [{ id: 4, days: [0, 1], start: 480, end: 1020 }];

    it('refuses a window that meets another on a day in common', () => {
      expect(overlapping({ days: [1], start: 960, end: 1320 }, others)?.id).toBe(4);
      expect(overlapping({ days: [0], start: 540, end: 600 }, others)?.id).toBe(4);
      expect(overlapping({ days: [0], start: 360, end: 1380 }, others)?.id).toBe(4);
    });

    it('takes windows that touch', () => {
      const touching = [...others, { id: 5, days: [0], start: 300, end: 480 }];
      expect(overlapping({ days: [0], start: 1020, end: 1320 }, touching)).toBeUndefined();
    });

    it('takes an overlapping window on other days', () => {
      expect(overlapping({ days: [5, 6], start: 540, end: 1320 }, others)).toBeUndefined();
    });
  });

  // the mock API refuses what the service refuses, in its words
  describe('a whole body, for the mock API', () => {
    const body = { days: ['SATURDAY'], startTime: '09:00', endTime: '22:00', temperature: 21 };

    it('takes a body that keeps every rule', () => {
      expect(scheduleProblem(body, [])).toBeUndefined();
    });

    it('names the first rule broken', () => {
      expect(scheduleProblem({ ...body, days: [] }, [])).toContain('days are required');
      expect(scheduleProblem({ ...body, days: ['monday'] }, [])).toContain(
        'is not a day of the week',
      );
      expect(scheduleProblem({ ...body, days: ['MONDAY', 'MONDAY'] }, [])).toContain(
        'listed twice',
      );
      expect(scheduleProblem({ ...body, startTime: '9:00' }, [])).toBe('startTime must be HH:mm');
      expect(scheduleProblem({ ...body, endTime: '08:00' }, [])).toContain(
        'startTime must be before endTime',
      );
      expect(scheduleProblem({ ...body, temperature: 31 }, [])).toContain('from 5 to 30');
      expect(scheduleProblem({ ...body, temperature: 20.2 }, [])).toContain('steps of 0.5');
      expect(scheduleProblem({ ...body, temperature: undefined }, [])).toBe(
        'temperature is required',
      );
      expect(scheduleProblem(body, [{ id: 9, days: [5], start: 480, end: 600 }])).toBe(
        'the window overlaps schedule 9',
      );
    });
  });
});
