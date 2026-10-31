import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { provideI18nTesting } from '../../../../testing/i18n';
import { ScheduleEntry } from '../../../shared/room-heating/room-views';
import { HeaterScheduleEditor } from './heater-schedule-editor';

const MORNING: ScheduleEntry = {
  id: 7,
  days: [0, 1, 2, 3, 4],
  start: 420,
  end: 1020,
  temperature: 20.5,
  enabled: true,
};
const SATURDAY: ScheduleEntry = {
  id: 8,
  days: [5],
  start: 540,
  end: 780,
  temperature: 19,
  enabled: false,
};

// HAS-357: the periods of one heater, written through heating-service 1.14.0 and read back
describe('HeaterScheduleEditor', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HeaterScheduleEditor>;
  let readBack: ReturnType<typeof vi.fn>;

  const element = () => fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => element().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const all = (id: string) => [...element().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
  const said = () => element().textContent?.replace(/\s+/g, ' ') ?? '';

  function type(id: string, value: string): void {
    const input = byTestId(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function chooseDay(label: string): void {
    [...byTestId('period-days')!.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === label)!
      .click();
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    readBack = vi.fn(() => Promise.resolve());
    fixture = TestBed.createComponent(HeaterScheduleEditor);
    fixture.componentRef.setInput('room', 'living room');
    fixture.componentRef.setInput('heater', 'radiator');
    fixture.componentRef.setInput('entries', [SATURDAY, MORNING]);
    fixture.componentRef.setInput('readBack', readBack);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('lists the periods in the order of the week, a switched-off one marked', () => {
    const rows = all('schedule-period');

    expect(rows.map((row) => row.getAttribute('data-id'))).toEqual(['7', '8']);
    expect(rows[0].textContent?.replace(/\s+/g, ' ')).toContain(
      'Mon, Tue, Wed, Thu, Fri 07:00–17:00 20.5 °C',
    );
    expect(rows[1].classList).toContain('period--off');
  });

  it('adds a period, sends it as the service takes it and reads the rooms back', async () => {
    byTestId('period-add')!.click();
    fixture.detectChanges();
    chooseDay('Sun');
    chooseDay('Sat');
    type('period-start', '14:00');
    type('period-end', '22:00');
    type('period-temperature', '21,5');
    fixture.detectChanges();

    byTestId('period-save')!.click();
    const sent = http.expectOne('/home/heating/rooms/living%20room/heaters/radiator/schedules');
    expect(sent.request.method).toBe('POST');
    expect(sent.request.body).toEqual({
      days: ['SATURDAY', 'SUNDAY'],
      startTime: '14:00',
      endTime: '22:00',
      temperature: 21.5,
    });
    // the answer repeats the period and is not used: the list moves with the read-back
    sent.flush({ id: 9 }, { status: 201, statusText: 'Created' });
    await settle();

    expect(readBack).toHaveBeenCalledOnce();
    expect(byTestId('period-form')).toBeNull();
  });

  it('sends nothing while a rule is broken, and says which', async () => {
    byTestId('period-add')!.click();
    fixture.detectChanges();
    type('period-start', '22:00');
    type('period-end', '08:00');
    type('period-temperature', '20.2');
    byTestId('period-save')!.click();
    fixture.detectChanges();

    expect(byTestId('period-problems')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Choose at least one day.',
    );
    expect(said()).toContain('The period has to end after it starts, before midnight.');
    expect(said()).toContain('The temperature goes in steps of 0.5 °C.');
    http.expectNone(() => true);
  });

  it('refuses a window that overlaps another of the heater, a switched-off one included', () => {
    byTestId('period-add')!.click();
    fixture.detectChanges();
    chooseDay('Sat');
    type('period-start', '12:00');
    type('period-end', '14:00');
    type('period-temperature', '20');
    byTestId('period-save')!.click();
    fixture.detectChanges();

    expect(said()).toContain('It overlaps another period of this heater: Sat 09:00–13:00');
    http.expectNone(() => true);
  });

  it('changes a period - it may overlap what it was itself - and keeps the form when refused', async () => {
    all('period-edit')[0].click();
    fixture.detectChanges();
    expect((byTestId('period-start') as HTMLInputElement).value).toBe('07:00');
    type('period-start', '06:30');
    byTestId('period-save')!.click();

    const sent = http.expectOne('/home/heating/schedules/7');
    expect(sent.request.method).toBe('PUT');
    expect(sent.request.body).toEqual({
      days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      startTime: '06:30',
      endTime: '17:00',
      temperature: 20.5,
    });
    sent.flush(
      {
        errors: [
          {
            code: 'INVALID_SCHEDULE',
            message: 'Invalid schedule',
            details: 'the window overlaps schedule 5',
          },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(readBack).toHaveBeenCalledOnce();
    expect(byTestId('period-form')).not.toBeNull();
    expect(said()).toContain('The period was not saved.');
    expect(said()).toContain('refused the period for a reason this page could not check');
    expect(said()).not.toContain('overlaps schedule 5');
  });

  it('says a write without an answer may have been carried out', async () => {
    all('period-edit')[0].click();
    fixture.detectChanges();
    byTestId('period-save')!.click();
    http.expectOne('/home/heating/schedules/7').error(new ProgressEvent('error'), { status: 0 });
    await settle();

    expect(said()).toContain('the change may have been made all the same');
  });

  it('switches a period by its id, and the switch moves only with the read-back', async () => {
    const [, saturday] = all('period-switch');
    saturday.querySelector('button')!.click();

    const sent = http.expectOne('/home/heating/schedules/8/enabled?value=true');
    expect(sent.request.method).toBe('PUT');
    sent.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(readBack).toHaveBeenCalledOnce();
    // nothing flipped by itself: the entries are still those of the last answer
    expect(saturday.querySelector('button')!.getAttribute('aria-checked')).toBe('false');
  });

  it('removes a period after a question whose safe answer has the focus', async () => {
    all('period-remove')[0].click();
    fixture.detectChanges();

    expect(byTestId('period-remove-question')?.textContent).toContain('Remove this period?');
    expect(document.activeElement).toBe(byTestId('period-remove-cancel'));

    byTestId('period-remove-confirm')!.click();
    const sent = http.expectOne('/home/heating/schedules/7');
    expect(sent.request.method).toBe('DELETE');
    sent.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(readBack).toHaveBeenCalledOnce();
    expect(byTestId('period-remove-question')).toBeNull();
  });

  // removed elsewhere meanwhile: what was asked for is what the house has
  it('counts a period already gone as removed', async () => {
    all('period-remove')[0].click();
    fixture.detectChanges();
    byTestId('period-remove-confirm')!.click();
    http
      .expectOne('/home/heating/schedules/7')
      .flush(
        { errors: [{ code: 'NOT_FOUND_SCHEDULE', message: 'Schedule not found' }] },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();

    expect(said()).not.toContain('The period was not removed.');
  });

  it('closes the form of a period the read-back no longer has', () => {
    all('period-edit')[1].click();
    fixture.detectChanges();
    expect(byTestId('period-form')).not.toBeNull();

    fixture.componentRef.setInput('entries', [MORNING]);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(byTestId('period-form')).toBeNull();
  });

  it('offers no change of a period without an id - a service before 1.13.0', () => {
    fixture.componentRef.setInput('entries', [
      { days: [0], start: 420, end: 1020, temperature: 20, enabled: true },
    ]);
    fixture.detectChanges();

    expect(byTestId('period-edit')).toBeNull();
    expect(byTestId('period-switch')).toBeNull();
    expect(said()).toContain('This version of the heating service cannot change it.');
  });
});
