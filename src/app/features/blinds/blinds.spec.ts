import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';

import { provideI18nTesting } from '../../../testing/i18n';
import { BlindSchedule } from '../../data-access/blinds/blind-schedule';
import { RoomBlinds } from '../../data-access/blinds/blinds-api';
import { Blinds, roomsByFloor } from './blinds';

const BLINDS: readonly RoomBlinds[] = [
  {
    room: 'office',
    blinds: [
      { id: 1, name: 'Office window blinds', room: 'office', positioning: true, position: 40 },
      { id: 2, name: 'Office door blinds', room: 'office', positioning: true, position: 100 },
    ],
  },
  // a room the blind does not name: the group's room is taken
  { room: 'living room', blinds: [{ id: 7, name: 'Living room terrace blinds' }] },
  // an entry a control cannot address: no id
  { room: 'kitchen', blinds: [{ name: 'Lost' }] },
];

const SCHEDULES: readonly BlindSchedule[] = [
  {
    id: 1,
    name: 'Morning light',
    enabled: true,
    dayType: 'workday',
    targets: [{ room: 'office' }, { deviceId: 7 }],
    conditions: [],
    action: 'open',
  },
];

// HAS-252: the blinds page - the blinds by room, a room command and what it skipped, the
// schedules switched without optimistic state
describe('Blinds', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Blinds>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Blinds);
    fixture.detectChanges();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    http.expectOne('/home/blinds/schedules').flush(SCHEDULES);
    // the day of the schedule failed: the stored rule is shown instead
    http
      .expectOne('/home/blinds/schedules/1/today')
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    http
      .expectOne((call) => call.url === '/home/calendar/days')
      .flush([
        { date: '2026-11-11', type: 'day off', reason: 'Independence Day' },
        { date: '2026-11-14', type: 'day off', reason: 'Saturday' },
      ]);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  async function settled(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) {
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  const page = () => fixture.nativeElement as HTMLElement;
  const room = (name: string) =>
    page().querySelector<HTMLElement>(`[data-testid="blind-room"][data-room="${name}"]`)!;
  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('shows the rooms with blinds in the order of the floors, a blind without an id left out', () => {
    const rooms = [...page().querySelectorAll('[data-testid="blind-room"]')].map((card) =>
      card.getAttribute('data-room'),
    );

    expect(rooms).toEqual(['living room', 'office']);
    expect(text(room('office').querySelector('mat-card-subtitle'))).toBe('Upper floor · Blinds: 2');
    expect([...room('office').querySelectorAll('.blind__name')].map(text)).toEqual([
      'Door',
      'Window',
    ]);
  });

  it('tells the blinds a room command skipped, after reading the blinds again', async () => {
    room('office').querySelector<HTMLButtonElement>('[data-testid="room-close"]')!.click();
    const command = http.expectOne((call) => call.url === '/home/blinds/rooms/office');
    expect(command.request.params.get('command')).toBe('close');
    command.flush(
      {
        room: 'office',
        command: 'close',
        moved: [{ id: 1, name: 'Office window blinds' }],
        failed: [{ id: 2, name: 'Office door blinds', code: 'DEVICE_FAILED' }],
      },
      { status: 202, statusText: 'Accepted' },
    );
    await settled();
    // nothing is told before the blinds have answered again
    expect(room('office').querySelector('[data-testid="room-skipped"]')).toBeNull();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();

    expect(text(room('office').querySelector('[data-testid="room-skipped"]'))).toContain(
      'Office door blinds - The blind did not take the command.',
    );
  });

  it('shows the stored schedule when its day is not known, and the failure of that call', () => {
    const schedule = page().querySelector<HTMLElement>('[data-schedule="1"]')!;

    expect(text(schedule.querySelector('[data-testid="schedule-today"]'))).toBe('not known');
    expect(text(schedule.querySelector('app-api-error-strip'))).toContain(
      'What the schedule does today is not known.',
    );
    expect([...schedule.querySelectorAll('[data-testid="schedule-target"]')].map(text)).toEqual([
      'Every blind of office',
      expect.stringContaining('Living room terrace blinds (living room)'),
    ]);
  });

  it('leaves the switch of a schedule as the service says when switching it failed', async () => {
    const toggle = () =>
      page().querySelector<HTMLButtonElement>(
        '[data-schedule="1"] [data-testid="schedule-enabled"] [role="switch"]',
      )!;

    toggle().click();
    await settled();
    http
      .expectOne('/home/blinds/schedules/1/disable')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds/schedules').flush(SCHEDULES);
    http.expectOne('/home/blinds/schedules/1/today').flush({ scheduleId: 1, decision: 'fires' });
    await settled();

    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(text(page().querySelector('[data-schedule="1"]'))).toContain(
      'The schedule was not switched.',
    );
  });

  it('lists the holidays on weekdays only', () => {
    const holidays = [...page().querySelectorAll('[data-testid="holiday"]')];

    expect(holidays.map((day) => day.getAttribute('data-date'))).toEqual(['2026-11-11']);
    expect(text(holidays[0])).toBe('Wed 11 November Independence Day');
  });
});

describe('roomsByFloor', () => {
  it('orders the rooms by the floors of the house, a room it does not know last', () => {
    expect(
      roomsByFloor([
        { id: 1, room: 'office' },
        { id: 2, room: 'greenhouse' },
        { id: 3, room: 'kitchen' },
        { id: 4, room: 'office' },
      ]).map(({ room, floor, blinds }) => [room, floor, blinds.length]),
    ).toEqual([
      ['kitchen', 'floors.ground', 1],
      ['office', 'floors.upper', 2],
      ['greenhouse', 'floors.other', 1],
    ]);
  });
});
