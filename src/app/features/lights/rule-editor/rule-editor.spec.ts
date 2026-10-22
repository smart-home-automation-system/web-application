import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { MockInstance } from 'vitest';

import { provideI18nTesting } from '../../../../testing/i18n';
import { SmartDevice } from '../../../data-access/devices/device-registry-api';
import { RoomRule } from '../../../data-access/light/light-api';
import { RuleEditor } from './rule-editor';

/** The office as the registry has it: a relay, a dimmer, an rgbw strip, a presence and a motion sensor. */
const OFFICE: readonly SmartDevice[] = [
  {
    id: 3,
    name: 'Office main light',
    room: 'office',
    kind: 'light',
    vendor: 'shelly',
    lightKind: 'relay',
  },
  {
    id: 40,
    name: 'Office desk lamp',
    room: 'office',
    kind: 'light',
    vendor: 'eaton',
    lightKind: 'dimmer',
  },
  {
    id: 41,
    name: 'Office strip',
    room: 'office',
    kind: 'light',
    vendor: 'shelly',
    lightKind: 'rgbw',
  },
  { id: 50, name: 'Office presence', room: 'office', kind: 'presence sensor', vendor: 'shelly' },
  { id: 51, name: 'Office motion sensor', room: 'office', kind: 'motion sensor', vendor: 'shelly' },
  {
    id: 4,
    name: 'Office temperature sensor',
    room: 'office',
    kind: 'temperature sensor',
    vendor: 'eaton',
  },
];

/** A hall on an Eaton PIR only: its lights stay with NetLinx. */
const HALL: readonly SmartDevice[] = [
  {
    id: 46,
    name: 'Hall down ceiling',
    room: 'hall down',
    kind: 'light',
    vendor: 'eaton',
    lightKind: 'relay',
  },
  { id: 54, name: 'Hall down PIR', room: 'hall down', kind: 'motion sensor', vendor: 'eaton' },
];

const STORED: RoomRule = {
  room: 'office',
  autoOffEnabled: true,
  autoOffDelayMinutes: 15,
  motionOnEnabled: true,
  onlyBelowLux: 30,
  motionOffAfterMinutes: 3,
  periods: [
    { from: '16:00', to: '22:00', brightness: 80 },
    { from: '22:00', to: '06:00', brightness: 10, rgb: [255, 120, 0] },
  ],
  manualHoldMinutes: 60,
  enabledByResident: true,
  updatedAt: '2026-10-19T08:00:00',
};

const NO_RULE = { errors: [{ message: 'Room rule not found', code: 'NOT_FOUND_RULE' }] };
const NOT_FOUND = { status: 404, statusText: 'Not Found' };

