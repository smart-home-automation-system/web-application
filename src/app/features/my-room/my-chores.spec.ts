import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeQueryResource, answerQuery, fakeQueryResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { ProfileStore } from '../../core/profile/profile-store';
import { HistoryRange } from '../../core/time/history-range';
import { ApplianceApi, MembersReport } from '../../data-access/appliance/appliance-api';
import { MyChores } from './my-chores';

// 21:30 in the house (Europe/Warsaw) on 26 October 2026
const NOW = Date.parse('2026-10-26T20:30:00Z');

const REPORT: MembersReport = {
  members: [
    {
      member: 'Borys',
      appliances: [
        {
          applianceId: 131,
          name: 'Washing machine',
          opportunities: 8,
          done: 2,
          doneAway: 0,
          share: 0.25,
        },
        { applianceId: 132, opportunities: 0, done: 0, doneAway: 0 },
      ],
    },
  ],
};

describe('MyChores', () => {
  let fixture: ComponentFixture<MyChores>;
  let report: FakeQueryResource<HistoryRange, MembersReport | null>;
  let range: () => HistoryRange;
  const profile = signal<{ name: string } | undefined>({ name: 'borys' });

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    report = fakeQueryResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile } },
        {
          provide: ApplianceApi,
          useValue: {
            watchMembersReport: (asked: () => HistoryRange) => {
              range = asked;
              return report;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MyChores);
  });

  afterEach(() => {
    vi.useRealTimers();
    profile.set({ name: 'borys' });
  });

  function card(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="my-chores"]');
  }

  function words(element: Element | null | undefined): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('asks for this calendar month of the house', async () => {
    await fixture.whenStable();

    expect(range()).toEqual({ from: '2026-10-01T00:00:00', to: '2026-11-01T00:00:00' });
  });

  it('draws nothing until the report names an appliance', async () => {
    await fixture.whenStable();
    expect(card()).toBeNull();

    answerQuery(report, range(), { members: [] });
    await fixture.whenStable();

    expect(card()).toBeNull();
  });

  it('shows the chores of the member of the profile, found whatever the case', async () => {
    await fixture.whenStable();
    answerQuery(report, range(), REPORT);
    await fixture.whenStable();

    expect(words(card()?.querySelector('[data-appliance="131"]'))).toBe(
      'Washing machine 2 / 8 25%',
    );
    // an appliance no longer watched has no name; no share without an opportunity
    expect(words(card()?.querySelector('[data-appliance="132"]'))).toBe(
      'Appliance no longer watched 0 / 0',
    );
  });

  it('says so when the report does not name the member', async () => {
    profile.set({ name: 'Celina' });
    await fixture.whenStable();
    answerQuery(report, range(), REPORT);
    await fixture.whenStable();

    expect(words(card())).toContain('The report does not name you.');
  });

  it('tells a failure before any answer', async () => {
    await fixture.whenStable();
    report.error.set(new ApiError('server', 502));
    report.loading.set(false);
    await fixture.whenStable();

    expect(card()?.querySelector('[role="alert"]')).not.toBeNull();
  });
});
