import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of, throwError } from 'rxjs';

import {
  FakeQueryResource,
  FakeResource,
  answer,
  answerQuery,
  fakeQueryResource,
  fakeResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { DeviceCommands } from '../../core/api/device-commands';
import { HistoryRange } from '../../core/time/history-range';
import {
  SafetyAlarm,
  SafetyApi,
  SafetyAutomation,
  SafetyRead,
  SafetyRun,
  SafetyStatus,
} from '../../data-access/safety/safety-api';
import { SafetyStatusStore, SafetyStore } from '../../data-access/safety/safety-store';
import { SafetyPage } from './safety-page';

const SINCE = '2026-11-20T08:00:00';
const on = { value: true, since: SINCE };
const off = { value: false, since: SINCE };

const READ: SafetyRead = {
  detectors: [
    {
      id: 72,
      name: 'Office smoke detector',
      room: 'office',
      kind: 'smoke detector',
      alarm: off,
      online: on,
      muted: off,
      batteryLow: on,
      endOfLife: off,
      fault: off,
      selfTestProblem: off,
      model: 'XS01-M',
      firmware: 'v1.3.0',
      lastHeardAt: '2026-11-20T09:55:00',
    },
    {
      id: 71,
      name: 'Smoke detector',
      room: 'kitchen',
      kind: 'smoke detector',
      alarm: on,
      online: on,
      muted: off,
      batteryLow: off,
      endOfLife: off,
      fault: off,
      selfTestProblem: off,
      lastHeardAt: '2026-11-20T09:58:00',
      lastCommandConfirmed: false,
    },
    // nothing heard from the base: every flag left out
    { id: 76, name: 'Hall up heat detector', room: 'hall up', kind: 'heat detector' },
  ],
  bases: [{ stationSerial: 'SBS50ABCDEF01', wifiSsid: 'house-iot' }],
};

const STATUS: SafetyStatus = {
  bases: [
    {
      stationSerial: 'SBS50ABCDEF01',
      reachable: false,
      lastHeardAt: '2026-11-20T08:00:00',
      wifiRssi: -58,
      silent: true,
    },
  ],
  detectorsInTrouble: 1,
  alerts: [],
};

describe('SafetyPage', () => {
  let fixture: ComponentFixture<SafetyPage>;
  let safety: FakeResource<SafetyRead | null>;
  let status: FakeResource<SafetyStatus | null>;
  let automation: FakeResource<SafetyAutomation | null>;
  let alarms: FakeQueryResource<HistoryRange, readonly SafetyAlarm[] | null>;
  let alarmsRange: () => HistoryRange;
  let runs: FakeQueryResource<HistoryRange, readonly SafetyRun[] | null>;
  let runsRange: () => HistoryRange;
  let commands: DeviceCommands<string>;
  let sent: string[];
  let saved: SafetyAutomation[];
  let saveReply: () => Observable<void>;

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-11-20T09:00:00Z'), toFake: ['Date'] });
    safety = fakeResource();
    status = fakeResource();
    automation = fakeResource();
    automation.refresh = vi.fn(() => Promise.resolve());
    alarms = fakeQueryResource();
    runs = fakeQueryResource();
    commands = new DeviceCommands<string>();
    sent = [];
    saved = [];
    saveReply = () => of(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: SafetyStore,
          useValue: {
            safety,
            commands,
            send: (id: number, command: string) => sent.push(`${command} ${id}`),
          },
        },
        { provide: SafetyStatusStore, useValue: { status } },
        {
          provide: SafetyApi,
          useValue: {
            watchAutomation: () => automation,
            watchAlarms: (range: () => HistoryRange) => {
              alarmsRange = range;
              return alarms;
            },
            watchRuns: (range: () => HistoryRange) => {
              runsRange = range;
              return runs;
            },
            saveAutomation: (body: SafetyAutomation) => {
              saved.push(body);
              return saveReply();
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SafetyPage);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container').forEach((overlay) => overlay.remove());
  });

  function page(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function detector(id: number): Promise<HTMLElement> {
    await fixture.whenStable();
    return page().querySelector<HTMLElement>(`[data-detector="${id}"]`)!;
  }

  const fact = (card: HTMLElement, name: string) =>
    words(card.querySelector(`[data-fact="${name}"] dd`));

  // the question is a window over the page, outside the card, opened once the dialog is loaded
  async function inWindow(id: string): Promise<HTMLElement | null> {
    await fixture.whenStable();
    return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  it('lists the detectors by floor in the order of the house, each with its state and facts', async () => {
    answer(safety, READ);
    await fixture.whenStable();

    const floors = [...page().querySelectorAll('.floor')].map((floor) => [
      floor.getAttribute('data-floor'),
      [...floor.querySelectorAll('[data-detector]')].map((card) =>
        card.getAttribute('data-detector'),
      ),
    ]);
    expect(floors).toEqual([
      ['ground', ['71']],
      ['upper', ['72']],
      ['circulation', ['76']],
    ]);
    const office = await detector(72);
    expect(words(office.querySelector('[data-testid="detector-state"]'))).toContain('All right');
    expect(fact(office, 'battery')).toBe('Low - replace it');
    expect(fact(office, 'endOfLife')).toBe('None');
    expect(fact(office, 'model')).toBe('XS01-M');
    expect(words(office.querySelector('.detector__room'))).toBe('office · Smoke detector');
    const kitchen = await detector(71);
    expect(words(kitchen.querySelector('[data-testid="detector-state"]'))).toContain('Alarm');
    expect(words(kitchen.querySelector('[data-testid="detector-not-reacted"]'))).toBe(
      'The base did not confirm the last command.',
    );
  });

  // missing is never all right, nor off
  it('says not known for every flag the answer leaves out', async () => {
    answer(safety, READ);
    const hall = await detector(76);

    expect(hall.querySelector('[data-testid="detector-state"]')?.getAttribute('data-state')).toBe(
      'unknown',
    );
    for (const name of ['battery', 'endOfLife', 'fault', 'selfTest', 'model', 'firmware']) {
      expect(fact(hall, name), name).toBe('Not known');
    }
    expect(fact(hall, 'lastHeard')).toBe('Not yet');
  });

  it('says that the registry holds no detector', async () => {
    answer(safety, { detectors: [], bases: [] });
    await fixture.whenStable();

    expect(words(page().querySelector('[data-testid="detectors-none"]'))).toBe(
      'No smoke detector in the registry.',
    );
  });

  it('asks before a mute, the safe answer focused, and sends it for yes alone', async () => {
    answer(safety, READ);
    const kitchen = await detector(71);

    kitchen.querySelector<HTMLButtonElement>('[data-testid="detector-mute"]')!.click();
    const question = await vi.waitFor(async () => {
      const shown = await inWindow('safety-question');
      expect(shown).not.toBeNull();
      return shown!;
    });
    expect(words(question)).toContain('Silence the siren of this detector');
    expect((await inWindow('confirm-cancel'))!.hasAttribute('cdkfocusinitial')).toBe(true);
    expect(sent).toEqual([]);

    (await inWindow('confirm-yes'))!.click();
    await fixture.whenStable();

    expect(sent).toEqual(['mute 71']);
    expect(await inWindow('safety-question')).toBeNull();
  });

  it('sends no self test for "Do not test"', async () => {
    answer(safety, READ);
    const office = await detector(72);

    office.querySelector<HTMLButtonElement>('[data-testid="detector-self-test"]')!.click();
    await vi.waitFor(async () => expect(await inWindow('safety-question')).not.toBeNull());
    expect(words(await inWindow('confirm-cancel'))).toBe('Do not test');
    (await inWindow('confirm-cancel'))!.click();
    await fixture.whenStable();

    expect(sent).toEqual([]);
  });

  it('tells a refused command on its detector, in our words', async () => {
    answer(safety, READ);
    commands.send(
      SafetyStore.keyOf(71, 'mute'),
      throwError(
        () => new ApiError('client', 429, [{ message: 'too soon', code: 'COMMAND_TOO_SOON' }]),
      ),
    );

    expect(words((await detector(71)).querySelector('[data-testid="detector-failure"]'))).toBe(
      'The detector was commanded a moment ago - wait a minute.',
    );
  });

  it('tells the base: not connected, its network, its signal and that it is silent', async () => {
    answer(safety, READ);
    answer(status, STATUS);
    await fixture.whenStable();

    const base = page().querySelector('[data-testid="safety-base"]')!;
    expect(words(base.querySelector('[data-testid="base-reachable"]'))).toBe('Not connected');
    expect(words(base)).toContain('house-iot');
    expect(words(base)).toContain('-58 dBm');
    expect(words(base.querySelector('[data-testid="base-silent"]'))).toBe(
      'Silent for long - the technical channel was told.',
    );
  });

  describe('the switches of the reactions', () => {
    const toggle = (reaction: string) =>
      page().querySelector<HTMLElement>(`[data-reaction="${reaction}"]`)!;
    const checked = (reaction: string) =>
      toggle(reaction).querySelector('button')!.getAttribute('aria-checked');

    it('sends the whole body with one switch turned, reads it back, and never flips itself', async () => {
      answer(automation, { lightsOn: true, blindsUp: false, airconOff: true });
      await fixture.whenStable();

      toggle('blindsUp').querySelector('button')!.click();
      await fixture.whenStable();

      expect(saved).toEqual([{ lightsOn: true, blindsUp: true, airconOff: true }]);
      expect(automation.refresh).toHaveBeenCalled();
      // the service has not answered with the new value: the switch shows what it stored
      expect(checked('blindsUp')).toBe('false');
    });

    it('tells a change that failed, the switch where the service has it', async () => {
      saveReply = () =>
        throwError(
          () => new ApiError('client', 400, [{ message: 'x', code: 'INVALID_AUTOMATION' }]),
        );
      answer(automation, { lightsOn: false, blindsUp: false, airconOff: false });
      await fixture.whenStable();

      toggle('lightsOn').querySelector('button')!.click();
      await fixture.whenStable();

      expect(words(page().querySelector('[data-testid="safety-automation"]'))).toContain(
        'The switch could not be changed. The service refused these switches.',
      );
      expect(checked('lightsOn')).toBe('false');
    });

    it('offers no switch while one of them is not known', async () => {
      answer(automation, { lightsOn: true, blindsUp: false });
      await fixture.whenStable();

      expect(page().querySelector('[data-reaction]')).toBeNull();
      expect(words(page().querySelector('[data-testid="automation-unknown"]'))).toBe(
        'The switches are not known.',
      );
    });
  });

  it('lists the alarms of the period, one going on and one over', async () => {
    await fixture.whenStable();
    answerQuery(alarms, alarmsRange(), [
      {
        id: 2,
        detectorId: 71,
        name: 'Smoke detector',
        room: 'kitchen',
        startedAt: SINCE,
        alarmToldAt: SINCE,
      },
      {
        id: 1,
        detectorId: 72,
        room: 'office',
        startedAt: '2026-11-10T08:00:00',
        clearedAt: '2026-11-10T08:03:00',
      },
    ]);
    answerQuery(runs, runsRange(), [
      { episode: 2, reaction: 'lightsOn', target: 'kitchen', sentAt: SINCE, outcome: 'sent' },
    ]);
    await fixture.whenStable();

    const items = [...page().querySelectorAll('[data-testid="safety-alarm"]')].map(words);
    expect(items[0]).toContain('kitchen · Smoke detector');
    expect(items[0]).toContain('Going on · The household was told');
    expect(items[1]).toContain('office · #72');
    expect(items[1]).toContain('Over at');
    expect(items[1]).toContain('Not told');
    expect(words(page().querySelector('[data-testid="safety-run"]'))).toContain(
      'Light the way out (the room and the halls) · kitchen',
    );
  });

  //the newest five, five more with every press - the card of one height (owner, the preview of HAS-469)
  it('shows the newest five alarms and five more with every press', async () => {
    await fixture.whenStable();
    answerQuery(
      alarms,
      alarmsRange(),
      Array.from({ length: 7 }, (_, index) => ({
        id: 7 - index,
        detectorId: 71,
        room: 'kitchen',
        startedAt: `2026-11-1${index}T08:00:00`,
        clearedAt: `2026-11-1${index}T08:03:00`,
      })),
    );
    answerQuery(runs, runsRange(), []);
    await fixture.whenStable();

    expect(page().querySelectorAll('[data-testid="safety-alarm"]')).toHaveLength(5);
    expect(words(page().querySelector('[data-testid="safety-alarms"]'))).toContain('5 of 7');
    (page().querySelector('[data-testid="alarms-more"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(page().querySelectorAll('[data-testid="safety-alarm"]')).toHaveLength(7);
    expect(page().querySelector('[data-testid="alarms-more"]')).toBeNull();
  });

  it('speaks Polish', async () => {
    answer(safety, READ);
    await useLanguage('pl');
    await fixture.whenStable();

    expect(words(page())).toContain('Bezpieczeństwo');
    expect(words((await detector(71)).querySelector('[data-testid="detector-mute"]'))).toBe(
      'Wycisz',
    );
    // HAS-464: no mute of a detector not in alarm - the base would do nothing
    expect((await detector(72)).querySelector('[data-testid="detector-mute"]')).toBeNull();
    expect(fact(await detector(72), 'battery')).toBe('Słaba - do wymiany');
  });
});
