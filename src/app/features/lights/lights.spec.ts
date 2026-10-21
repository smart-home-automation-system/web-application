import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';

import { provideI18nTesting } from '../../../testing/i18n';
import { EmptyHouse, RoomLights, RoomRule } from '../../data-access/light/light-api';
import { LIGHTS_READ_AGAIN_AFTER_MS } from '../../shared/lights/light-read-back';
import { Lights } from './lights';

const LIGHTS: readonly RoomLights[] = [
  {
    room: 'office',
    anyOn: true,
    lights: [
      {
        id: 3,
        name: 'Office main light',
        room: 'office',
        kind: 'relay',
        on: false,
        changedAt: '2026-10-20T09:00:00',
        source: 'switch',
        reachable: true,
      },
      {
        id: 40,
        name: 'Office desk lamp',
        room: 'office',
        kind: 'dimmer',
        on: true,
        brightness: 70,
        changedAt: '2026-10-20T09:50:00',
        source: 'dashboard',
        reachable: true,
        heldUntil: '2026-10-20T10:50:00',
      },
    ],
    occupancy: {
      room: 'office',
      occupied: true,
      since: '2026-10-20T09:30:00',
      lastMotionAt: '2026-10-20T09:57:00',
      lux: 39,
      sensors: [
        {
          id: 50,
          name: 'Office presence',
          kind: 'presence sensor',
          lastReportAt: '2026-10-20T09:59:00',
        },
      ],
    },
  },
  {
    room: 'living room',
    lights: [
      // nothing heard of it since the start: neither on nor off
      { id: 41, name: 'Living room colour strip', room: 'living room', kind: 'rgbw' },
      {
        id: 44,
        name: 'Living room hood',
        room: 'living room',
        kind: 'rgbw',
        on: false,
        brightness: 100,
        // a Gen2 RGBW in the profile rgb: no white channel
        color: { rgb: [0, 120, 255] },
      },
      {
        id: 45,
        name: 'Living room lamp',
        room: 'living room',
        kind: 'rgbw',
        on: true,
        brightness: 80,
        color: { rgb: [255, 140, 40], white: 10 },
        reachable: false,
      },
    ],
    // motion sensors only: never occupied or empty
    occupancy: { room: 'living room', lastMotionAt: '2026-10-20T09:56:00', illumination: 'dark' },
  },
  // an entry a control cannot address: no id - and an entry that is no room at all
  { room: 'kitchen', lights: [{ name: 'Lost' }] },
  { lights: [] },
];

const RULES: readonly RoomRule[] = [
  {
    room: 'office',
    autoOffEnabled: true,
    autoOffDelayMinutes: 15,
    motionOnEnabled: false,
    periods: [],
    manualHoldMinutes: 60,
    enabledByResident: true,
  },
  {
    room: 'living room',
    autoOffEnabled: false,
    motionOnEnabled: true,
    onlyBelowLux: 30,
    motionOffAfterMinutes: 3,
    periods: [{ from: '22:00', to: '06:00', brightness: 10, rgb: [255, 120, 0] }],
    manualHoldMinutes: 30,
    enabledByResident: false,
  },
];

const HOUSE: EmptyHouse = {
  enabled: true,
  house: 'occupied',
  active: false,
  dusk: '2026-10-20T18:12:00',
  sunrise: '2026-10-21T07:15:00',
  lit: [40, 99],
};

