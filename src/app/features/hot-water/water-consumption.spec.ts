import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  FakeQueryResource,
  answerQuery,
  failQuery,
  fakeQueryResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { ConsumptionQuery, WaterApi, WaterConsumption } from '../../data-access/water/water-api';
import { WaterConsumptionCard } from './water-consumption';

// 18:30 in the house, on Thursday 5 November 2026
const NOW = new Date('2026-11-05T17:30:00Z');

// The consumption of the water page (HAS-322): the range asked, the bars, the totals, the steps
describe('WaterConsumptionCard', () => {
  let consumption: FakeQueryResource<ConsumptionQuery, WaterConsumption | null>;
  let query: () => ConsumptionQuery;
  let fixture: ComponentFixture<WaterConsumptionCard>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    consumption = fakeQueryResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: WaterApi,
          useValue: {
            watchConsumption: (asked: () => ConsumptionQuery) => {
              query = asked;
              return consumption;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(WaterConsumptionCard);
  });

  afterEach(() => vi.useRealTimers());

  const card = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const part = async (name: string) => {
    await fixture.whenStable();
    return card().querySelector(`[data-testid="${name}"]`);
  };

  async function click(name: string): Promise<void> {
    ((await part(name)) as HTMLButtonElement).click();
    await fixture.whenStable();
  }

  async function chooseRange(label: string): Promise<void> {
    await fixture.whenStable();
    const toggle = [...card().querySelectorAll('mat-button-toggle button')].find(
      (button) => words(button) === label,
    ) as HTMLButtonElement;
    toggle.click();
    await fixture.whenStable();
  }

  const DAY: WaterConsumption = {
    range: 'day',
    from: '2026-11-05T00:00:00',
    to: '2026-11-06T00:00:00',
    unit: 'm3',
    total: 0.231,
    previousTotal: 0.21,
    buckets: [
      { at: '2026-11-05T07:00:00', volume: 0.045 },
      { at: '2026-11-05T08:00:00', volume: 0 },
    ],
  };

  it('asks for today of the house, waits with a bar, and names the day', async () => {
    await fixture.whenStable();

    expect(query()).toEqual({ range: 'day', at: '2026-11-05' });
    expect(card().querySelector('mat-progress-bar')).toBeTruthy();
    expect(words(await part('consumption-name'))).toBe('5 November 2026');
    expect((await part('consumption-after'))?.hasAttribute('disabled')).toBe(true);
  });

  it('draws the day in litres with its total and the day before', async () => {
    await fixture.whenStable();
    answerQuery(consumption, query(), DAY);
    await fixture.whenStable();

    expect(card().querySelector('app-bars-chart')).toBeTruthy();
    expect(words(await part('consumption-total'))).toBe('Total 231 L');
    expect(words(await part('consumption-previous'))).toBe('The day before 210 L 10 % more');
  });

  // missing is never 0: a total the answer leaves out is not known, and a range without a bucket has no chart
  it('says not known for a total the answer leaves out, and draws nothing without a bucket', async () => {
    await fixture.whenStable();
    answerQuery(consumption, query(), { ...DAY, total: undefined, previousTotal: undefined });

    expect(words(await part('consumption-total'))).toBe('Total not known');
    expect(words(await part('consumption-previous'))).toBe('The day before not known');

    answerQuery(consumption, query(), { ...DAY, buckets: [] });
    await fixture.whenStable();

    expect(card().querySelector('app-bars-chart')).toBeNull();
    expect(words(await part('consumption'))).toContain('No reading in this period.');
  });

  it('asks for a range anew and shows it only once its answer is in', async () => {
    await fixture.whenStable();
    answerQuery(consumption, query(), DAY);

    await chooseRange('Year');

    expect(query()).toEqual({ range: 'year', at: '2026-01-01' });
    expect(card().querySelector('app-bars-chart')).toBeNull();
    expect(card().querySelector('mat-progress-bar')).toBeTruthy();

    answerQuery(consumption, query(), {
      range: 'year',
      from: '2026-01-01T00:00:00',
      to: '2027-01-01T00:00:00',
      total: 104.256,
      previousTotal: 112.6,
      buckets: [{ at: '2026-01-01T00:00:00', volume: 10.2 }],
    });

    expect(words(await part('consumption-total'))).toBe('Total 104.3 m³');
    expect(words(await part('consumption-name'))).toBe('2026');
  });

  it('steps a range back and forth, never past today', async () => {
    await chooseRange('Week');
    expect(query()).toEqual({ range: 'week', at: '2026-11-02' });

    await click('consumption-before');

    expect(query()).toEqual({ range: 'week', at: '2026-10-26' });
    expect((await part('consumption-after'))?.hasAttribute('disabled')).toBe(false);

    await click('consumption-after');

    expect(query()).toEqual({ range: 'week', at: '2026-11-02' });
    expect((await part('consumption-after'))?.hasAttribute('disabled')).toBe(true);

    // back in the week of today, the card follows today again: the day is today, not the Monday
    await chooseRange('Day');

    expect(query()).toEqual({ range: 'day', at: '2026-11-05' });
  });

  // the calendar works in the zone of the browser: the date it gives is the day of the house shown
  it('asks for the day chosen on the calendar', async () => {
    await fixture.whenStable();
    const input = card().querySelector('[data-testid="consumption-day"]') as HTMLInputElement;

    input.value = '10/28/2026';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(query()).toEqual({ range: 'day', at: '2026-10-28' });
    expect(words(await part('consumption-name'))).toBe('28 October 2026');
  });

  it('words the refusal of a range', async () => {
    await fixture.whenStable();
    failQuery(
      consumption,
      query(),
      new ApiError('client', 400, [{ message: 'The range is day...', code: 'INVALID_RANGE' }]),
    );

    expect(words(await part('consumption'))).toContain('The service did not take this range.');
  });

  it('speaks Polish', async () => {
    await useLanguage('pl');
    await fixture.whenStable();
    answerQuery(consumption, query(), DAY);

    expect(words(await part('consumption-name'))).toBe('5 listopada 2026');
    expect(words(await part('consumption-previous'))).toBe('Dzień wcześniej 210 L o 10 % więcej');
  });
});
