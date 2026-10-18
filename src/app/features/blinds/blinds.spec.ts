import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { provideI18nTesting } from '../../../testing/i18n';
import { BlindSchedule } from '../../data-access/blinds/blind-schedule';
import { RoomBlinds } from '../../data-access/blinds/blinds-api';
import { Blinds, floorsOf, schedulesOf } from './blinds';

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
  // an entry a control cannot address: no id - and the kitchen has no blind it can show
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
  { id: 2, name: 'Terrace only', enabled: true, targets: [{ deviceId: 7 }], action: 'close' },
];

// HAS-252, the layout of the owner (2026-10-18): the holidays and the whole house at the top,
// the rooms with blinds floor by floor in cards of one size, the schedules of a room in a window
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
    // the day of the first schedule failed: the stored rule is shown instead
    http
      .expectOne('/home/blinds/schedules/1/today')
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    http.expectOne('/home/blinds/schedules/2/today').flush({ scheduleId: 2, decision: 'fires' });
    http
      .expectOne((call) => call.url === '/home/calendar/days')
      .flush([
        { date: '2026-11-11', type: 'day off', reason: 'Independence Day' },
        { date: '2026-11-14', type: 'day off', reason: 'Saturday' },
      ]);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
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
  const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container')!;

  it('shows only the rooms with blinds, floor by floor, every card with room for the most blinds', () => {
    const floors = [...page().querySelectorAll('[data-testid="floor"]')].map((floor) => [
      floor.getAttribute('data-floor'),
      [...floor.querySelectorAll('[data-testid="blind-room"]')].map((card) =>
        card.getAttribute('data-room'),
      ),
    ]);

    expect(floors).toEqual([
      ['ground', ['living room']],
      ['upper', ['office']],
    ]);
    // the cards are of one size: each has room for the two blinds of the office
    expect(page().style.getPropertyValue('--blind-lines')).toBe('2');
    expect([...room('office').querySelectorAll('.blind__text')].map(text)).toEqual([
      'Door',
      'Window',
    ]);
    expect(text(room('office').querySelector('[data-testid="room-schedules"]'))).toContain(
      'Schedules: 1',
    );
    expect(text(room('living room').querySelector('[data-testid="room-schedules"]'))).toContain(
      'Schedules: 2',
    );
  });

  it('tells the blinds a room command skipped in the line of the card, after the read-back', async () => {
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
    expect(text(room('office').querySelector('[data-testid="room-status"]'))).toBe('');
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();

    expect(text(room('office').querySelector('[data-testid="room-status"]'))).toContain(
      'Not taken by: 1',
    );
  });

  it('moves the whole house room by room, a room that failed told by its name', async () => {
    page().querySelector<HTMLButtonElement>('[data-testid="house-close"]')!.click();
    await settled();
    // the rooms wait for the house
    expect(
      room('office').querySelector<HTMLButtonElement>('[data-testid="room-open"]')!.disabled,
    ).toBe(true);
    http
      .expectOne((call) => call.url === '/home/blinds/rooms/living%20room')
      .flush(
        { errors: [{ message: 'Blind did not take the command', code: 'DEVICE_FAILED' }] },
        { status: 502, statusText: 'Bad Gateway' },
      );
    await settled();
    // one after the other: the office is sent once the living room has answered
    const office = http.expectOne((call) => call.url === '/home/blinds/rooms/office');
    expect(office.request.params.get('command')).toBe('close');
    office.flush({ moved: [], failed: [] }, { status: 202, statusText: 'Accepted' });
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();

    expect(text(page().querySelector('[data-testid="house-status"]'))).toContain(
      'Not taken: 1 - living room',
    );
  });

  // one command per blind at a time: the room waits for its blinds, and they for the room (found
  // in review)
  it('holds the blinds of a room while a command to the room is on its way, and the room for them', async () => {
    const office = room('office');
    const blindButtons = () =>
      [...office.querySelectorAll<HTMLButtonElement>('.blind__commands button')].map(
        (button) => button.disabled,
      );
    const roomOpen = () =>
      office.querySelector<HTMLButtonElement>('[data-testid="room-open"]')!.disabled;

    office.querySelector<HTMLButtonElement>('[data-testid="room-open"]')!.click();
    await settled();
    expect(blindButtons().every(Boolean)).toBe(true);
    http
      .expectOne((call) => call.url === '/home/blinds/rooms/office')
      .flush({ moved: [], failed: [] }, { status: 202, statusText: 'Accepted' });
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();
    expect(blindButtons().some(Boolean)).toBe(false);

    office.querySelector<HTMLButtonElement>('.blind__commands button')!.click();
    await settled();
    expect(roomOpen()).toBe(true);
    http
      .expectOne((call) => call.url === '/home/blinds/2')
      .flush(null, {
        status: 202,
        statusText: 'Accepted',
      });
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();
    expect(roomOpen()).toBe(false);
  });

  it('shows the schedules of a room in a window, the stored rule when its day is not known', async () => {
    room('office').querySelector<HTMLButtonElement>('[data-testid="room-schedules"]')!.click();
    await settled();
    const window = dialog();

    const schedules = [...window.querySelectorAll<HTMLElement>('[data-testid="schedule"]')];
    expect(schedules.map((card) => card.getAttribute('data-schedule'))).toEqual(['1']);
    expect(text(schedules[0].querySelector('[data-testid="schedule-today"]'))).toBe('not known');
    expect(text(schedules[0])).toContain('What the schedule does today is not known.');
    // only the blinds of this room: the terrace of the living room is left out
    expect([...schedules[0].querySelectorAll('[data-testid="schedule-target"]')].map(text)).toEqual(
      ['Every blind of office'],
    );
    // the pause of each blind of the room, the door first
    expect([...window.querySelectorAll('[data-testid="blind-pause"]')].map(text)).toEqual([
      'Door Office door blinds',
      'Window Office window blinds',
    ]);
  });

  it('leaves the pause of a blind as the service says when the pause failed', async () => {
    room('office').querySelector<HTMLButtonElement>('[data-testid="room-schedules"]')!.click();
    await settled();
    const toggle = () =>
      dialog().querySelector<HTMLButtonElement>('[data-blind="2"] [role="switch"]')!;

    toggle().click();
    await settled();
    http
      .expectOne('/home/blinds/2/schedule-pause')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds/schedules').flush(SCHEDULES);
    http.expectOne('/home/blinds/schedules/1/today').flush({ scheduleId: 1 });
    http.expectOne('/home/blinds/schedules/2/today').flush({ scheduleId: 2 });
    await settled();

    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(text(dialog().querySelector('[data-blind="2"] [role="alert"]'))).toContain(
      'The service is not available right now',
    );
  });

  it('lists the holidays on weekdays only', () => {
    const holidays = [...page().querySelectorAll('[data-testid="holiday"]')];

    expect(holidays.map((day) => day.getAttribute('data-date'))).toEqual(['2026-11-11']);
    expect(text(holidays[0])).toBe('Wed 11 November Independence Day');
  });
});