// HAS-266: every light of light-service, room by room, with the occupancy, the rules and the empty house
describe('Lights', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Lights>;

  function start(rules: readonly RoomRule[] | Error = RULES, house: EmptyHouse = HOUSE): void {
    fixture = TestBed.createComponent(Lights);
    fixture.detectChanges();
    vi.advanceTimersByTime(1);
    http.expectOne('/home/light').flush(LIGHTS);
    const ruleCall = http.expectOne('/home/light/rules');
    if (rules instanceof Error) {
      ruleCall.flush(null, { status: 502, statusText: 'Bad Gateway' });
    } else {
      ruleCall.flush(rules);
    }
    http.expectOne('/home/light/empty-house').flush(house);
    fixture.detectChanges();
  }

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

  // a read the page asks for starts on the next tick of the clock
  async function nextRead(): Promise<void> {
    await settled();
    vi.advanceTimersByTime(1);
  }

  const page = () => fixture.nativeElement as HTMLElement;
  const room = (name: string) =>
    page().querySelector<HTMLElement>(`[data-testid="light-room"][data-room="${name}"]`)!;
  const light = (id: number) =>
    page().querySelector<HTMLElement>(`[data-testid="light"][data-light="${id}"]`)!;
  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container')!;
  const click = (element: Element | null) => {
    (element as HTMLElement).click();
    fixture.detectChanges();
  };

  it('shows the rooms with lights floor by floor, every card with room for the most lights', () => {
    start();

    const floors = [...page().querySelectorAll('[data-testid="floor"]')].map((floor) => [
      floor.getAttribute('data-floor'),
      [...floor.querySelectorAll('[data-testid="light-room"]')].map((card) =>
        card.getAttribute('data-room'),
      ),
    ]);
    // the kitchen has no light a control can address, but it is a room of the service
    expect(floors).toEqual([
      ['ground', ['living room', 'kitchen']],
      ['upper', ['office']],
    ]);
    expect(
      [...page().querySelectorAll<HTMLElement>('[data-testid="floor"]')].map((floor) =>
        floor.style.getPropertyValue('--light-lines'),
      ),
    ).toEqual(['3', '2']);
    expect([...room('office').querySelectorAll('.light__text')].map(text)).toEqual([
      'Desk lamp',
      'Main',
    ]);
  });

  it('says what a light is: on with its brightness, off, or not known - never off for want of a word', () => {
    start();

    expect(light(40).getAttribute('data-state')).toBe('on');
    expect(text(light(40).querySelector('[data-testid="light-state"]'))).toBe('on · 70 %');
    expect(text(light(3).querySelector('[data-testid="light-state"]'))).toBe('off');
    expect(light(41).getAttribute('data-state')).toBe('unknown');
    expect(text(light(41).querySelector('[data-testid="light-state"]'))).toBe('not known yet');
    // the manual hold and a light out of reach are marks on the line
    expect(light(40).querySelector('[data-testid="light-held"]')).not.toBeNull();
    expect(light(45).querySelector('[data-testid="light-unreachable"]')).not.toBeNull();
    expect(light(3).querySelector('[data-testid="light-unreachable"]')).toBeNull();
  });

  it('tells the occupancy of a room as its sensors do - a room of motion sensors only is not known', () => {
    start();

    expect(text(room('office').querySelector('[data-testid="occupancy"]'))).toBe(
      'person Occupied · motion 3 min ago · 39 lx',
    );
    expect(text(room('living room').querySelector('[data-testid="occupancy"]'))).toBe(
      'help Occupancy not known · motion 4 min ago · dark',
    );
    expect(text(room('kitchen').querySelector('[data-testid="occupancy"]'))).toBe(
      'help Occupancy not known',
    );
  });

  it('sums the rule of a room on its card, and marks one the resident switched off', () => {
    start();

    expect(text(room('office').querySelector('[data-testid="room-rule"]'))).toBe(
      'rule off 15 min after empty · by hand left 60 min',
    );
    expect(text(room('living room').querySelector('[data-testid="room-rule"]'))).toContain(
      'on by motion below 30 lx · by hand left 30 min',
    );
    expect(room('living room').querySelector('[data-testid="rule-resident-off"]')).not.toBeNull();
    expect(text(room('kitchen').querySelector('[data-testid="room-rule"]'))).toBe('rule No rule');
  });

  it('says the rules are not known while their service has not answered - never "no rule"', () => {
    start(new Error());

    expect(text(room('office').querySelector('[data-testid="room-rule"]'))).toBe(
      'rule Rules not known',
    );
  });

  it('counts the lights of the house by state, and names the rooms somebody is in', () => {
    start();

    expect(text(page().querySelector('[data-testid="count-on"]'))).toBe('2');
    expect(text(page().querySelector('[data-testid="count-off"]'))).toBe('2');
    expect(text(page().querySelector('[data-testid="count-unknown"]'))).toBe('1');
    expect(text(page().querySelector('[data-testid="occupied-rooms"]'))).toBe(
      'Somebody in: office',
    );
  });

  it('tells the empty house: nobody known away, the night, and what the simulation would light', () => {
    start();

    const card = page().querySelector('[data-testid="empty-house"]');
    expect(text(card?.querySelector('[data-testid="empty-house-state"]'))).toBe('Somebody at home');
    expect(text(card?.querySelector('[data-testid="empty-house-night"]'))).toBe(
      'Night: 18:12 – 07:15',
    );
    // a light the lights did not answer with is named by its id
    expect(text(card?.querySelector('[data-testid="empty-house-lit"]'))).toBe(
      'Would light now: Office desk lamp, #99',
    );
    expect(card?.querySelector('[data-testid="empty-house-active"]')).toBeNull();
  });

  it('tells an empty house the service acts on', () => {
    start(RULES, {
      enabled: true,
      house: 'empty',
      emptySince: '2026-10-20T09:00:00',
      active: true,
      phase: 'evening',
      lit: [],
      nextChangeAt: '2026-10-20T21:30:00',
    });

    const card = page().querySelector('[data-testid="empty-house"]');
    expect(text(card?.querySelector('[data-testid="empty-house-state"]'))).toBe(
      'Nobody at home · since 1 hr ago',
    );
    expect(card?.querySelector('[data-testid="empty-house-active"]')).not.toBeNull();
    expect(text(card?.querySelector('[data-testid="empty-house-phase"]'))).toBe(
      'Simulation: evening · next change at 21:30',
    );
    expect(text(card?.querySelector('[data-testid="empty-house-lit"]'))).toBe('Lit now: nothing');
  });

  it('switches a light, reads the lights again - and once more for an Eaton light that reports late', async () => {
    start();

    click(light(3).querySelector('[data-testid="light-on"]'));
    const command = http.expectOne((call) => call.url === '/home/light/3');
    expect(command.request.method).toBe('POST');
    expect(command.request.params.get('turn')).toBe('on');
    expect(command.request.params.get('source')).toBe('dashboard');
    // one command per light at a time
    expect(light(3).querySelector<HTMLButtonElement>('[data-testid="light-off"]')!.disabled).toBe(
      true,
    );
    command.flush(null, { status: 202, statusText: 'Accepted' });

    // nothing optimistic: the light is still off until the read says otherwise
    expect(light(3).getAttribute('data-state')).toBe('off');
    const switched = structuredClone(LIGHTS) as RoomLights[];
    (switched[0].lights![0] as { on: boolean }).on = true;
    await nextRead();
    http.expectOne('/home/light').flush(switched);
    await settled();
    expect(light(3).getAttribute('data-state')).toBe('on');
    expect(light(3).querySelector<HTMLButtonElement>('[data-testid="light-off"]')!.disabled).toBe(
      false,
    );

    vi.advanceTimersByTime(LIGHTS_READ_AGAIN_AFTER_MS);
    await nextRead();
    http.expectOne('/home/light').flush(switched);
  });

  it('switches a room off, and names the lights it could not switch', async () => {
    start();

    click(room('living room').querySelector('[data-testid="room-off"]'));
    const command = http.expectOne((call) => call.url === '/home/light/rooms/living%20room');
    expect(command.request.method).toBe('POST');
    expect(command.request.params.get('turn')).toBe('off');
    expect(command.request.params.get('source')).toBe('dashboard');
    command.flush(
      {
        room: 'living room',
        turn: 'off',
        switched: [{ id: 44, name: 'Living room hood' }],
        failed: [{ id: 45, name: 'Living room lamp', code: 'DEVICE_FAILED' }],
      },
      { status: 202, statusText: 'Accepted' },
    );
    await nextRead();
    http.expectOne('/home/light').flush(LIGHTS);
    await settled();

    expect(text(room('living room').querySelector('[data-testid="room-status"]'))).toBe(
      'error_outline Not switched: 1 - Living room lamp',
    );
  });

  it('tells a command that got no answer as one that may have been carried out', async () => {
    start();

    click(light(3).querySelector('[data-testid="light-on"]'));
    http.expectOne((call) => call.url === '/home/light/3').error(new ProgressEvent('error'));
    await nextRead();
    http.expectOne('/home/light').flush(LIGHTS);
    await settled();

    expect(text(room('office').querySelector('[data-testid="room-status"]'))).toBe(
      'error_outline Main: The light did not answer the command - it may have been carried out all the same.',
    );
  });

  it('tells a refusal with its code in words of our own', async () => {
    start();

    click(light(45).querySelector('[data-testid="light-off"]'));
    http
      .expectOne((call) => call.url === '/home/light/45')
      .flush(
        { errors: [{ message: 'Device failed', code: 'DEVICE_FAILED' }] },
        { status: 502, statusText: 'Bad Gateway' },
      );
    await nextRead();
    http.expectOne('/home/light').flush(LIGHTS);
    await settled();

    expect(text(room('living room').querySelector('[data-testid="room-status"]'))).toBe(
      'error_outline Lamp: The light did not take the command.',
    );
  });

  describe('the window of a room', () => {
    function open(name: string): void {
      click(room(name).querySelector('[data-testid="room-details"]'));
    }

    const windowLight = (id: number) =>
      dialog().querySelector<HTMLElement>(`[data-testid="window-light"][data-light="${id}"]`)!;

    it('lists what the engine did in the room in the last 24 hours, newest first, the lights by name', async () => {
      start();
      open('office');
      await nextRead();

      const runs = http.expectOne((call) => call.url === '/home/light/rooms/office/rules/runs');
      // the last 24 hours of the house, to the end of the running hour
      expect(runs.request.params.get('from')).toBe('2026-10-19T11:00:00');
      expect(runs.request.params.get('to')).toBe('2026-10-20T11:00:00');
      runs.flush([
        { deviceId: 40, action: 'off', reason: 'auto-off', at: '2026-10-20T07:00:00' },
        {
          deviceId: 3,
          action: 'off',
          reason: 'auto-off',
          error: 'DEVICE_FAILED',
          at: '2026-10-20T08:00:00',
        },
        { deviceId: 77, action: 'on', reason: 'something-new', at: '2026-10-20T06:00:00' },
      ]);
      await settled();

      expect([...dialog().querySelectorAll('[data-testid="run"]')].map(text)).toEqual([
        'Tue 08:00 Main · off · auto-off The light did not take the command.',
        'Tue 07:00 Desk lamp · off · auto-off',
        'Tue 06:00 #77 · on · something-new',
      ]);
    });

    it('shows the rule as stored and the sensors of the room', async () => {
      start();
      open('living room');
      await nextRead();
      http.expectOne((call) => call.url === '/home/light/rooms/living%20room/rules/runs').flush([]);
      fixture.detectChanges();

      const rule = dialog().querySelector('[data-testid="window-rule"]');
      expect(text(rule)).toContain('Auto-off off');
      expect(text(rule)).toContain(
        'Motion-on on by motion below 30 lx · off 3 min after the last motion',
      );
      expect(text(rule?.querySelector('[data-testid="period"]'))).toBe(
        '22:00 – 06:00 · 10 % · a colour',
      );
      expect(text(rule?.querySelector('[data-testid="window-rule-resident"]'))).toBe(
        'Switched off by the resident',
      );
      expect(text(dialog().querySelector('[data-testid="window-no-runs"]'))).toBe(
        'Nothing in the last 24 hours.',
      );
    });

    it('sets the brightness of a light that dims, and only of one', async () => {
      start();
      open('office');
      await nextRead();
      http.expectOne((call) => call.url.endsWith('/rules/runs')).flush([]);
      fixture.detectChanges();

      expect(windowLight(3).querySelector('[data-testid="set-brightness"]')).toBeNull();
      click(windowLight(40).querySelector('[data-testid="set-brightness"]'));
      const command = http.expectOne((call) => call.url === '/home/light/40/brightness');
      expect(command.request.params.get('value')).toBe('70');
      expect(command.request.params.get('source')).toBe('dashboard');
      command.flush(null, { status: 202, statusText: 'Accepted' });
      await nextRead();
      http.expectOne('/home/light').flush(LIGHTS);
      await settled();
    });

    it('holds the commands of its lights while a command for the whole room is on its way', async () => {
      start();
      click(room('office').querySelector('[data-testid="room-off"]'));
      const command = http.expectOne((call) => call.url === '/home/light/rooms/office');
      open('office');
      await nextRead();
      http.expectOne((call) => call.url.endsWith('/rules/runs')).flush([]);
      fixture.detectChanges();

      const on = () =>
        windowLight(3).querySelector<HTMLButtonElement>('[data-testid="window-light-on"]')!;
      expect(on().disabled).toBe(true);

      command.flush(
        { room: 'office', switched: [], failed: [] },
        { status: 202, statusText: 'Accepted' },
      );
      await nextRead();
      http.expectOne('/home/light').flush(LIGHTS);
      await settled();
      expect(on().disabled).toBe(false);
    });

    it('sends a colour with white only to a light that reported a white channel', async () => {
      start();
      open('living room');
      await nextRead();
      http.expectOne((call) => call.url.endsWith('/rules/runs')).flush([]);
      fixture.detectChanges();

      // the profile rgb: three sliders and no white
      expect(windowLight(44).querySelectorAll('[data-testid^="color-"]').length).toBe(3);
      click(windowLight(44).querySelector('[data-testid="set-color"]'));
      const rgb = http.expectOne((call) => call.url === '/home/light/44/color');
      expect(rgb.request.body).toEqual({ rgb: [0, 120, 255] });
      expect(rgb.request.params.get('source')).toBe('dashboard');
      rgb.flush(null, { status: 202, statusText: 'Accepted' });
      await nextRead();
      http.expectOne('/home/light').flush(LIGHTS);
      await settled();

      expect(windowLight(45).querySelectorAll('[data-testid^="color-"]').length).toBe(4);
      click(windowLight(45).querySelector('[data-testid="set-color"]'));
      const rgbw = http.expectOne((call) => call.url === '/home/light/45/color');
      expect(rgbw.request.body).toEqual({ rgb: [255, 140, 40], white: 10 });
      rgbw.flush(null, { status: 202, statusText: 'Accepted' });
      await nextRead();
      http.expectOne('/home/light').flush(LIGHTS);
      await settled();

      // a light nothing was heard of starts from white
      click(windowLight(41).querySelector('[data-testid="set-color"]'));
      expect(http.expectOne((call) => call.url === '/home/light/41/color').request.body).toEqual({
        rgb: [255, 255, 255],
      });
    });
  });
});
