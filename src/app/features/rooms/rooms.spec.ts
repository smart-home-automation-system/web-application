import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { provideI18nTesting } from '../../../testing/i18n';
import { RoomBlinds } from '../../data-access/blinds/blinds-api';
import { SmartDevice } from '../../data-access/devices/device-registry-api';
import { Room } from '../../data-access/heating/heating-api';
import { Rooms } from './rooms';

const DEVICES: readonly SmartDevice[] = [
  {
    id: 1,
    name: 'Office window blinds',
    room: 'office',
    kind: 'blinds',
    enabled: true,
    vendor: 'shelly',
    positioning: true,
  },
  {
    id: 5,
    name: 'Office dimmer',
    room: 'office',
    kind: 'light',
    enabled: true,
    vendor: 'eaton',
    eaton: { gateway: 'lights', point: 12 },
    lightKind: 'dimmer',
  },
  { id: 6, name: 'Office lamp', room: 'office', kind: 'light', enabled: true, vendor: 'shelly' },
  { id: 8, name: 'Office motion', room: 'office', kind: 'motion sensor', enabled: true },
  { id: 9, name: 'Office window', room: 'office', kind: 'opening sensor', enabled: true },
  { id: 10, name: 'Office button', room: 'office', kind: 'push button', enabled: true },
  // an entry the page cannot address: no id
  { name: 'Lost', room: 'office', kind: 'light' },
];

const HEATING: readonly Room[] = [
  {
    name: 'office',
    temperature: { value: 0, updatedAt: '2026-10-17T20:00:00' },
    heaters: [{ type: 'radiator', working: true }],
    window: { state: 'open', openSince: '2026-10-17T19:50:00', hold: true },
  },
];

const BLINDS: readonly RoomBlinds[] = [
  { room: 'office', blinds: [{ id: 1, position: 40, state: 'stopped', window: 'closed' }] },
];

// HAS-232: the room view - four calls put together per room, and the controls of the window of
// a room: a blind read again after every command, a light only sent to
describe('Rooms', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Rooms>;

  beforeEach(() => {
    vi.useFakeTimers();
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
    fixture = TestBed.createComponent(Rooms);
    fixture.detectChanges();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/device/registry').flush(DEVICES);
    http.expectOne('/home/heating/rooms').flush(HEATING);
    http.expectOne('/home/blinds').flush(BLINDS);
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
  const tile = (room: string) => page().querySelector<HTMLElement>(`[data-room-tile="${room}"]`)!;
  const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container')!;
  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (within: HTMLElement, label: string) =>
    [...within.querySelectorAll('button')].find((one) => text(one).includes(label))!;

  async function openOffice(): Promise<HTMLElement> {
    button(tile('office'), 'Details').click();
    await settled();
    const window = dialog();
    return window;
  }

  it('shows every room with the rows of the owner, 0 °C as a reading', () => {
    const office = tile('office');

    expect(office.querySelectorAll('[data-row]')).toHaveLength(8);
    expect(text(office.querySelector('[data-row="temperature"] dd'))).toBe('0.0 °C');
    expect(text(office.querySelector('[data-row="heating"] dd'))).toBe('held');
    expect(text(office.querySelector('[data-row="blinds"] dd'))).toBe('40 %');
    expect(text(office.querySelector('[data-row="openingSensors"] dd'))).toBe('open');
    expect(text(office.querySelector('[data-row="other"] dd'))).toBe('1');
    expect(text(tile('kitchen').querySelector('[data-row="temperature"] dd'))).toBe('none');
  });

  it('shows the room in its window, its devices by their short names', async () => {
    const window = await openOffice();

    expect(text(window.querySelector('[data-section="temperature"]'))).toContain('0.0 °C');
    expect(window.querySelector('[data-testid="detail-held"]')).not.toBeNull();
    // the heating is set on its own page only: nothing here leads there
    expect(window.querySelector('[data-section="heating"] a')).toBeNull();
    expect(text(window.querySelector('[data-blind="1"] .list__name'))).toBe('Window');
    // the schedules have a page of their own
    expect(window.querySelector('[data-testid="blind-schedules"]')).toBeNull();
    // a Shelly light has no control here; an Eaton one has
    expect(text(window.querySelector('[data-light="6"]'))).toContain(
      'Not controlled from here yet',
    );
  });

  it('moves a blind and reads the blinds again', async () => {
    const window = await openOffice();

    button(window.querySelector('[data-blind="1"]')!, 'Close').click();
    const command = http.expectOne((call) => call.url === '/home/blinds/1');
    expect(command.request.params.get('command')).toBe('close');
    command.flush(null, { status: 202, statusText: 'Accepted' });
    await settled();
    vi.advanceTimersByTime(1);
    http
      .expectOne('/home/blinds')
      .flush([{ room: 'office', blinds: [{ id: 1, position: 0, state: 'closed' }] }]);
    await settled();

    expect(text(window.querySelector('[data-blind="1"] [data-testid="blind-position"]'))).toBe(
      '0 %',
    );
  });

  it('pauses the schedules of a blind and shows the pause only once the service says so', async () => {
    const window = await openOffice();
    const toggle = () =>
      window.querySelector<HTMLButtonElement>('[data-blind="1"] [role="switch"]')!;

    toggle().click();
    await settled();
    http.expectOne('/home/blinds/1/schedule-pause').flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await settled();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/blinds').flush(BLINDS);
    await settled();

    // the pause failed: the switch shows the service, not the click
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(window.querySelector('[data-blind="1"] app-api-error-strip')?.textContent).toContain(
      'The command was not confirmed',
    );
  });

  it('sends a light and a level, and says only that they were sent', async () => {
    const window = await openOffice();
    const light = window.querySelector<HTMLElement>('[data-light="5"]')!;

    button(light, 'On').click();
    const on = http.expectOne((call) => call.url === '/home/amx/lights/12');
    expect(on.request.params.get('turn')).toBe('on');
    on.flush({ point: 12, status: 'OK' }, { status: 202, statusText: 'Accepted' });
    await settled();
    expect(text(light.querySelector('[role="status"]'))).toBe('Sent');

    button(light, 'Set').click();
    const level = http.expectOne((call) => call.url === '/home/amx/lights/12/level');
    expect(level.request.params.get('value')).toBe('50');
    level.flush({ point: 12, status: 'OK' }, { status: 202, statusText: 'Accepted' });
    await settled();

    button(light, 'Off').click();
    http
      .expectOne((call) => call.url === '/home/amx/lights/12')
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    await settled();
    expect(light.querySelector('app-api-error-strip')).not.toBeNull();
  });
});