describe('floorsOf', () => {
  it('groups the rooms with blinds by the floors of the house, a room it does not know last', () => {
    expect(
      floorsOf([
        { id: 1, room: 'office' },
        { id: 2, room: 'greenhouse' },
        { id: 3, room: 'kitchen' },
        { id: 4, room: 'office' },
      ]).map(({ id, rooms }) => [id, rooms.map((one) => [one.room, one.blinds.length])]),
    ).toEqual([
      ['ground', [['kitchen', 1]]],
      ['upper', [['office', 2]]],
      ['other', [['greenhouse', 1]]],
    ]);
  });
});

describe('schedulesOf', () => {
  const office = { room: 'office', blinds: [{ id: 1 }, { id: 2 }] };

  it('takes what the engine moves today over the targets as stored', () => {
    expect(
      schedulesOf(office, [
        // stored for the office, but today the engine moves the terrace only
        {
          schedule: { id: 1, targets: [{ room: 'office' }] },
          today: { targets: [{ deviceId: 7 }] },
        },
        { schedule: { id: 2, targets: [{ deviceId: 2 }] } },
        { schedule: { id: 3, targets: [{ room: 'kitchen' }] } },
        { schedule: { id: 4 } },
      ]).map((entry) => entry.schedule.id),
    ).toEqual([2]);
  });
});
