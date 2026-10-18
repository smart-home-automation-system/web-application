import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { provideI18nTesting } from '../../../../testing/i18n';
import { BlindSchedule } from '../../../data-access/blinds/blind-schedule';
import { RoomBlinds } from '../../../data-access/blinds/blinds-api';
import { MockInstance } from 'vitest';

import { ScheduleEditor } from './schedule-editor';

const BLINDS: readonly RoomBlinds[] = [
  {
    room: 'office',
    blinds: [
      { id: 1, name: 'Office window blinds', room: 'office' },
      { id: 2, name: 'Office door blinds', room: 'office' },
    ],
  },
];

const STORED: BlindSchedule = {
  id: 2,
  name: 'Summer shade',
  enabled: true,
  dayType: 'any',
  window: {
    from: { kind: 'clock', time: '11:00' },
    to: { kind: 'sunset', offsetMinutes: -30, latest: '19:00' },
  },
  // a blind the blinds service does not know: kept, so that a save does not drop it unseen
  targets: [{ deviceId: 1 }, { deviceId: 99 }],
  conditions: [
    { metric: 'outside temperature', operator: 'gt', threshold: 25, holdMinutes: 15 },
    { metric: 'window closed', operator: 'is', value: true, holdMinutes: 0 },
  ],
  action: 'position',
  position: 30,
};

// what the service answers and the editor sends back unchanged: the stored schedule without its id
const STORED_BODY: BlindSchedule = { ...STORED, id: undefined };
delete (STORED_BODY as { id?: number }).id;