// HAS-267: the editor of the rule of a room, against the calls of light-service and the registry
describe('RuleEditor', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<RuleEditor>;
  let navigate: MockInstance<Router['navigate']>;

  const element = () => fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => element().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const allByTestId = (id: string) => [
    ...element().querySelectorAll<HTMLInputElement>(`[data-testid="${id}"]`),
  ];
  const said = () => element().textContent?.replace(/\s+/g, ' ');
  const texts = (selector: string) =>
    [...element().querySelectorAll(selector)].map((one) => one.textContent?.trim());
  const input = (id: string) => byTestId(id) as HTMLInputElement;

  function type(field: HTMLInputElement | null, value: string): void {
    field!.value = value;
    field!.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function toggle(id: string): void {
    byTestId(id)!.querySelector('button')!.click();
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
  }

  const ruleRead = (room = 'office') =>
    http.expectOne(
      (call) =>
        call.method === 'GET' && call.url === `/home/light/rooms/${encodeURIComponent(room)}/rules`,
    );

  async function open(
    room: string,
    rule: RoomRule | 'none',
    devices: readonly SmartDevice[] = OFFICE,
  ): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ room }) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(RuleEditor);
    fixture.detectChanges();
    await settle();
    const read = ruleRead(room);
    if (rule === 'none') {
      read.flush(NO_RULE, NOT_FOUND);
    } else {
      read.flush(rule);
    }
    const registry = http.expectOne((call) => call.url === '/home/device/registry');
    expect(registry.request.params.get('room')).toBe(room);
    registry.flush(devices);
    await settle();
    http.expectOne((call) => call.url.endsWith('/rules/runs')).flush([]);
    await settle();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'));
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  describe('a room without a rule', () => {
    beforeEach(() => open('office', 'none'));

    it('says so, and shows what the rule can rely on as the registry has it', () => {
      // the icon is a ligature: its name is the first word of the text
      const lights = texts('[data-testid="rule-light"]').map((one) =>
        one?.replace(/^lightbulb/, '').replace(/\s+/g, ' '),
      );
      expect(lights).toEqual([
        'Office desk lamp · dims',
        'Office main light · switches on and off',
        'Office strip · dims and takes a colour',
      ]);
      // the temperature sensor is no sensor of the rules
      expect(allByTestId('rule-sensor')).toHaveLength(2);
      expect(byTestId('room-blocked')).toBeNull();
      // nothing to remove, no switch of a resident before there is a rule
      expect(byTestId('rule-remove')).toBeNull();
      expect(byTestId('rule-resident')).toBeNull();
    });

    it('sends nothing while a rule of the service is broken, and says which', async () => {
      toggle('motion-on-enabled');
      await settle();
      byTestId('rule-save')!.click();
      await settle();

      expect(texts('mat-error')).toEqual(['Enter the minutes.', 'Enter the minutes.']);
      expect(byTestId('periods-missing')?.textContent).toContain('Motion-on needs a period');

      byTestId('period-add')!.click();
      byTestId('period-add')!.click();
      await settle();
      const [first, second] = [allByTestId('period-from'), allByTestId('period-to')];
      type(first[0], '20:00');
      type(second[0], '06:00');
      type(first[1], '05:00');
      type(second[1], '07:00');
      byTestId('rule-save')!.click();
      await settle();

      expect(byTestId('periods-overlap')?.textContent).toContain('Periods 1 and 2 overlap.');
      expect(byTestId('periods-missing')).toBeNull();
      // nothing was sent: verify() finds no request
    });

    it('writes the rule whole, reads it back and fills the form from what was stored', async () => {
      toggle('auto-off-enabled');
      await settle();
      type(input('auto-off-delay'), ' 20 ');
      type(input('manual-hold'), '45');
      // a delay of a rule that is off is kept when it is given
      type(input('motion-off-after'), '5');
      byTestId('period-add')!.click();
      await settle();
      type(allByTestId('period-from')[0], '18:00');
      type(allByTestId('period-to')[0], '23:00');
      type(allByTestId('period-brightness')[0], '70');
      byTestId('period-color-on')!.querySelector('input')!.click();
      await settle();
      byTestId('rule-save')!.click();
      await settle();

      const write = http.expectOne((call) => call.method === 'PUT');
      expect(write.request.url).toBe('/home/light/rooms/office/rules');
      expect(write.request.body).toEqual({
        autoOffEnabled: true,
        autoOffDelayMinutes: 20,
        motionOnEnabled: false,
        motionOffAfterMinutes: 5,
        periods: [{ from: '18:00', to: '23:00', brightness: 70, rgb: [255, 180, 110] }],
        manualHoldMinutes: 45,
      });
      write.flush({ ...write.request.body, room: 'office', enabledByResident: true });
      await settle();
      // the answer of the write is not used: the rule is read again
      ruleRead().flush({ ...STORED, autoOffDelayMinutes: 20, manualHoldMinutes: 45 });
      await settle();

      expect(byTestId('rule-saved')?.textContent).toContain('Saved');
      expect(input('auto-off-delay').value).toBe('20');
      expect(allByTestId('period-row')).toHaveLength(2);
      expect(byTestId('rule-remove')).not.toBeNull();
    });
  });

  it('refuses a brightness the room cannot take before anything is sent', async () => {
    await open('office', 'none', [OFFICE[0], OFFICE[3], OFFICE[4]]);
    toggle('motion-on-enabled');
    await settle();
    type(input('motion-off-after'), '3');
    type(input('manual-hold'), '30');
    byTestId('period-add')!.click();
    await settle();
    type(allByTestId('period-from')[0], '18:00');
    type(allByTestId('period-to')[0], '23:00');
    type(allByTestId('period-brightness')[0], '40');
    // a room without an rgbw light is offered no colour
    expect(byTestId('period-color-on')).toBeNull();
    byTestId('rule-save')!.click();
    await settle();

    expect(byTestId('room-problem')?.textContent).toContain(
      'A brightness needs a light that dims in the room.',
    );
  });

  // the halls on Eaton PIRs stay with NetLinx (owner, HAS-262)
  it('tells a room on Eaton PIRs only that it gets no rule, and sends nothing', async () => {
    await open('hall down', 'none', HALL);

    expect(byTestId('room-blocked')?.textContent).toContain('Eaton PIR sensors only');
    expect(byTestId('rule-sensor')?.dataset['eaton']).toBe('true');
    type(input('manual-hold'), '30');
    byTestId('rule-save')!.click();
    await settle();
    // nothing was sent: verify() finds no request
  });

  describe('a stored rule', () => {
    beforeEach(() => open('office', STORED));

    it('fills the form from the service', () => {
      expect(byTestId('rule-stored')?.textContent).toContain('Written');
      expect(
        byTestId('auto-off-enabled')?.querySelector('button')?.getAttribute('aria-checked'),
      ).toBe('true');
      expect(input('auto-off-delay').value).toBe('15');
      expect(input('only-below-lux').value).toBe('30');
      expect(input('motion-off-after').value).toBe('3');
      expect(input('manual-hold').value).toBe('60');
      expect(allByTestId('period-from').map((one) => one.value)).toEqual(['16:00', '22:00']);
      expect(allByTestId('period-brightness').map((one) => one.value)).toEqual(['80', '10']);
      expect((allByTestId('period-color')[0] as HTMLInputElement).value).toBe('#ff7800');
    });

    it('keeps the form as entered when the service refuses the rule', async () => {
      type(input('manual-hold'), '90');
      byTestId('rule-save')!.click();
      await settle();

      http
        .expectOne((call) => call.method === 'PUT')
        .flush(
          { errors: [{ message: 'Invalid room rule', code: 'INVALID_RULE' }] },
          { status: 400, statusText: 'Bad Request' },
        );
      await settle();

      expect(said()).toContain('The rule was not saved.');
      expect(said()).toContain('refused the rule for a reason this page could not check');
      expect(input('manual-hold').value).toBe('90');
      expect(byTestId('rule-saved')?.textContent?.trim()).toBe('');
    });

    it('says a save without an answer may have been carried out', async () => {
      byTestId('rule-save')!.click();
      await settle();
      http.expectOne((call) => call.method === 'PUT').error(new ProgressEvent('error'));
      await settle();

      expect(said()).toContain('the rule may have been saved all the same');
    });

    it('removes the rule after asking, Cancel first', async () => {
      byTestId('rule-remove')!.click();
      await settle();
      expect(byTestId('remove-question')?.textContent).toContain('Remove the rule of this room?');
      expect(document.activeElement).toBe(byTestId('rule-remove-cancel'));

      byTestId('rule-remove-confirm')!.click();
      await settle();
      const remove: TestRequest = http.expectOne((call) => call.method === 'DELETE');
      expect(remove.request.url).toBe('/home/light/rooms/office/rules');
      remove.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect(navigate).toHaveBeenCalledWith(['/lights']);
    });

    it('takes a rule the service no longer has as removed', async () => {
      byTestId('rule-remove')!.click();
      await settle();
      byTestId('rule-remove-confirm')!.click();
      await settle();
      http.expectOne((call) => call.method === 'DELETE').flush(NO_RULE, NOT_FOUND);
      await settle();

      expect(navigate).toHaveBeenCalledWith(['/lights']);
    });

    it('switches the rules of the resident at once and shows what the service stored', async () => {
      type(input('manual-hold'), '120');
      toggle('resident-switch');
      await settle();

      const write = http.expectOne((call) => call.url.endsWith('/resident-enabled'));
      expect(write.request.body).toEqual({ enabled: false });
      write.flush({ ...STORED, enabledByResident: false });
      await settle();
      ruleRead().flush({ ...STORED, enabledByResident: false });
      await settle();

      expect(
        byTestId('resident-switch')?.querySelector('button')?.getAttribute('aria-checked'),
      ).toBe('false');
      // the form is not filled again: what was typed stays
      expect(input('manual-hold').value).toBe('120');
    });

    // found in review: a failed read after the switch was swallowed, the switch kept the old state
    it('says when the rule could not be read after the switch of the resident', async () => {
      toggle('resident-switch');
      await settle();
      http.expectOne((call) => call.url.endsWith('/resident-enabled')).flush(STORED);
      await settle();
      ruleRead().flush(
        { errors: [{ message: 'down' }] },
        { status: 502, statusText: 'Bad Gateway' },
      );
      await settle();

      expect(said()).toContain('the state shown may be old');
    });
  });

  // found in review: a period that cannot be read was dropped from the form, and from the next save, unseen
  it('tells a stored period this version cannot read', async () => {
    await open('office', { ...STORED, periods: [...STORED.periods!, null as never] });

    expect(allByTestId('period-row')).toHaveLength(2);
    expect(byTestId('periods-dropped')?.textContent).toContain(
      'cannot read: 1 - a save leaves them out',
    );
  });

  it('tells a rule that could not be read, and offers no form', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ room: 'office' }) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RuleEditor);
    fixture.detectChanges();
    await settle();
    ruleRead().flush({ errors: [{ message: 'down' }] }, { status: 502, statusText: 'Bad Gateway' });
    http.expectOne((call) => call.url === '/home/device/registry').flush(OFFICE);
    await settle();

    expect(said()).toContain('The rule could not be read.');
    expect(byTestId('rule-save')).toBeNull();
  });
});
