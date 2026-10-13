import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
  shelly: { address: '192.0.2.23', generation: 3, deviceId: 'shelly1pmg3-0a0b0c0d0e02', channel: 0 },
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

describe('Devices', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Devices>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideI18nTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Devices);
    fixture.detectChanges();
  });

  afterEach(() => {
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
  const row = (id: number) => page().querySelector<HTMLElement>(`[data-device="${id}"]`)!;
  const roomCard = (name: string) => page().querySelector<HTMLElement>(`[data-room="${name}"]`)!;
  const text = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const button = (within: HTMLElement, label: string) =>
    // a button starts with the name of its icon: the label is what follows it
    [...within.querySelectorAll('button')].find((one) => text(one).includes(label));

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** The select of a form - Material's, whose list opens in an overlay outside the fixture. */
  function select(within: HTMLElement, testId: string): MatSelect {
    const host = within.querySelector(`[data-testid="${testId}"]`);
    return fixture.debugElement.query((one) => one.nativeElement === host).injector.get(MatSelect);
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
  function choose(within: HTMLElement, testId: string, value: string): void {
    const chosen = select(within, testId);
    chosen.open();
    fixture.detectChanges();
    chosen.options.find((option) => option.value === value)!._selectViaInteraction();
    fixture.detectChanges();
  }

  it('shows every device the registry holds, in its room, with how it is reached', () => {
    answerTheRegistryWith([LIGHT, SENSOR, BLINDS]);

    expect(
      [...page().querySelectorAll('[data-room]')].map((one) => one.getAttribute('data-room')),
    ).toEqual(['living room', 'office']);
    expect(text(page().querySelector('[data-testid="count"]'))).toBe('Devices: 3');
    expect(text(roomCard('office').querySelector('[data-testid="floor"]'))).toBe('Upper floor');

    expect(text(row(3).querySelector('[data-testid="kind"]'))).toBe('Light · switched');
    expect(text(row(3).querySelector('[data-testid="vendor"]'))).toBe('Shelly');
    expect(text(row(3).querySelector('[data-testid="generation"]'))).toBe('Gen 3');
    expect(text(row(3).querySelector('[data-testid="binding"]'))).toBe(
      '192.0.2.23 channel 0 shelly1pmg3-0a0b0c0d0e02',
    );
    expect(text(row(4).querySelector('[data-testid="binding"]'))).toBe('gateway blinds point 48');
    expect(row(4).querySelector('[data-testid="generation"]')).toBeNull();
    expect(text(row(7).querySelector('[data-testid="kind"]'))).toBe(
      'Blinds · outside the window · open or closed only',
    );
    expect(row(7).querySelector('[data-testid="not-used"]')).not.toBeNull();
    expect(row(3).querySelector('[data-testid="not-used"]')).toBeNull();
  });

  // nothing checks an answer: what it leaves out is told as not known, never made up
  it('claims nothing the answer does not say', () => {
    answerTheRegistryWith([
      { id: 20, room: 'office' },
      { id: 21, name: 'Wind sensor', room: 'office', kind: 'wind sensor', vendor: 'acme' },
      // without an id a device cannot be addressed: no row with buttons for it
      { name: 'Nobody', room: 'office' },
    ]);

    expect(page().querySelectorAll('[data-testid="device"]')).toHaveLength(2);
    expect(text(row(20).querySelector('[data-testid="name"]'))).toBe('No name');
    expect(text(row(20).querySelector('[data-testid="kind"]'))).toBe('Kind not given');
    expect(text(row(20).querySelector('[data-testid="binding"]'))).toBe(
      'The registry does not say how this device is reached.',
    );
    // a device without the field is not "switched off" - and not "on" either: it is said to be
    // not given, and no switch is offered that would need a state to switch from
    expect(row(20).querySelector('[data-testid="not-used"]')).toBeNull();
    expect(text(row(20).querySelector('[data-testid="use-unknown"]'))).toBe('Use by the services not given');
    expect(button(row(20), 'use')).toBeUndefined();
    // the entry without an id is counted, not dropped without a word
    expect(text(page().querySelector('[data-testid="skipped"]'))).toBe(
      'Entries of the registry without an id, not shown: 1',
    );
    // a kind and a vendor this version does not know are shown as they come
    expect(text(row(21).querySelector('[data-testid="kind"]'))).toBe('wind sensor');
    expect(text(row(21).querySelector('[data-testid="vendor"]'))).toBe('acme');
  });

  // nothing checks an answer, and only a number of our own reading is a translation parameter:
  // a text with a placeholder of its own in it would otherwise never come back
  it('prints a channel, a point or a generation that is no number as it came', () => {
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

    expect(text(row(30).querySelector('[data-testid="generation"]'))).toBe('{{ generation }}');
    expect(text(row(30).querySelector('[data-testid="binding"]'))).toBe('192.0.2.70 {{ channel }}');
    expect(text(row(31).querySelector('[data-testid="binding"]'))).toBe('gateway lights {{ point }}');
  });

  // a change made from another row would close the form with what was typed into it, or put
  // its failure into a form that never made it
  it('lets nothing else of a card be pressed while a form or a question is open in it', () => {
    answerTheRegistryWith([LIGHT, SENSOR, BLINDS]);

    button(row(3), 'Edit')!.click();
    fixture.detectChanges();

    expect(button(row(4), 'Take out of use')!.disabled).toBe(true);
    expect(button(row(4), 'Edit')!.disabled).toBe(true);
    expect(button(row(4), 'Remove')!.disabled).toBe(true);
    // another card is another matter
    expect(button(row(7), 'Let the services use')!.disabled).toBe(false);
  });

  // the registry is what the AMX system is answered from: said in the form, before it is saved
  it('says in the form of an Eaton device what a change of it does to the house', () => {
    answerTheRegistryWith([LIGHT, SENSOR]);

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

  // the card of a room this version does not know still offers that room, and shows it
  it('offers the room of the card a device is added from, known here or not', async () => {
    answerTheRegistryWith([{ ...LIGHT, room: 'winter garden' }]);

    button(roomCard('winter garden'), 'Add a device here')!.click();
    // a select shows what it holds a turn after it was given it
    await settled();

    expect(select(roomCard('winter garden'), 'room').value).toBe('winter garden');
    expect(offered(roomCard('winter garden'), 'room')).toContain('winter garden');
    // and it is what the field shows, not an empty one
    expect(text(roomCard('winter garden').querySelector('[data-testid="room"]'))).toBe('winter garden');
  });

  it('says so when the registry is empty, and when its answer is no list', () => {
    answerTheRegistryWith([]);
    expect(text(page().querySelector('[data-testid="count"]'))).toBe('No device is registered yet.');
    expect(page().querySelectorAll('[data-room]')).toHaveLength(0);
  });

  it('says so when the answer of the registry is not a list of devices', () => {
    answerTheRegistryWith({ unexpected: true });

    expect(text(page().querySelector('[data-testid="registry"]'))).toContain(
      'The registry did not answer with its devices.',
    );
    expect(button(page(), 'Add a device')).toBeUndefined();
  });

  it('registers a device: one call with the whole of it, then the registry read again', async () => {
    answerTheRegistryWith([LIGHT]);
    const registry = page().querySelector<HTMLElement>('[data-testid="registry"]')!;
    button(registry, 'Add a device')!.click();
    fixture.detectChanges();

    type(registry.querySelector<HTMLInputElement>('input')!, 'Office desk lamp');
    choose(registry, 'room', 'office');
    choose(registry, 'kind', 'temperature sensor');
    // a sensor may be reached any of the three ways
    expect(
      [...registry.querySelectorAll('[data-testid="binding"] button')].map((one) => text(one)),
    ).toEqual(['Shelly on the network', 'Eaton, through the AMX system', 'Bluetooth']);
    registry.querySelectorAll<HTMLElement>('[data-testid="binding"] button')[1].click();
    fixture.detectChanges();
    const point = [...registry.querySelectorAll<HTMLInputElement>('input')].at(-1)!;

    // nobody has point 48 yet: nothing stands in the way
    type(point, '48');
    registry.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();
    expect(registry.querySelector('[data-testid="binding-taken"]')).toBeNull();
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

    // the form is gone, and the device is on its card
    expect(registry.querySelector('app-smart-device-form')).toBeNull();
    expect(row(4)).not.toBeNull();
  });

  it('does not send a device whose binding another one has, and says which', () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    const registry = page().querySelector<HTMLElement>('[data-testid="registry"]')!;
    button(registry, 'Add a device')!.click();
    fixture.detectChanges();

    type(registry.querySelector<HTMLInputElement>('input')!, 'Second sensor');
    choose(registry, 'room', 'office');
    choose(registry, 'kind', 'temperature sensor');
    registry.querySelectorAll<HTMLElement>('[data-testid="binding"] button')[1].click();
    fixture.detectChanges();
    type([...registry.querySelectorAll<HTMLInputElement>('input')].at(-1)!, '48');
    registry.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(text(registry.querySelector('[data-testid="binding-taken"]'))).toBe(
      'Another device already has this point of the gateway.',
    );
    // http.verify() in afterEach: no call was made
  });

  // every write stores the whole row: a call for nothing is a risk for nothing
  it('makes no call for a form nothing was changed in', () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
    button(row(3), 'Edit')!.click();
    fixture.detectChanges();
    const form = row(3).querySelector<HTMLElement>('app-smart-device-form')!;
    // the registry refuses another kind for a device it has
    expect(select(form, 'kind').disabled).toBe(true);

    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    fixture.detectChanges();

    expect(row(3).querySelector('app-smart-device-form')).toBeNull();
  });

  it('replaces a device with the whole form, and shows it where the registry then has it', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);
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

    // the device left the card it was changed in: nothing of that card speaks up afterwards
    expect(roomCard('bedroom').querySelector('[data-device="3"]')).not.toBeNull();
    expect(roomCard('office').querySelector('[data-device="3"]')).toBeNull();
  });

  it('switches a device off with the operation made for it, and shows what the registry says', async () => {
    answerTheRegistryWith([LIGHT]);

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

    expect(page().querySelector('[data-device="4"]')).toBeNull();
  });

  it('does not warn about the AMX system for a device it does not ask for', async () => {
    answerTheRegistryWith([LIGHT]);

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

    const failure = roomCard('office').querySelector('[data-testid="change-failure"]');
    expect(text(failure)).toContain('The change was not carried out.');
    expect(text(failure)).toContain('This device is no longer in the registry.');
    expect(row(3).querySelector('[data-testid="not-used"]')).toBeNull();
  });

  // one change at a time: every write stores a whole row
  it('offers no second change while one is under way', async () => {
    answerTheRegistryWith([LIGHT, SENSOR]);

    button(row(3), 'Take out of use')!.click();
    await settled();

    expect(button(row(4), 'Edit')!.disabled).toBe(true);
    expect(button(row(4), 'Remove')!.disabled).toBe(true);
    expect(button(page(), 'Add a device')!.disabled).toBe(true);

    http.expectOne({ method: 'POST', url: '/home/device/registry/3/disable' }).flush({});
    await settled();
    answerTheRegistryWith([LIGHT, SENSOR]);
    await settled();
    expect(button(row(4), 'Edit')!.disabled).toBe(false);
  });
});
