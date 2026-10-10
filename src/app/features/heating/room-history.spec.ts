import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import { FakeQueryResource, answerQuery, fakeQueryResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { HistoryRange } from '../../core/time/history-range';
import {
  HeatingApi,
  RoomHistory as RoomHistoryAnswer,
} from '../../data-access/heating/heating-api';
import { SchedulePeriod } from '../../shared/room-heating/room-views';
import { RoomHistory } from './room-history';

// 18:30 in the house on a Saturday (summer time, UTC+2)
const NOW = new Date('2026-10-10T16:30:00Z');
const at = (dateTime: string) => Date.parse(`${dateTime}Z`);

const DAY: RoomHistoryAnswer = {
  room: 'living room',
  from: '2026-10-09T19:00:00',
  to: '2026-10-10T19:00:00',
  bucketSeconds: 1200,
  points: [
    { at: '2026-10-10T17:00:00', value: 21.44 },
    { at: '2026-10-10T17:20:00', value: 21.38 },
    // the bucket of 17:40 is missing
    { at: '2026-10-10T18:00:00', value: 20.9 },
  ],
};

// every day of the week, in the morning
const MORNING: SchedulePeriod = {
  days: [0, 1, 2, 3, 4, 5, 6],
  start: 360,
  end: 480,
  temperature: 21,
};

describe('RoomHistory', () => {
  let history: FakeQueryResource<HistoryRange, RoomHistoryAnswer | null>;
  let asked: { room: () => string; range: () => HistoryRange };
  let charts: RecordedCharts;
  let fixture: ComponentFixture<RoomHistory>;

  function create(schedules: readonly (readonly SchedulePeriod[])[] = []): void {
    fixture = TestBed.createComponent(RoomHistory);
    fixture.componentRef.setInput('room', 'living room');
    fixture.componentRef.setInput('schedules', schedules);
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    history = fakeQueryResource();
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(charts),
        {
          provide: HeatingApi,
          useValue: {
            watchRoomHistory: (room: () => string, range: () => HistoryRange) => {
              asked = { room, range };
              return history;
            },
          },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  const panel = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function settle(): Promise<void> {
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
  }

  it('asks for the history of its room over the last 24 hours, from a full hour', async () => {
    create();
    await settle();

    expect(asked.room()).toBe('living room');
    expect(asked.range()).toEqual({ from: '2026-10-09T19:00:00', to: '2026-10-10T19:00:00' });
  });

  it('draws the temperature, broken where a bucket is missing', async () => {
    create();
    answerQuery(history, asked.range(), DAY);
    await settle();

    expect(charts.lines()).toEqual([
      {
        name: 'Temperature',
        data: [
          [at('2026-10-10T17:00:00'), 21.44],
          [at('2026-10-10T17:20:00'), 21.38],
          [at('2026-10-10T17:40:00'), null],
          [at('2026-10-10T18:00:00'), 20.9],
        ],
      },
    ]);
  });

  it('says the lowest and the highest temperature of the period', async () => {
    create();
    answerQuery(history, asked.range(), DAY);
    await settle();

    expect(words(panel().querySelector('[data-testid="history-facts"]'))).toBe(
      'Temperature 20.9 – 21.4 °C',
    );
  });

  describe('the schedule', () => {
    it('is drawn as a dashed line of steps next to the temperature', async () => {
      create([[MORNING]]);
      answerQuery(history, asked.range(), DAY);
      await settle();

      const drawn = charts.drawn[0] as { series: { name: string; lineStyle: { type: string } }[] };
      expect(drawn.series.map((line) => [line.name, line.lineStyle.type])).toEqual([
        ['Temperature', 'solid'],
        ['Current schedule', 'dashed'],
      ]);
      // the morning of the Saturday inside the range
      expect(charts.lines()[1].data).toEqual([
        [at('2026-10-10T06:00:00'), 21],
        [at('2026-10-10T08:00:00'), 21],
      ]);
    });

    // the target of a past day is stored nowhere: the line is today's schedule, and says so
    it('is named the current schedule, with a note on what it is not', async () => {
      create([[MORNING]]);
      answerQuery(history, asked.range(), DAY);
      await settle();

      expect(words(panel())).toContain(
        'The dashed line is the schedule the room has today, laid over every day - not what was in force on a past day.',
      );
    });

    it('is not mentioned for a room without one', async () => {
      create([[], []]);
      answerQuery(history, asked.range(), DAY);
      await settle();

      expect(charts.lines().map((line) => line.name)).toEqual(['Temperature']);
      expect(words(panel())).not.toContain('dashed line');
    });

    // a schedule alone is no history: without a reading there is nothing to draw it next to
    it('is not drawn alone for a period without a reading', async () => {
      create([[MORNING]]);
      answerQuery(history, asked.range(), { ...DAY, points: [] });
      await settle();

      expect(panel().querySelector('app-history-chart')).toBeNull();
      expect(words(panel().querySelector('[data-testid="history-empty"]'))).toBe(
        'No reading in this period.',
      );
    });
  });

  it('shows the bar until the answer for the period on screen has arrived', async () => {
    create();
    await settle();

    expect(panel().querySelector('mat-progress-bar')).toBeTruthy();
    expect(panel().querySelector('app-history-chart')).toBeNull();
  });
});
