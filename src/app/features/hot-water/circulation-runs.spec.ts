import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  FakeQueryResource,
  answerQuery,
  fakeQueryResource,
  fail,
} from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HistoryRange } from '../../core/time/history-range';
import { CirculationRun } from '../../data-access/water/water-api';
import { CirculationRuns } from './circulation-runs';

const TODAY: HistoryRange = { from: '2026-11-06T00:00:00', to: '2026-11-07T00:00:00' };
const YESTERDAY: HistoryRange = { from: '2026-11-05T00:00:00', to: '2026-11-06T00:00:00' };

@Component({
  imports: [CirculationRuns],
  template: `<app-circulation-runs [runs]="runs" [day]="day()" />`,
})
class Host {
  runs!: FakeQueryResource<HistoryRange, readonly CirculationRun[] | null>;
  readonly day = signal(TODAY);
}

describe('CirculationRuns', () => {
  let runs: FakeQueryResource<HistoryRange, readonly CirculationRun[] | null>;
  let fixture: ComponentFixture<Host>;

  beforeEach(() => {
    runs = fakeQueryResource();
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.runs = runs;
  });

  async function card(): Promise<HTMLElement> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="circulation-runs"]',
    )!;
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const rows = async () =>
    [...(await card()).querySelectorAll('[data-testid="run"]')].map((row) =>
      [...row.querySelectorAll('td')].map(words),
    );

  it('shows a progress bar until the runs of today answered', async () => {
    expect((await card()).querySelector('mat-progress-bar')).toBeTruthy();

    answerQuery(runs, TODAY, []);

    expect((await card()).querySelector('mat-progress-bar')).toBeNull();
  });

  it('lists the runs: the time, the trigger, the length, how it ended and the return', async () => {
    answerQuery(runs, TODAY, [
      {
        startedAt: '2026-11-06T09:00:23',
        trigger: 'manual',
        source: 'dashboard',
        returnAtStart: 31.06,
      },
      {
        startedAt: '2026-11-06T06:12:05',
        endedAt: '2026-11-06T06:14:15',
        trigger: 'manual',
        source: 'claude',
        stoppedBy: 'temperature',
        returnAtStart: 28.19,
        returnAtEnd: 35.06,
      },
    ]);

    expect(await rows()).toEqual([
      ['09:00', 'By hand (dashboard)', 'going on', 'going on', '31.1 °C'],
      ['06:12', 'By hand (claude)', '2 min 10 s', 'Return warm', '28.2 °C → 35.1 °C'],
    ]);
  });

  // missing is never 0, and a value of a newer service is printed as it came
  it('says not known for what a run leaves out, and prints an unknown word as it came', async () => {
    answerQuery(runs, TODAY, [
      { startedAt: '2026-11-06T10:00:00', endedAt: '2026-11-06T10:03:00', stoppedBy: 'flood' },
      { startedAt: '2026-11-06T09:00:00', endedAt: '2026-11-06T09:03:00' },
    ]);

    expect(await rows()).toEqual([
      ['10:00', 'not known', '3 min 0 s', 'flood', 'not known'],
      ['09:00', 'not known', '3 min 0 s', 'not known', 'not known'],
    ]);
  });

  it('says there was no run today for an empty list', async () => {
    answerQuery(runs, TODAY, []);

    expect(words(await card())).toContain('No run today.');
  });

  // a 200 without a body tells nothing about the runs - it is not "none"
  it('says the runs are not known for an answer without a body', async () => {
    answerQuery(runs, TODAY, null);

    expect(words(await card())).toContain('The service did not say which runs there were.');
    expect(words(await card())).not.toContain('No run today.');
  });

  // at midnight the runs of yesterday never stand under "today"
  it('shows nothing of another day while today is asked for', async () => {
    answerQuery(runs, YESTERDAY, [{ startedAt: '2026-11-05T22:00:00', trigger: 'manual' }]);

    expect((await card()).querySelector('mat-progress-bar')).toBeTruthy();
    expect(await rows()).toEqual([]);
  });

  it('tells a failure, with the runs it had for today', async () => {
    answerQuery(runs, TODAY, [{ startedAt: '2026-11-06T09:00:23', trigger: 'manual' }]);
    fail(runs, new ApiError('server', 502));

    expect(words((await card()).querySelector('[role="alert"]'))).toContain('(error 502)');
    expect(await rows()).toHaveLength(1);
  });

  it('speaks Polish', async () => {
    answerQuery(runs, TODAY, [
      {
        startedAt: '2026-11-06T09:00:23',
        endedAt: '2026-11-06T09:03:23',
        trigger: 'manual',
        stoppedBy: 'limit',
        returnAtStart: 31.06,
        returnAtEnd: 33.69,
      },
    ]);
    await useLanguage('pl');

    expect(await rows()).toEqual([
      ['09:00', 'Ręcznie', '3 min 0 s', 'Limit czasu', '31,1 °C → 33,7 °C'],
    ]);
    expect(words((await card()).querySelector('mat-card-title'))).toBe('Cyrkulacja dziś');
  });
});
