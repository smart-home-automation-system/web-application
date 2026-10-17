import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { getDebugNode } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSelect } from '@angular/material/select';

import { provideI18nTesting } from '../../../testing/i18n';
import { SmartDevice } from '../../data-access/devices/device-registry-api';
import { Devices } from './devices';

const LIGHT: SmartDevice = {
  id: 3,
  name: 'Office main light',
  room: 'office',
  kind: 'light',
  enabled: true,
  vendor: 'shelly',
  shelly: {
    address: '192.0.2.23',
    generation: 3,
    deviceId: 'shelly1pmg3-0a0b0c0d0e02',
    channel: 0,
  },
  lightKind: 'relay',
};
const SENSOR: SmartDevice = {
  id: 4,
  name: 'Office temperature sensor 48',
  room: 'office',
  kind: 'temperature sensor',
  enabled: true,
  vendor: 'eaton',
  eaton: { gateway: 'blinds', point: 48 },
};
const BLINDS: SmartDevice = {
  id: 7,
  name: 'Living room terrace blinds',
  room: 'living room',
  kind: 'blinds',
  enabled: false,
  vendor: 'eaton',
  eaton: { gateway: 'blinds', point: 21 },
  placement: 'external',
  positioning: false,
};
// HAS-290: the window of the terrace blinds has two sensors, one of them in the registry
const WINDOW_SENSOR: SmartDevice = {
  id: 14,
  name: 'Terrace door sensor',
  room: 'living room',
  kind: 'opening sensor',
  enabled: true,
  vendor: 'shelly',
  bthome: { address: '7c:c6:b6:00:00:03' },
};
const KITCHEN_SENSOR: SmartDevice = {
  id: 9,
  name: 'Kitchen window sensor',
  room: 'kitchen',
  kind: 'opening sensor',
  enabled: true,
  vendor: 'shelly',
  bthome: { address: '7c:c6:b6:00:00:01' },
};

