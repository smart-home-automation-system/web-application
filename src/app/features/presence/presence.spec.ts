import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import {
  Answered,
  HouseReport,
  PresenceApi,
  ReportRange,
  ResidentHistory,
  ResidentPresence,
  ResidentQuery,
} from '../../data-access/presence/presence-api';
import { Presence } from './presence';

/** 8 October 2026, 15:30:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T13:30:00Z');
const LAST_CHECK = '2026-10-08T15:29:20.191513';

const WEEK: ReportRange = { from: '2026-10-02T00:00:00', to: '2026-10-09T00:00:00' };

const AT_HOME_NOW: ResidentPresence[] = [
  { name: 'Aurelia', present: false, since: '2026-10-08T07:40:00', lastCheckedAt: LAST_CHECK },
  { name: 'Borys', present: true, since: '2026-10-08T15:05:00', lastCheckedAt: LAST_CHECK },
  { name: 'Damian', present: false, since: null, lastCheckedAt: null },
];

/** Two days of one resident: yesterday whole, today up to the last check and still at home. */
const HISTORY: ResidentHistory = {
  report: {
    name: 'Aurelia',
    ...WEEK,
    intervals: [
      { from: '2026-10-07T00:00:00', to: '2026-10-07T07:40:00', open: false },
      { from: '2026-10-07T16:30:00', to: '2026-10-08T07:40:00', open: false },
      { from: '2026-10-08T15:05:00', to: LAST_CHECK, open: true },
    ],
  },
  daily: {
    name: 'Aurelia',
    ...WEEK,
    observedFrom: '2026-10-07T00:00:00',
    observedUntil: LAST_CHECK,
    days: [
      {
        date: '2026-10-07',
        secondsAtHome: 54_600,
        firstArrival: '2026-10-07T16:30:00',
        lastDeparture: '2026-10-07T07:40:00',
        presencePercentage: 63.2,
      },
      {
        date: '2026-10-08',
        secondsAtHome: 29_060,
        firstArrival: '2026-10-08T15:05:00',
        lastDeparture: '2026-10-08T07:40:00',
        presencePercentage: 52.1,
      },
    ],
  },
};

const HOUSE: HouseReport = {
  ...WEEK,
  observedFrom: '2026-10-07T00:00:00',
  observedUntil: LAST_CHECK,
  intervals: [
    { from: '2026-10-07T00:00:00', to: '2026-10-08T08:15:00', occupied: true },
    { from: '2026-10-08T08:15:00', to: '2026-10-08T15:05:00', occupied: false },
    { from: '2026-10-08T15:05:00', to: LAST_CHECK, occupied: true },
  ],
  days: [
    { date: '2026-10-07', secondsOccupied: 86_400, secondsEmpty: 0, wasEmpty: false },
    { date: '2026-10-08', secondsOccupied: 31_160, secondsEmpty: 24_600, wasEmpty: true },
  ],
};