// HAS-253: the editor of a schedule of the blinds, against the calls of blinds-service
describe('ScheduleEditor', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ScheduleEditor>;
  let navigate: MockInstance<Router['navigate']>;

  function open(id: string | null, room?: string): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(id === null ? {} : { id }),
              queryParamMap: convertToParamMap(room === undefined ? {} : { room }),
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ScheduleEditor);
    fixture.detectChanges();
  }

  const element = () => fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => element().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  // the words as they read: white space between the pieces of a line counts once
  const said = () => element().textContent?.replace(/\s+/g, ' ');
  const texts = (selector: string) =>
    [...element().querySelectorAll(selector)].map((one) => one.textContent?.trim());

  function type(input: HTMLInputElement | null, value: string): void {
    input!.value = value;
    input!.dispatchEvent(new Event('input'));
  }

  function choose(group: string, label: string): void {
    const button = [...byTestId(group)!.querySelectorAll('button')].find(
      (one) => one.textContent?.trim() === label,
    );
    button!.click();
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  describe('a new schedule', () => {
    beforeEach(async () => {
      open(null, 'office');
      await settle();
      http.expectOne('/home/blinds').flush(BLINDS);
      await settle();
    });

    it('starts with every blind of the room it was opened for, and asks nothing of today', () => {
      expect(byTestId('schedule-targets')?.textContent).toContain('Every blind of office');
      expect(byTestId('schedule-today-line')).toBeNull();
      expect(byTestId('schedule-remove')).toBeNull();
    });

    it('sends nothing while a rule of the service is broken, and says which', async () => {
      byTestId('schedule-save')!.click();
      await settle();

      expect(texts('mat-error')).toEqual([
        'Give the schedule a name.',
        'Give a time.',
        'Give a time.',
      ]);
      expect(texts('.problem')).toEqual(['Choose the days.', 'Choose what the schedule does.']);

      type(byTestId('schedule-name') as HTMLInputElement, 'Night');
      const [from, to] = element().querySelectorAll<HTMLInputElement>('[data-testid="end-time"]');
      type(from, '21:00');
      type(to, '21:00');
      choose('schedule-day-type', 'Every day');
      choose('schedule-action', 'Close');
      byTestId('schedule-save')!.click();
      await settle();

      expect(byTestId('window-problem')?.textContent).toContain('the window would be empty');
      // nothing was sent: verify() finds no request
    });

    it('stores the schedule as entered and opens it at its own address', async () => {
      type(byTestId('schedule-name') as HTMLInputElement, '  Night close ');
      const [from, to] = element().querySelectorAll<HTMLInputElement>('[data-testid="end-time"]');
      type(from, '21:00');
      type(to, '06:00');
      choose('schedule-day-type', 'Days off');
      byTestId('condition-add')!.click();
      fixture.detectChanges();
      type(byTestId('condition-threshold') as HTMLInputElement, '12,5');
      type(byTestId('condition-hold') as HTMLInputElement, '10');
      choose('condition-operator', 'below');
      choose('schedule-action', 'Close');
      byTestId('schedule-save')!.click();
      await settle();

      const create = http.expectOne('/home/blinds/schedules');
      expect(create.request.method).toBe('POST');
      expect(create.request.body).toEqual({
        name: 'Night close',
        enabled: true,
        dayType: 'day off',
        window: { from: { kind: 'clock', time: '21:00' }, to: { kind: 'clock', time: '06:00' } },
        targets: [{ room: 'office' }],
        conditions: [{ metric: 'illuminance', operator: 'lt', threshold: 12.5, holdMinutes: 10 }],
        action: 'close',
      });
      create.flush({ ...create.request.body, id: 4 }, { status: 201, statusText: 'Created' });
      await settle();

      expect(navigate).toHaveBeenCalledWith(['/blinds/schedules', 4], { replaceUrl: true });
    });
  });

  describe('a stored schedule', () => {
    beforeEach(async () => {
      open('2');
      await settle();
      http.expectOne('/home/blinds/schedules/2').flush(STORED);
      http.expectOne('/home/blinds').flush(BLINDS);
      http.expectOne('/home/blinds/schedules/2/today').flush({
        scheduleId: 2,
        window: { from: '11:00', to: '17:42' },
        decision: 'waiting for the conditions',
      });
      await settle();
    });

    it('shows what the engine makes of it today, and the form filled from the service', () => {
      expect(byTestId('schedule-today-line')?.textContent).toContain('11:00–17:42');
      expect(byTestId('today-decision')?.textContent).toContain('waiting for the conditions');
      expect((byTestId('schedule-name') as HTMLInputElement).value).toBe('Summer shade');
      expect(byTestId('schedule-targets')?.textContent).toContain('Office window blinds');
      // a blind the blinds service does not know: kept, by its id of the registry
      expect(byTestId('schedule-targets')?.textContent).toContain('Blind 99');
      expect(element().querySelectorAll('[data-testid="condition-row"]')).toHaveLength(2);
      expect(byTestId('schedule-position-value')?.textContent).toContain('30');
    });

    it('tells an empty read after a save as a failed read, and keeps the form', async () => {
      byTestId('schedule-save')!.click();
      await settle();
      http.expectOne('/home/blinds/schedules/2').flush(STORED);
      await settle();
      http.expectOne('/home/blinds/schedules/2').flush(null);
      await settle();
      http.expectOne('/home/blinds/schedules/2/today').flush({ scheduleId: 2 });
      await settle();

      expect(element().querySelector('form')).not.toBeNull();
      expect(said()).toContain('The schedule was saved, but could not be read back.');
    });

    it('sends it back whole and unchanged, then reads it again', async () => {
      byTestId('schedule-save')!.click();
      await settle();

      const replace = http.expectOne('/home/blinds/schedules/2');
      expect(replace.request.method).toBe('PUT');
      expect(replace.request.body).toEqual(STORED_BODY);
      replace.flush(STORED);
      await settle();
      http.expectOne('/home/blinds/schedules/2').flush({ ...STORED, name: 'Summer shade' });
      await settle();
      http.expectOne('/home/blinds/schedules/2/today').flush({ scheduleId: 2 });
      await settle();

      expect(byTestId('schedule-saved')?.textContent).toContain('Saved');
    });

    it('keeps the form as entered when the service refuses it', async () => {
      type(byTestId('schedule-name') as HTMLInputElement, 'Shade');
      byTestId('schedule-save')!.click();
      await settle();

      http
        .expectOne('/home/blinds/schedules/2')
        .flush(
          { errors: [{ message: 'Invalid schedule', code: 'INVALID_SCHEDULE' }] },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();
      http.expectOne('/home/blinds/schedules/2/today').flush({ scheduleId: 2 });
      await settle();

      expect((byTestId('schedule-name') as HTMLInputElement).value).toBe('Shade');
      expect(said()).toContain(
        'The schedule was not saved. The blinds service refused the schedule.',
      );
      expect(byTestId('schedule-saved')?.textContent?.trim()).toBe('');
    });

    it('says that a save without an answer may have been carried out', async () => {
      byTestId('schedule-save')!.click();
      await settle();
      http.expectOne('/home/blinds/schedules/2').error(new ProgressEvent('error'));
      await settle();
      http.expectOne('/home/blinds/schedules/2/today').flush({ scheduleId: 2 });
      await settle();

      expect(said()).toContain('the schedule may have been saved all the same');
    });

    it('asks before removing, Cancel first, then goes back to the blinds', async () => {
      byTestId('schedule-remove')!.click();
      await settle();
      expect(byTestId('remove-question')?.textContent).toContain('Remove this schedule for good?');
      expect(document.activeElement).toBe(byTestId('schedule-remove-cancel'));

      byTestId('schedule-remove-confirm')!.click();
      await settle();
      const remove = http.expectOne('/home/blinds/schedules/2');
      expect(remove.request.method).toBe('DELETE');
      remove.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(navigate).toHaveBeenCalledWith(['/blinds']);
    });
  });

  it('tells a schedule the service does not know', async () => {
    open('9');
    await settle();
    http
      .expectOne('/home/blinds/schedules/9')
      .flush(
        { errors: [{ message: 'no schedule with id 9', code: 'NOT_FOUND_SCHEDULE' }] },
        { status: 404, statusText: 'Not Found' },
      );
    http.expectOne('/home/blinds').flush(BLINDS);
    http.expectOne('/home/blinds/schedules/9/today').flush(null, {
      status: 404,
      statusText: 'Not Found',
    });
    await settle();

    expect(byTestId('schedule-missing')?.textContent).toContain(
      'The blinds service does not know this schedule.',
    );
    expect(element().querySelector('form')).toBeNull();
  });

  it('refuses to send back a value this version does not offer', async () => {
    open('5');
    await settle();
    http.expectOne('/home/blinds/schedules/5').flush({
      ...STORED,
      id: 5,
      window: { from: { kind: 'noon', offsetMinutes: 0 }, to: STORED.window?.to },
      conditions: [{ metric: 'humidity', operator: 'gt', threshold: 80, holdMinutes: 0 }],
    });
    http.expectOne('/home/blinds').flush(BLINDS);
    http.expectOne('/home/blinds/schedules/5/today').flush({ scheduleId: 5 });
    await settle();

    byTestId('schedule-save')!.click();
    await settle();

    expect(byTestId('unknown-values')?.textContent).toContain('noon, humidity');
    // nothing was sent: verify() finds no request
  });

  it('takes an address that is no id for a schedule nobody knows', async () => {
    open('abc');
    await settle();
    http.expectOne('/home/blinds').flush(BLINDS);
    await settle();

    expect(byTestId('schedule-missing')).not.toBeNull();
  });
});
