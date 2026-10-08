import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import {
  HeatingActivity,
  HeatingApi,
  HeatingStatus,
  TemperatureSensor,
} from '../../data-access/heating/heating-api';
import { Heating } from './heating';

/** 8 October 2026, 14:30:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T12:30:00Z');

const SENSORS: TemperatureSensor[] = [
  { room: 'office', lastReadingAt: '2026-10-08T14:27:00.418018', stale: false, muted: false },
  { room: 'living room', lastReadingAt: '2026-10-08T14:29:55.330059', stale: false, muted: false },
  { room: 'garden', lastReadingAt: '2026-08-21T09:12:44.000001', stale: true, muted: true },
  { room: 'bathroom down', lastReadingAt: '2026-10-05T14:10:00.030302', stale: true, muted: false },
];

describe('Heating', () => {
  let status: FakeResource<HeatingStatus>;
  let activity: FakeResource<HeatingActivity>;
  let sensors: FakeResource<readonly TemperatureSensor[] | null>;
  let fixture: ComponentFixture<Heating>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    status = fakeResource();
    activity = fakeResource();
    sensors = fakeResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: HeatingApi,
          useValue: {
            watchSwitch: () => ({
              ...status,
              switching: signal(false),
              switchFailure: signal(undefined),
              turn: () => undefined,
            }),
            watchActivity: () => activity,
            watchSensors: () => sensors,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Heating);
  });

  afterEach(() => vi.useRealTimers());

  async function part(name: 'heating-switch' | 'activity' | 'sensors'): Promise<HTMLElement> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${name}"]`)!;
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** The table as rows of cells, in words. */
  async function table(): Promise<string[][]> {
    return [...(await part('sensors')).querySelectorAll('tbody tr')].map((row) =>
      [...row.children].map(words),
    );
  }

  it('shows a progress bar in each card until its call has answered', async () => {
    for (const name of ['heating-switch', 'activity', 'sensors'] as const) {
      expect((await part(name)).querySelector('mat-progress-bar'), name).toBeTruthy();
    }

    answer(activity, { active: false });

    expect((await part('activity')).querySelector('mat-progress-bar')).toBeNull();
    expect((await part('sensors')).querySelector('mat-progress-bar')).toBeTruthy();
  });

  it('shows the switch of the heating system', async () => {
    answer(status, { isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' });

    expect(words(await part('heating-switch'))).toContain('Enabled');
    expect(words(await part('heating-switch'))).toContain('Switch off');
  });

  describe('whether any room is being heated', () => {
    it('says that rooms are being heated', async () => {
      answer(activity, { active: true });

      const state = (await part('activity')).querySelector('.tile__state')!;

      expect(words(state)).toBe('mode_heat Rooms are being heated');
      expect(state.classList).toContain('tile__state--on');
    });

    it('says that no room is being heated', async () => {
      answer(activity, { active: false });

      const state = (await part('activity')).querySelector('.tile__state')!;

      expect(words(state)).toBe('mode_heat_off No room is being heated');
      expect(state.classList).not.toContain('tile__state--on');
    });

    it.each([
      ['an answer without the flag', {}],
      ['a flag that is not one', { active: 'yes' }],
    ])('does not guess from %s', async (_, body) => {
      answer(activity, body as HeatingActivity);

      const shown = await part('activity');

      expect(shown.querySelector('.tile__state')).toBeNull();
      expect(words(shown)).toContain('The service does not say whether any room is being heated.');
    });

    it('says why it is not known when the call fails', async () => {
      fail(activity, new ApiError('server', 503));

      const shown = await part('activity');

      expect(words(shown.querySelector('[role="alert"]'))).toContain('(error 503)');
      expect(words(shown)).not.toContain('does not say');
    });
  });

  describe('the temperature sensors', () => {
    it('lists every room with the age and the time of its last reading, the silent ones first', async () => {
      answer(sensors, SENSORS);

      expect(await table()).toEqual([
        ['bathroom down', '3 days ago 5 Oct 2026, 14:10', 'Silent'],
        ['garden', '48 days ago 21 Aug 2026, 09:12', 'Silent notifications_off Muted'],
        ['office', '3 min ago 8 Oct 2026, 14:27', 'Reporting'],
        ['living room', 'just now 8 Oct 2026, 14:29', 'Reporting'],
      ]);
    });

    it('names the columns, and each row by its room', async () => {
      answer(sensors, SENSORS);

      const shown = await part('sensors');

      expect([...shown.querySelectorAll('thead th')].map(words)).toEqual([
        'Room',
        'Last reading',
        'Status',
      ]);
      expect(shown.querySelector('tbody th')?.getAttribute('scope')).toBe('row');
      expect(words(shown.querySelector('caption'))).toBe('Temperature sensors');
    });

    it('says above the table how many sensors are silent', async () => {
      answer(sensors, SENSORS);

      expect(words((await part('sensors')).querySelector('[data-testid="sensor-summary"]'))).toBe(
        'sensors_off Silent sensors: 2 of 4.',
      );
    });

    it('says that all report when all do', async () => {
      answer(sensors, SENSORS.slice(0, 2));

      expect(words((await part('sensors')).querySelector('[data-testid="sensor-summary"]'))).toBe(
        'sensors All sensors are reporting (2).',
      );
    });

    it('marks a muted sensor that still reports', async () => {
      answer(sensors, [{ ...SENSORS[0], muted: true }]);

      expect((await table())[0][2]).toBe('Reporting notifications_off Muted');
    });

    // "reporting" must be something the service said
    it('claims nothing about a sensor whose answer does not say whether it is silent', async () => {
      answer(sensors, [{ room: 'office', lastReadingAt: '2026-10-08T14:27:00' }]);

      expect(await table()).toEqual([['office', '3 min ago 8 Oct 2026, 14:27', '']]);
      expect((await part('sensors')).querySelector('[data-testid="sensor-summary"]')).toBeNull();
    });

    it('says that there is no reading where the answer has no time', async () => {
      answer(sensors, [{ room: 'office', lastReadingAt: null, stale: true, muted: false }]);

      expect(await table()).toEqual([['office', 'No reading', 'Silent']]);
    });

    it.each([
      ['an empty list', []],
      ['an empty answer', null],
    ])('says that no sensor has reported yet, for %s', async (_, body) => {
      answer(sensors, body);

      const shown = await part('sensors');

      expect(words(shown)).toContain('No sensor has reported yet.');
      expect(shown.querySelector('table')).toBeNull();
      expect(shown.querySelector('[role="alert"]')).toBeNull();
    });

    it('says why the sensors are missing when the call fails, once', async () => {
      fail(sensors, new ApiError('server', 502));
      answer(activity, { active: false });
      await fixture.whenStable();

      const alerts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]')];

      expect(alerts).toHaveLength(1);
      expect((await part('sensors')).contains(alerts[0])).toBe(true);
      expect(words(await part('sensors'))).not.toContain('No sensor has reported yet.');
    });

    it('keeps the last list on screen next to the failure, marked as out of date', async () => {
      answer(sensors, SENSORS);
      fail(sensors, new ApiError('network', 0));

      const shown = await part('sensors');

      expect(await table()).toHaveLength(4);
      expect(shown.querySelector('app-data-freshness')?.classList).toContain('freshness--stale');
      expect(words(shown.querySelector('[role="alert"]'))).toContain(
        'The server cannot be reached.',
      );
    });
  });

  it('speaks Polish, except for the identifiers of the rooms', async () => {
    answer(activity, { active: true });
    answer(sensors, SENSORS);
    await useLanguage('pl');

    expect(words((await part('activity')).querySelector('.tile__state'))).toContain(
      'Pokoje są ogrzewane',
    );
    expect(words((fixture.nativeElement as HTMLElement).querySelector('h1'))).toBe('Ogrzewanie');
    expect((await table())[0]).toEqual(['bathroom down', '3 dni temu 5 paź 2026, 14:10', 'Milczy']);
    expect(words((await part('sensors')).querySelector('[data-testid="sensor-summary"]'))).toBe(
      'sensors_off Milczące czujniki: 2 z 4.',
    );
  });
});
