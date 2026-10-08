import { TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { APP_CONFIG } from '../../core/config/app-config';
import { HouseAgePipe } from './house-age.pipe';

/** 8 October 2026, 11:05:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T09:05:00Z');

describe('houseAge', () => {
  function pipe(houseTimeZone = 'Europe/Warsaw'): HouseAgePipe {
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: APP_CONFIG,
          useValue: { apiBasePath: '/home', requestTimeoutMs: 10_000, houseTimeZone },
        },
      ],
    });
    return TestBed.runInInjectionContext(() => new HouseAgePipe());
  }

  beforeEach(() =>
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] }),
  );
  afterEach(() => vi.useRealTimers());

  it.each([
    ['2026-10-08T11:04:55.596721712', 'just now'],
    ['2026-10-08T11:04:15', '45 sec ago'],
    ['2026-10-08T11:02:00', '3 min ago'],
    ['2026-10-08T06:05:00', '5 hr ago'],
    ['2026-10-05T11:05:00', '3 days ago'],
  ])('tells how long ago %s was: %s', (value, age) => {
    expect(pipe().transform(value)).toBe(age);
  });

  // the value carries no offset: its age is worked out in the zone of the house, whatever the
  // zone of the machine that runs this test
  it('reads the value in the zone of the house', () => {
    expect(pipe('UTC').transform('2026-10-08T09:02:00')).toBe('3 min ago');
  });

  // the clock of the browser and the clock of the house are never quite the same
  it('calls a value a moment ahead of the clock "just now"', () => {
    expect(pipe().transform('2026-10-08T11:05:20')).toBe('just now');
  });

  it.each([undefined, null, '', 'yesterday', '2026-10-08T09:05:00Z'])(
    'shows nothing for %s',
    (value) => {
      expect(pipe().transform(value)).toBe('');
    },
  );

  it('follows the language without being created again', async () => {
    const houseAge = pipe();

    await useLanguage('pl');

    expect(houseAge.transform('2026-10-08T11:02:00')).toBe('3 min temu');
    expect(houseAge.transform('2026-10-08T11:04:58')).toBe('przed chwilą');
  });

  it('moves with the shared clock', () => {
    const houseAge = pipe();
    expect(houseAge.transform('2026-10-08T11:04:00')).toBe('1 min ago');

    // the ticker moves every five seconds
    vi.advanceTimersByTime(120_000);

    expect(houseAge.transform('2026-10-08T11:04:00')).toBe('3 min ago');
  });
});