describe('Presence', () => {
  let now: FakeResource<readonly ResidentPresence[] | null>;
  let history: FakeResource<Answered<ResidentQuery | undefined, ResidentHistory | null>>;
  let house: FakeResource<Answered<ReportRange, HouseReport | null>>;
  /** What the page asks the reports for, as it stands. */
  let query: () => ResidentQuery | undefined;
  let range: () => ReportRange;
  let fixture: ComponentFixture<Presence>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    now = fakeResource();
    history = fakeResource();
    house = fakeResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: PresenceApi,
          useValue: {
            watchNow: () => now,
            watchResident: (asked: () => ResidentQuery | undefined) => {
              query = asked;
              return history;
            },
            watchHouse: (asked: () => ReportRange) => {
              range = asked;
              return house;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Presence);
  });

  afterEach(() => vi.useRealTimers());

  async function part(name: 'now' | 'period' | 'resident' | 'house'): Promise<HTMLElement> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${name}"]`)!;
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  /** Answers a report for exactly what the page asks at this moment. */
  function answerHistory(body: ResidentHistory | null): void {
    answer(history, { query: query(), answer: body });
  }

  function answerHouse(body: HouseReport | null): void {
    answer(house, { query: range(), answer: body });
  }

  async function days(name: 'resident' | 'house'): Promise<string[]> {
    return [...(await part(name)).querySelectorAll('.day')].map(words);
  }

  describe('who is at home now', () => {
    it('lists the household with the state of each, since when, and the age of the last check', async () => {
      answer(now, AT_HOME_NOW);

      const rows = [...(await part('now')).querySelectorAll('.resident')].map(words);

      expect(rows).toEqual([
        'directions_walk Aurelia Away since 8 Oct 2026, 07:40 checked 40 sec ago',
        'home Borys At home since 8 Oct 2026, 15:05 checked 40 sec ago',
        'visibility_off Damian Not observed yet',
      ]);
    });

    // listed by the registry and never seen: the service answers "not present" with no times
    it('does not call somebody nothing is stored about "away"', async () => {
      answer(now, [{ name: 'Damian', present: false, since: null, lastCheckedAt: null }]);

      const row = (await part('now')).querySelector('.resident')!;

      expect(row.getAttribute('data-state')).toBe('not-observed');
      expect(words(row)).not.toContain('Away');
    });

    it('does not guess from an answer without the flag', async () => {
      answer(now, [{ name: 'Aurelia', lastCheckedAt: LAST_CHECK }]);

      expect(words((await part('now')).querySelector('.resident'))).toContain('No status');
    });

    // the detection looks once a minute: a check of ten minutes ago means it is not looking
    it('warns when the last check is older than the detection would leave it', async () => {
      answer(now, [
        { name: 'Aurelia', present: true, since: '2026-10-08T07:40:00', lastCheckedAt: LAST_CHECK },
        {
          name: 'Borys',
          present: true,
          since: '2026-10-08T07:40:00',
          lastCheckedAt: '2026-10-08T15:19:00',
        },
      ]);

      const [fresh, late] = [...(await part('now')).querySelectorAll('.resident__checked')];

      expect(fresh.classList).not.toContain('resident__checked--late');
      expect(late.classList).toContain('resident__checked--late');
      expect(words(late)).toBe('warning checked 11 min ago');
    });

    it.each([
      ['an empty list', []],
      ['an empty answer', null],
    ])('says that the registry has nobody, for %s', async (_, body) => {
      answer(now, body);

      expect(words(await part('now'))).toContain('No active member in the household registry.');
    });

    it('leaves out an entry without a name', async () => {
      answer(now, [
        { present: true },
        null,
        { name: 'Borys', present: true },
      ] as ResidentPresence[]);

      expect((await part('now')).querySelectorAll('.resident')).toHaveLength(1);
    });

    it('says why nobody is listed when the call fails', async () => {
      fail(now, new ApiError('server', 502));

      const shown = await part('now');

      expect(words(shown.querySelector('[role="alert"]'))).toContain('(error 502)');
      expect(words(shown)).not.toContain('No active member');
    });
  });

  describe('the period', () => {
    it('starts with the last seven days, today included', async () => {
      await fixture.whenStable();

      expect(range()).toEqual(WEEK);
    });

    it('asks for today alone, and for thirty days', async () => {
      const toggles = (await part('period')).querySelectorAll<HTMLButtonElement>(
        'mat-button-toggle button',
      );

      toggles[0].click();
      await fixture.whenStable();
      expect(range()).toEqual({ from: '2026-10-08T00:00:00', to: '2026-10-09T00:00:00' });

      toggles[2].click();
      await fixture.whenStable();
      expect(range()).toEqual({ from: '2026-09-09T00:00:00', to: '2026-10-09T00:00:00' });
    });

    // the day is the day of the house, whatever zone this browser runs in
    it('moves on by itself when the day of the house changes', async () => {
      await fixture.whenStable();
      const before = range();

      // 23:30 in the house; the shared clock ticks every few seconds
      vi.setSystemTime(Date.parse('2026-10-08T21:30:00Z'));
      vi.advanceTimersByTime(5_000);
      await fixture.whenStable();
      expect(range()).toBe(before);

      vi.setSystemTime(Date.parse('2026-10-08T22:00:30Z'));
      vi.advanceTimersByTime(5_000);
      await fixture.whenStable();

      expect(range()).toEqual({ from: '2026-10-03T00:00:00', to: '2026-10-10T00:00:00' });
    });

    it('shows the period in the date field, chosen in the calendar only', async () => {
      const inputs = [...(await part('period')).querySelectorAll<HTMLInputElement>('input')];

      expect(inputs.map((input) => input.value)).toEqual(['02/10/2026', '08/10/2026']);
      expect(inputs.every((input) => input.readOnly)).toBe(true);
    });
  });

  describe('the periods of a resident', () => {
    it('asks for the first of the household until somebody else is chosen', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();

      expect(query()).toEqual({ name: 'Aurelia', range: WEEK });

      const toggles = (await part('resident')).querySelectorAll<HTMLButtonElement>(
        'mat-button-toggle button',
      );
      expect([...toggles].map(words)).toEqual(['Aurelia', 'Borys', 'Damian']);
      toggles[1].click();
      await fixture.whenStable();

      expect(query()).toEqual({ name: 'Borys', range: WEEK });
    });

    it('has nobody to ask about while the household is not known', async () => {
      await fixture.whenStable();
      expect(query()).toBeUndefined();
      expect((await part('resident')).querySelector('mat-progress-bar')).toBeTruthy();

      fail(now, new ApiError('server', 502));

      expect(words(await part('resident'))).toContain('There is nobody to show the history of.');
    });

    it('lists the observed days, the newest first, with the figures of the service', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      answerHistory(HISTORY);

      expect(await days('resident')).toEqual([
        'Thu 8 Oct 8 h 4 min 52.1 % First arrival 15:05 Last departure 07:40 Still at home',
        'Wed 7 Oct 15 h 10 min 63.2 % First arrival 16:30 Last departure 07:40',
      ]);
    });

    it('names each bar by the periods it draws', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      answerHistory(HISTORY);

      const bars = [...(await part('resident')).querySelectorAll('.lane')];

      expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
        'At home: 00:00–07:40, 15:05–15:29',
        'At home: 00:00–07:40, 16:30–24:00',
      ]);
    });

    it('says where the history begins when that is inside the period', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      answerHistory(HISTORY);

      expect(
        words((await part('resident')).querySelector('[data-testid="resident-observed-since"]')),
      ).toBe('Observed since 7 Oct 2026, 00:00 - nothing is known about the time before.');
    });

    // a resident never seen, a period before the history: the service answers with no bounds
    it.each([
      [
        'no bounds and no days',
        { report: { intervals: [] }, daily: { observedFrom: null, observedUntil: null, days: [] } },
      ],
      ['two empty answers', { report: null, daily: null }],
      ['nobody to ask about', null],
    ])('says that nothing was observed, for %s', async (_, body) => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      answerHistory(body as ResidentHistory | null);

      const shown = await part('resident');

      expect(words(shown)).toContain('Nothing was observed for this resident in this period.');
      expect(shown.querySelectorAll('.day')).toHaveLength(0);
      expect(shown.querySelector('[role="alert"]')).toBeNull();
    });

    // the answer for the resident asked before is still at hand when another one is chosen
    it('does not show the days of one resident under the name of another', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      answerHistory(HISTORY);
      expect(await days('resident')).toHaveLength(2);

      (await part('resident'))
        .querySelectorAll<HTMLButtonElement>('mat-button-toggle button')[1]
        .click();

      const shown = await part('resident');
      expect(shown.querySelectorAll('.day')).toHaveLength(0);
      expect(shown.querySelector('mat-progress-bar')).toBeTruthy();

      answerHistory({ ...HISTORY, daily: { ...HISTORY.daily, days: [] } });

      expect(await days('resident')).toHaveLength(2);
    });

    it('says why the days are missing when a call fails, and keeps nothing of another question', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      fail(history, new ApiError('client', 404, [{ message: 'Unknown resident: Aurelia' }]));

      const shown = await part('resident');

      expect(words(shown.querySelector('[role="alert"]'))).toContain('Unknown resident: Aurelia');
      expect(shown.querySelector('mat-progress-bar')).toBeNull();
    });

    it('shows a day the figures are missing for with its bar alone', async () => {
      answer(now, AT_HOME_NOW);
      await fixture.whenStable();
      answerHistory({ ...HISTORY, daily: { ...HISTORY.daily, days: [{ date: '2026-10-07' }] } });

      expect(await days('resident')).toEqual(['Thu 8 Oct Still at home', 'Wed 7 Oct']);
    });
  });

  describe('the house', () => {
    it('lists the observed days with how long the house was occupied and empty', async () => {
      await fixture.whenStable();
      answerHouse(HOUSE);

      expect(await days('house')).toEqual([
        'Thu 8 Oct Stood empty Occupied 8 h 39 min Empty 6 h 50 min',
        'Wed 7 Oct Never empty Occupied 24 h 0 min Empty 0 min',
      ]);
    });

    // an empty stretch is the gap between the bars, never a bar of its own
    it('draws the occupied stretches only', async () => {
      await fixture.whenStable();
      answerHouse(HOUSE);

      const today = (await part('house')).querySelector('.lane')!;

      expect(today.getAttribute('aria-label')).toBe('Somebody at home: 00:00–08:15, 15:05–15:29');
      expect(today.querySelectorAll('.lane__block')).toHaveLength(2);
    });

    it('does not guess whether a day had an empty stretch', async () => {
      await fixture.whenStable();
      answerHouse({ ...HOUSE, days: [{ date: '2026-10-08', secondsOccupied: 100 }] });

      const [today] = await days('house');

      expect(today).toBe('Thu 8 Oct Occupied 1 min');
    });

    it.each([
      ['no bounds', { observedFrom: null, observedUntil: null, intervals: [], days: [] }],
      ['an empty answer', null],
    ])('says that nothing was observed, for %s', async (_, body) => {
      await fixture.whenStable();
      answerHouse(body);

      expect(words(await part('house'))).toContain('Nothing was observed in this period.');
    });

    it('waits for the answer of the period on screen after the period changes', async () => {
      await fixture.whenStable();
      answerHouse(HOUSE);
      expect(await days('house')).toHaveLength(2);

      (await part('period')).querySelector<HTMLButtonElement>('mat-button-toggle button')!.click();

      const shown = await part('house');
      expect(shown.querySelectorAll('.day')).toHaveLength(0);
      expect(shown.querySelector('mat-progress-bar')).toBeTruthy();
    });

    it('says why the days are missing when the call fails', async () => {
      await fixture.whenStable();
      fail(house, new ApiError('server', 502));

      expect(words((await part('house')).querySelector('[role="alert"]'))).toContain('(error 502)');
    });
  });

  it('speaks Polish, except for the names', async () => {
    answer(now, AT_HOME_NOW);
    await fixture.whenStable();
    answerHistory(HISTORY);
    answerHouse(HOUSE);
    await useLanguage('pl');

    expect(words((await part('now')).querySelector('.resident'))).toBe(
      'directions_walk Aurelia Poza domem od 8 paź 2026, 07:40 sprawdzono 40 sek. temu',
    );
    expect((await days('resident'))[0]).toBe(
      'czw., 8 paź 8 godz. 4 min 52,1 % Pierwsze przyjście 15:05 Ostatnie wyjście 07:40 Nadal w domu',
    );
    expect((await days('house'))[0]).toBe(
      'czw., 8 paź Stał pusty Zajęty 8 godz. 39 min Pusty 6 godz. 50 min',
    );
    expect(words((fixture.nativeElement as HTMLElement).querySelector('h1'))).toBe('Obecność');
  });
});