describe('Devices', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Devices>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        // the window of a room opens and closes at once
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Devices);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
  });

  function answerTheRegistryWith(answer: object | string | null): void {
    vi.advanceTimersByTime(1);
    http.expectOne({ method: 'GET', url: '/home/device/registry' }).flush(answer);
    fixture.detectChanges();
  }

  async function settled(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) {
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  const page = () => fixture.nativeElement as HTMLElement;
  const card = (room: string) => page().querySelector<HTMLElement>(`[data-room-card="${room}"]`)!;
  /** The window of a room opens over the page, outside the fixture. */
  const dialog = () => document.querySelector<HTMLElement>('mat-dialog-container');
  const row = (id: number) => document.querySelector<HTMLElement>(`[data-device="${id}"]`)!;
  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (within: HTMLElement, label: string) =>
    // a button starts with the name of its icon: the label is what follows it
    [...within.querySelectorAll('button')].find((one) => text(one).includes(label));

  /** Opens the window of a room with one of the two buttons of its card. */
  async function openRoom(room: string, how: 'Details' | 'Add' = 'Details'): Promise<HTMLElement> {
    TestBed.inject(MatDialog).closeAll();
    fixture.detectChanges();
    const icon = how === 'Add' ? 'add' : 'list';
    [...card(room).querySelectorAll('button')]
      .find((one) => text(one).startsWith(`${icon} ${how}`))!
      .click();
    await settled();
    return dialog()!;
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** The select of a form - Material's; the window is no child of the fixture. */
  function select(within: HTMLElement, testId: string): MatSelect {
    const host = within.querySelector(`[data-testid="${testId}"]`)!;
    return getDebugNode(host)!.injector.get(MatSelect);
  }

  /** What a select offers, by opening it. */
  function offered(within: HTMLElement, testId: string): unknown[] {
    const chosen = select(within, testId);
    chosen.open();
    fixture.detectChanges();
    const values = chosen.options.map((option) => option.value as unknown);
    chosen.close();
    fixture.detectChanges();
    return values;
  }

  /** Chooses as somebody would: opens the list and takes the option. */
  function choose(within: HTMLElement, testId: string, value: unknown): void {
    const chosen = select(within, testId);
    chosen.open();
    fixture.detectChanges();
    chosen.options.find((option) => option.value === value)!._selectViaInteraction();
    fixture.detectChanges();
  }

  describe('the rooms', () => {
    // HAS-290: every room of the house has a card, an empty one too - that is where a device is added
    it('stand floor by floor, every room of the house with its devices counted by kind', () => {
      answerTheRegistryWith([LIGHT, SENSOR, BLINDS]);

      expect(
        [...page().querySelectorAll('[data-floor]')].map((one) => one.getAttribute('data-floor')),
      ).toEqual(['ground', 'upper', 'circulation', 'attic', 'outside']);
      expect(text(page().querySelector('[data-floor="upper"] h2'))).toBe('Upper floor');
      expect(text(page().querySelector('[data-testid="registry"] [data-testid="count"]'))).toBe(
        'Devices: 3',
      );
      expect(text(card('office').querySelector('[data-testid="count"]'))).toBe('Devices: 2');
      expect(text(card('office').querySelector('[data-kind="light"]'))).toBe('Light 1');
      expect(text(card('office').querySelector('[data-kind="temperature sensor"]'))).toBe(
        'Temperature sensor 1',
      );
      // a kind the room has not is said too: every card says the same things
      expect(text(card('office').querySelector('[data-kind="presence sensor"]'))).toBe(
        'Presence sensor none',
      );
      expect(card('office').querySelectorAll('[data-kind]')).toHaveLength(8);
      expect(text(card('office').querySelector('[data-kind="other"]'))).toBe('Other none');
      expect(text(card('loft').querySelector('[data-testid="count"]'))).toBe('Devices: 0');
      // no device is listed on the page itself
      expect(page().querySelector('[data-testid="device"]')).toBeNull();
    });

    // the weather station, the Bluetooth gateways and a kind this version does not know
    it('count every kind a card does not list as other', () => {
      answerTheRegistryWith([
        { id: 21, name: 'Wind sensor', room: 'office', kind: 'wind sensor' },
        { id: 22, name: 'Office gateway', room: 'office', kind: 'bthome gateway' },
      ]);

      expect(text(card('office').querySelector('[data-kind="other"]'))).toBe('Other 2');
      expect(card('office').querySelector('[data-kind="bthome gateway"]')).toBeNull();
    });
  });

  it('shows the devices of a room in its window, with how each is reached', async () => {
    answerTheRegistryWith([LIGHT, SENSOR, BLINDS]);

    const office = await openRoom('office');

    expect(text(office.querySelector('[data-testid="floor"]'))).toBe('Upper floor');
    expect(office.querySelectorAll('[data-testid="device"]')).toHaveLength(2);
    expect(text(row(3).querySelector('[data-testid="kind"]'))).toBe('Light · switched');
    expect(text(row(3).querySelector('[data-testid="vendor"]'))).toBe('Shelly');
    expect(text(row(3).querySelector('[data-testid="generation"]'))).toBe('Gen 3');
    expect(text(row(3).querySelector('[data-testid="binding"]'))).toBe(
      '192.0.2.23 channel 0 shelly1pmg3-0a0b0c0d0e02',
    );
    expect(text(row(4).querySelector('[data-testid="binding"]'))).toBe('gateway blinds point 48');
    expect(row(4).querySelector('[data-testid="generation"]')).toBeNull();
    expect(row(3).querySelector('[data-testid="not-used"]')).toBeNull();

    await openRoom('living room');
    expect(text(row(7).querySelector('[data-testid="kind"]'))).toBe(
      'Blinds · outside the window · open or closed only',
    );
    expect(row(7).querySelector('[data-testid="not-used"]')).not.toBeNull();
  });

  // review of the redesign: a form open or a change on its way keeps the window open
  it('does not let the window close while a form is open in it', async () => {
    answerTheRegistryWith([LIGHT]);
    await openRoom('office');
    const ref = TestBed.inject(MatDialog).openDialogs[0];
    expect(ref.disableClose).toBe(false);

    button(row(3), 'Edit')!.click();
    await settled();
    expect(ref.disableClose).toBe(true);

    button(row(3), 'Cancel')!.click();
    await settled();
    expect(ref.disableClose).toBe(false);
  });

  // nothing is known of a room while the registry answers no list - it is not an empty room
  it('says in an open window that the registry did not answer, not that the room is empty', async () => {
    answerTheRegistryWith([LIGHT]);
    const office = await openRoom('office');

    vi.advanceTimersByTime(60_000);
    http.expectOne({ method: 'GET', url: '/home/device/registry' }).flush({ unexpected: true });
    await settled();

    expect(text(office.querySelector('[data-testid="unreadable"]'))).toBe(
      'The registry did not answer with its devices.',
    );
    expect(office.querySelector('[data-testid="no-devices"]')).toBeNull();
  });

  it('says in the window of an empty room that it has no device yet', async () => {
    answerTheRegistryWith([LIGHT]);

    const loft = await openRoom('loft');

    expect(text(loft.querySelector('[data-testid="no-devices"]'))).toBe(
      'No device in this room yet.',
    );
  });

  // nothing checks an answer: what it leaves out is told as not known, never made up
  it('claims nothing the answer does not say', async () => {
    answerTheRegistryWith([
      { id: 20, room: 'office' },
      { id: 21, name: 'Wind sensor', room: 'office', kind: 'wind sensor', vendor: 'acme' },
      // without an id a device cannot be addressed: no row with buttons for it
      { name: 'Nobody', room: 'office' },
    ]);
    // the entry without an id is counted, not dropped without a word
    expect(text(page().querySelector('[data-testid="skipped"]'))).toBe(
      'Entries of the registry without an id, not shown: 1',
    );

    const office = await openRoom('office');

    expect(office.querySelectorAll('[data-testid="device"]')).toHaveLength(2);
    expect(text(row(20).querySelector('[data-testid="name"]'))).toBe('No name');
    expect(text(row(20).querySelector('[data-testid="kind"]'))).toBe('Kind not given');
    expect(text(row(20).querySelector('[data-testid="binding"]'))).toBe(
      'The registry does not say how this device is reached.',
    );
    // a device without the field is not "switched off" - and not "on" either: it is said to be
    // not given, and no switch is offered that would need a state to switch from
    expect(row(20).querySelector('[data-testid="not-used"]')).toBeNull();
    expect(text(row(20).querySelector('[data-testid="use-unknown"]'))).toBe(
      'Use by the services not given',
    );
    expect(button(row(20), 'use')).toBeUndefined();
    // a kind and a vendor this version does not know are shown as they come
    expect(text(row(21).querySelector('[data-testid="kind"]'))).toBe('wind sensor');
    expect(text(row(21).querySelector('[data-testid="vendor"]'))).toBe('acme');
  });

  // nothing checks an answer, and only a number of our own reading is a translation parameter:
  // a text with a placeholder of its own in it would otherwise never come back
  it('prints a channel, a point or a generation that is no number as it came', async () => {
    answerTheRegistryWith([
      {
        id: 30,
        name: 'Odd Shelly',
        room: 'office',
        kind: 'light',
        vendor: 'shelly',
        shelly: { address: '192.0.2.70', generation: '{{ generation }}', channel: '{{ channel }}' },
      },
      {
        id: 31,
        name: 'Odd Eaton',
        room: 'office',
        kind: 'light',
        vendor: 'eaton',
        eaton: { gateway: 'lights', point: '{{ point }}' },
      },
    ]);
    await openRoom('office');

    expect(text(row(30).querySelector('[data-testid="generation"]'))).toBe('{{ generation }}');
    expect(text(row(30).querySelector('[data-testid="binding"]'))).toBe('192.0.2.70 {{ channel }}');
    expect(text(row(31).querySelector('[data-testid="binding"]'))).toBe(
      'gateway lights {{ point }}',
    );
  });

  // a change made from another row would close the form with what was typed into it, or put
  // its failure into a form that never made it
  it('lets nothing else of a room be pressed while a form or a question is open in it', async () => {
    answerTheRegistryWith([LIGHT, SENSOR, BLINDS]);
    await openRoom('office');

    button(row(3), 'Edit')!.click();
    fixture.detectChanges();

    expect(button(row(4), 'Take out of use')!.disabled).toBe(true);
    expect(button(row(4), 'Edit')!.disabled).toBe(true);
    expect(button(row(4), 'Remove')!.disabled).toBe(true);
  });

  // the registry is what the AMX system is answered from: said in the form, before it is saved
  it('says in the form of an Eaton device what a change of it does to the house', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    await openRoom('office');

    button(row(4), 'Edit')!.click();
    fixture.detectChanges();
    expect(text(row(4).querySelector('[data-testid="eaton-note"]'))).toContain(
      'The AMX system reads this device for every datagram of its point',
    );

    button(row(4), 'Cancel')!.click();
    fixture.detectChanges();
    button(row(3), 'Edit')!.click();
    fixture.detectChanges();
    expect(row(3).querySelector('[data-testid="eaton-note"]')).toBeNull();
  });

  // "Add" of a card opens the window with the form open, in that room - known here or not
  it('opens the form of a new device in the room of the card, known here or not', async () => {
    answerTheRegistryWith([{ ...LIGHT, room: 'winter garden' }]);

    const room = await openRoom('winter garden', 'Add');
    // a select shows what it holds a turn after it was given it
    await settled();

    expect(room.querySelector('app-smart-device-form')).not.toBeNull();
    expect(select(room, 'room').value).toBe('winter garden');
    expect(offered(room, 'room')).toContain('winter garden');
    expect(text(room.querySelector('[data-testid="room"]'))).toBe('winter garden');
  });

  // "Details" opens the list; its own "Add" opens the form below it
  it('opens the form of a new device from the window of a room too', async () => {
    answerTheRegistryWith([LIGHT]);

    const office = await openRoom('office');
    expect(office.querySelector('app-smart-device-form')).toBeNull();

    button(office, 'Add a device here')!.click();
    await settled();
    expect(office.querySelector('app-smart-device-form')).not.toBeNull();
  });

  it('says so when the registry is empty, and still offers every room to add a device to', () => {
    answerTheRegistryWith([]);
    expect(text(page().querySelector('[data-testid="registry"] [data-testid="count"]'))).toBe(
      'No device is registered yet.',
    );
    expect(card('office')).not.toBeNull();
  });

  it('says so when the answer of the registry is not a list of devices', () => {
    answerTheRegistryWith({ unexpected: true });

    expect(text(page().querySelector('[data-testid="registry"]'))).toContain(
      'The registry did not answer with its devices.',
    );
    expect(page().querySelector('[data-room-card]')).toBeNull();
  });

  it('registers a device: one call with the whole of it, then the registry read again', async () => {
    answerTheRegistryWith([LIGHT]);
    const office = await openRoom('office', 'Add');
    const form = office.querySelector<HTMLElement>('app-smart-device-form')!;

    type(form.querySelector<HTMLInputElement>('input')!, 'Office desk lamp');
    choose(form, 'kind', 'temperature sensor');
    // a sensor may be reached any of the three ways
    expect(
      [...form.querySelectorAll('[data-testid="binding"] button')].map((one) => text(one)),
    ).toEqual(['Shelly on the network', 'Eaton, through the AMX system', 'Bluetooth']);
    form.querySelectorAll<HTMLElement>('[data-testid="binding"] button')[1].click();
    fixture.detectChanges();
    const point = [...form.querySelectorAll<HTMLInputElement>('input')].at(-1)!;

    // nobody has point 48 yet: nothing stands in the way
    type(point, '48');
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(form.querySelector('[data-testid="binding-taken"]')).toBeNull();
    await settled();
    const request = http.expectOne({ method: 'POST', url: '/home/device/registry' });
    expect(request.request.body).toEqual({
      name: 'Office desk lamp',
      room: 'office',
      kind: 'temperature sensor',
      enabled: true,
      vendor: 'eaton',
      eaton: { gateway: 'blinds', point: 48 },
    });
    request.flush({});
    await settled();
    answerTheRegistryWith([LIGHT, SENSOR]);
    await settled();

    // the form is gone, the device is in the window of its room and counted on its card
    expect(office.querySelector('app-smart-device-form')).toBeNull();
    expect(row(4)).not.toBeNull();
    expect(text(card('office').querySelector('[data-testid="count"]'))).toBe('Devices: 2');
  });

  it('does not send a device whose binding another one has, and says which', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    const office = await openRoom('office', 'Add');
    const form = office.querySelector<HTMLElement>('app-smart-device-form')!;

    type(form.querySelector<HTMLInputElement>('input')!, 'Second sensor');
    choose(form, 'kind', 'temperature sensor');
    form.querySelectorAll<HTMLElement>('[data-testid="binding"] button')[1].click();
    fixture.detectChanges();
    type([...form.querySelectorAll<HTMLInputElement>('input')].at(-1)!, '48');
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(text(form.querySelector('[data-testid="binding-taken"]'))).toBe(
      'Another device already has this point of the gateway.',
    );
    // http.verify() in afterEach: no call was made
  });

  // every write stores the whole row: a call for nothing is a risk for nothing
  it('makes no call for a form nothing was changed in', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    await openRoom('office');
    button(row(3), 'Edit')!.click();
    fixture.detectChanges();
    const form = row(3).querySelector<HTMLElement>('app-smart-device-form')!;
    // the registry refuses another kind for a device it has
    expect(select(form, 'kind').disabled).toBe(true);

    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(row(3).querySelector('app-smart-device-form')).toBeNull();
  });

  it('replaces a device with the whole form, and the device leaves the window of its old room', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    const office = await openRoom('office');
    button(row(3), 'Edit')!.click();
    fixture.detectChanges();
    const form = row(3).querySelector<HTMLElement>('app-smart-device-form')!;

    choose(form, 'room', 'bedroom');
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await settled();

    const request = http.expectOne({ method: 'PUT', url: '/home/device/registry/3' });
    expect(request.request.body).toEqual({
      name: 'Office main light',
      room: 'bedroom',
      kind: 'light',
      enabled: true,
      vendor: 'shelly',
      shelly: {
        address: '192.0.2.23',
        generation: 3,
        deviceId: 'shelly1pmg3-0a0b0c0d0e02',
        channel: 0,
      },
      lightKind: 'relay',
    });
    request.flush({});
    await settled();
    answerTheRegistryWith([{ ...LIGHT, room: 'bedroom' }, SENSOR]);
    await settled();

    // the window follows the registry: the device left the room it was changed in
    expect(office.querySelector('[data-device="3"]')).toBeNull();
    expect(text(card('bedroom').querySelector('[data-kind="light"]'))).toBe('Light 1');
    expect(text(card('office').querySelector('[data-kind="light"]'))).toBe('Light none');
  });

  it('switches a device off with the operation made for it, and shows what the registry says', async () => {
    answerTheRegistryWith([LIGHT]);
    await openRoom('office');

    button(row(3), 'Take out of use')!.click();
    await settled();
    http.expectOne({ method: 'POST', url: '/home/device/registry/3/disable' }).flush({});
    await settled();
    // not optimistic: until the registry is read again the device is as it was
    expect(row(3).querySelector('[data-testid="not-used"]')).toBeNull();
    answerTheRegistryWith([{ ...LIGHT, enabled: false }]);
    await settled();

    expect(row(3).querySelector('[data-testid="not-used"]')).not.toBeNull();
    expect(button(row(3), 'Let the services use')).toBeDefined();
  });

  it('asks before removing a device, and warns about a point of the AMX system', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    await openRoom('office');

    button(row(4), 'Remove')!.click();
    await settled();
    const question = row(4).querySelector<HTMLElement>('[role="group"]')!;
    expect(text(question)).toContain('Remove this device from the registry?');
    expect(question.querySelector('[data-testid="eaton-warning"]')).not.toBeNull();

    button(question, 'Remove')!.click();
    await settled();
    http.expectOne({ method: 'DELETE', url: '/home/device/registry/4' }).flush(null);
    await settled();
    answerTheRegistryWith([LIGHT]);
    await settled();

    expect(document.querySelector('[data-device="4"]')).toBeNull();
  });

  // HAS-290
  describe('the window sensors of blinds', () => {
    it('shows the sensors of a window by their names, and an id the registry does not hold as an id', async () => {
      answerTheRegistryWith([{ ...BLINDS, openingSensors: [14, 99] }, WINDOW_SENSOR]);
      await openRoom('living room');

      expect(text(row(7).querySelector('[data-testid="opening-sensors"]'))).toBe(
        'Window sensors: Terrace door sensor, Device 99 (not in the registry)',
      );
      expect(row(14).querySelector('[data-testid="opening-sensors"]')).toBeNull();
    });

    it('offers the opening sensors of the registry and sends the ones chosen', async () => {
      answerTheRegistryWith([BLINDS, WINDOW_SENSOR, KITCHEN_SENSOR, LIGHT]);
      await openRoom('living room');
      button(row(7), 'Edit')!.click();
      fixture.detectChanges();
      const form = row(7).querySelector<HTMLElement>('app-smart-device-form')!;

      // in the order of the rooms of the registry, then by name; never a device of another kind
      const order = offered(form, 'opening-sensors');
      expect([...order].sort()).toEqual([14, 9].sort());
      choose(form, 'opening-sensors', 14);
      choose(form, 'opening-sensors', 9);
      form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
      await settled();

      const request = http.expectOne({ method: 'PUT', url: '/home/device/registry/7' });
      expect(request.request.body).toHaveProperty('openingSensors', order);
      request.flush({});
      await settled();
      answerTheRegistryWith([BLINDS, WINDOW_SENSOR, KITCHEN_SENSOR, LIGHT]);
    });

    it('keeps an id the blinds hold that is no sensor of the registry', async () => {
      answerTheRegistryWith([{ ...BLINDS, openingSensors: [99] }, WINDOW_SENSOR]);
      await openRoom('living room');
      button(row(7), 'Edit')!.click();
      fixture.detectChanges();
      const form = row(7).querySelector<HTMLElement>('app-smart-device-form')!;

      expect(offered(form, 'opening-sensors')).toEqual([14, 99]);
      expect(select(form, 'opening-sensors').value).toEqual([99]);
    });

    it('does not offer to remove a sensor blinds still name, and says which', async () => {
      answerTheRegistryWith([{ ...BLINDS, openingSensors: [14] }, WINDOW_SENSOR]);
      await openRoom('living room');

      button(row(14), 'Remove')!.click();
      await settled();
      const question = row(14).querySelector<HTMLElement>('[role="group"]')!;

      expect(text(question.querySelector('[data-testid="sensor-in-use"]'))).toContain(
        'Living room terrace blinds',
      );
      expect(button(question, 'Remove')!.disabled).toBe(true);
    });
  });

  it('does not warn about the AMX system for a device it does not ask for', async () => {
    answerTheRegistryWith([LIGHT]);
    await openRoom('office');

    button(row(3), 'Remove')!.click();
    await settled();

    expect(row(3).querySelector('[data-testid="eaton-warning"]')).toBeNull();
    button(row(3).querySelector<HTMLElement>('[role="group"]')!, 'Cancel')!.click();
    fixture.detectChanges();
    expect(row(3).querySelector('[role="group"]')).toBeNull();
  });

  // the registry is read again all the same, and the device stays as the registry has it
  it('tells a refusal next to the device, in the words of the interface', async () => {
    answerTheRegistryWith([LIGHT]);
    const office = await openRoom('office');

    button(row(3), 'Take out of use')!.click();
    await settled();
    http
      .expectOne({ method: 'POST', url: '/home/device/registry/3/disable' })
      .flush(
        { errors: [{ code: 'NOT_FOUND_DEVICE', message: 'Device not found' }] },
        { status: 404, statusText: 'Not Found' },
      );
    await settled();
    answerTheRegistryWith([LIGHT]);
    await settled();

    const failure = office.querySelector('[data-testid="change-failure"]');
    expect(text(failure)).toContain('The change was not carried out.');
    expect(text(failure)).toContain('This device is no longer in the registry.');
    expect(row(3).querySelector('[data-testid="not-used"]')).toBeNull();
  });

  // one change at a time: every write stores a whole row
  it('offers no second change while one is under way', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    await openRoom('office');

    button(row(3), 'Take out of use')!.click();
    await settled();

    expect(button(row(4), 'Edit')!.disabled).toBe(true);
    expect(button(row(4), 'Remove')!.disabled).toBe(true);
    expect(button(card('loft'), 'Add')!.disabled).toBe(true);

    http.expectOne({ method: 'POST', url: '/home/device/registry/3/disable' }).flush({});
    await settled();
    answerTheRegistryWith([LIGHT, SENSOR]);
    await settled();
    expect(button(row(4), 'Edit')!.disabled).toBe(false);
  });
});
