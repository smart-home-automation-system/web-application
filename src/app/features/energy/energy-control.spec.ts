import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

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
import { HistoryRange } from '../../core/time/history-range';
import {
  Automation,
  ChargeRun,
  ChargeState,
  EnergyApi,
  PlannedOutage,
} from '../../data-access/energy/energy-api';
import { EnergyControl } from './energy-control';

// 14:45 in the house (winter time, UTC+1)
const NOW = new Date('2026-11-03T13:45:00Z');

const CHARGING: ChargeRun = {
  id: 7,
  state: 'charging',
  source: 'dashboard',
  requestedAt: '2026-11-03T14:05:30',
  targetSoc: 100,
  windowStart: '2026-11-03T14:05:00',
  windowEnd: '2026-11-03T18:00:00',
  deliveryStatus: 4,
  socAtStart: 45,
};

const OUTAGES: PlannedOutage[] = [
  {
    id: 3,
    startsAt: '2026-11-12T08:00:00',
    endsAt: '2026-11-12T13:00:00',
    kind: 'planned',
    scope: 'street',
    description: 'Testowo ul. Przykładowa',
    skipAutomation: false,
    plannedChargeStart: '2026-11-12T03:55:00',
  },
  {
    id: 4,
    startsAt: '2026-11-18T08:00:00',
    endsAt: '2026-11-18T14:00:00',
    kind: 'planned',
    scope: 'town',
    description: 'Testowo ul. Lipowa',
  },
];

describe('EnergyControl', () => {
  let charge: FakeResource<ChargeState | null>;
  let runs: FakeQueryResource<HistoryRange, readonly ChargeRun[] | null>;
  let automation: FakeResource<Automation | null>;
  let planned: FakeResource<readonly PlannedOutage[] | null>;
  let runsAsked: () => HistoryRange;
  let api: {
    startCharge: ReturnType<typeof vi.fn>;
    cancelCharge: ReturnType<typeof vi.fn>;
    saveAutomation: ReturnType<typeof vi.fn>;
    skipOutage: ReturnType<typeof vi.fn>;
  };
  let fixture: ComponentFixture<EnergyControl>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    charge = fakeResource();
    runs = fakeQueryResource();
    automation = fakeResource();
    planned = fakeResource();
    api = {
      startCharge: vi.fn(() => of(undefined)),
      cancelCharge: vi.fn(() => of(undefined)),
      saveAutomation: vi.fn(() => of(undefined)),
      skipOutage: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: EnergyApi,
          useValue: {
            ...api,
            watchCharge: () => charge,
            watchChargeRuns: (range: () => HistoryRange) => {
              runsAsked = range;
              return runs;
            },
            watchAutomation: () => automation,
            watchPlannedOutages: () => planned,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(EnergyControl);
    fixture.componentRef.setInput('planned', planned);
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.useRealTimers();
  });

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const byId = (id: string) => page().querySelector(`[data-testid="${id}"]`) as HTMLElement;
  // the question is a window over the page, outside the fixture
  const inWindow = async (id: string) => {
    await fixture.whenStable();
    return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  };

  function type(id: string, value: string): void {
    const input = byId(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // a write to the real inverter: asked first in a window over the page (owner, 2026-11-11)
  it('starts a charge to the target until the time asked, once the question is answered yes', async () => {
    answer(charge, { active: false, plannedStart: '2026-11-12T03:55:00' });
    await settle();

    expect(words(byId('charge-none'))).toBe('The battery is not charging from the grid.');
    expect(words(byId('charge-planned'))).toContain('The automation would start a charge at');
    type('charge-target', '80');
    type('charge-until', '18:30');
    byId('charge-start').click();
    await settle();

    expect(api.startCharge).not.toHaveBeenCalled();
    expect(words(await inWindow('charge-question'))).toContain(
      'Charge the battery from the grid now?',
    );
    const keep = await inWindow('confirm-cancel');
    expect(words(keep)).toBe('Do not charge');
    expect(keep!.hasAttribute('cdkfocusinitial')).toBe(true);
    expect((byId('charge-start') as HTMLButtonElement).getAttribute('aria-disabled')).toBe('true');

    (await inWindow('confirm-yes'))!.click();
    await settle();
    expect(await inWindow('charge-question')).toBeNull();
    expect(api.startCharge).toHaveBeenCalledWith({ targetSoc: 80, until: '2026-11-03T18:30:00' });
  });

  it('sends nothing when the question is answered no', async () => {
    answer(charge, { active: false });
    await settle();

    byId('charge-start').click();
    await settle();
    (await inWindow('confirm-cancel'))!.click();
    await settle();

    expect(await inWindow('charge-question')).toBeNull();
    expect(api.startCharge).not.toHaveBeenCalled();
  });

  it('closes the question of a start for good once a charge goes on', async () => {
    answer(charge, { active: false });
    await settle();
    byId('charge-start').click();
    await settle();
    expect(await inWindow('charge-question')).toBeTruthy();

    answer(charge, { active: true, run: { ...CHARGING, source: 'automation' }, soc: 50 });
    await settle();

    expect(await inWindow('charge-question')).toBeNull();
    expect(api.startCharge).not.toHaveBeenCalled();
  });

  it('refuses a target out of bounds and an end that is not a time, before any write', async () => {
    answer(charge, { active: false });
    await settle();

    type('charge-target', '5');
    byId('charge-start').click();
    await settle();

    expect(words(byId('charge-problems'))).toContain(
      'The target is a whole number from 10 to 100 %.',
    );
    // nothing to ask about a charge the service would refuse
    expect(await inWindow('charge-question')).toBeNull();
    expect(api.startCharge).not.toHaveBeenCalled();
  });

  it('shows the charge going on with the battery now, and stops it at once', async () => {
    answer(charge, { active: true, run: CHARGING, soc: 62.4, power: 4980, minutesLeft: 101 });
    await settle();

    expect(words(byId('charge-state'))).toBe('Charging · started by the dashboard');
    expect(words(byId('charge-soc'))).toBe('62 %');
    expect(words(byId('charge-left'))).toBe('about 101 min');
    byId('charge-cancel').click();
    await settle();

    expect(api.cancelCharge).toHaveBeenCalledTimes(1);
  });

  // the cancel of a charge of the automation also skips its outage - asked first, "Keep" focused
  it('asks before it stops a charge the automation started', async () => {
    answer(charge, {
      active: true,
      run: { ...CHARGING, source: 'automation', plannedOutageId: 3 },
      soc: 50,
    });
    await settle();

    byId('charge-cancel').click();
    await settle();
    expect(api.cancelCharge).not.toHaveBeenCalled();
    expect(words(await inWindow('charge-question'))).toContain(
      'Stopping it also skips that outage.',
    );
    const keep = await inWindow('confirm-cancel');
    expect(words(keep)).toBe('Keep charging');
    expect(keep!.hasAttribute('cdkfocusinitial')).toBe(true);

    (await inWindow('confirm-yes'))!.click();
    await settle();
    expect(api.cancelCharge).toHaveBeenCalledTimes(1);
  });

  it('words a refusal of the service by its code', async () => {
    answer(charge, { active: false });
    api.startCharge.mockReturnValue(
      throwError(() => new ApiError('client', 409, [{ code: 'CHARGE_IN_PROGRESS', message: 'x' }])),
    );
    await settle();

    byId('charge-start').click();
    await settle();
    (await inWindow('confirm-yes'))!.click();
    await settle();
    await settle();

    expect(words(page().querySelector('app-api-error-strip'))).toContain(
      'A charge is already going on or being ended.',
    );
  });

  it('follows the stored settings until changed, then writes them whole', async () => {
    answer(automation, {
      chargeBeforeOutage: false,
      targetSoc: 100,
      chargePowerKw: 5,
      marginMinutes: 60,
    });
    await settle();

    expect((byId('automation-margin') as HTMLInputElement).value).toBe('60');
    (byId('automation-switch').querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    type('automation-power', '4,5');
    byId('automation-save').click();
    await settle();

    expect(api.saveAutomation).toHaveBeenCalledWith({
      chargeBeforeOutage: true,
      targetSoc: 100,
      chargePowerKw: 4.5,
      marginMinutes: 60,
    });
  });

  it('refuses settings out of bounds before the write', async () => {
    answer(automation, {
      chargeBeforeOutage: false,
      targetSoc: 100,
      chargePowerKw: 5,
      marginMinutes: 60,
    });
    await settle();

    type('automation-power', '9');
    type('automation-margin', '800');
    byId('automation-save').click();
    await settle();

    const problems = words(byId('automation-problems'));
    expect(problems).toContain('The power is from 1 to 8 kW.');
    expect(problems).toContain('The margin is a whole number of minutes from 0 to 720.');
    expect(api.saveAutomation).not.toHaveBeenCalled();
  });

  it('lists the planned outages with the start of the charge, and skips one of the street only', async () => {
    answer(planned, OUTAGES);
    await settle();

    const items = page().querySelectorAll('[data-testid="planned-outage"]');
    expect(words(items[0])).toContain('The charge would start at');
    expect(items[1].querySelector('[data-testid="planned-skip"]')).toBeNull();
    (items[0].querySelector('[data-testid="planned-skip"]') as HTMLButtonElement).click();
    await settle();

    expect(api.skipOutage).toHaveBeenCalledWith(3, true);
  });

  it('asks for the charges of the last 30 days, the newest first', async () => {
    await settle();
    expect(runsAsked()).toEqual({ from: '2026-10-04T00:00:00', to: '2026-11-04T00:00:00' });

    answerQuery(runs, runsAsked(), [
      {
        id: 1,
        requestedAt: '2026-11-01T10:00:00',
        source: 'dashboard',
        socAtStart: 20,
        socAtEnd: 80,
        endedBy: 'target',
      },
      {
        id: 2,
        requestedAt: '2026-11-02T10:00:00',
        source: 'automation',
        socAtStart: 30,
        targetSoc: 90,
        state: 'failed',
        endedBy: 'failed',
        failure: 'DEVICE_FAILED',
      },
    ]);
    await settle();

    const list = page().querySelectorAll('[data-testid="run"]');
    expect(words(list[0])).toContain('the automation');
    expect(words(list[0])).toContain('failed (DEVICE_FAILED)');
    expect(words(list[1])).toContain('20 % → 80 %');
  });

  it('reads in Polish', async () => {
    await useLanguage('pl');
    answer(charge, { active: false });
    await settle();

    expect(words(byId('charge-start'))).toContain('Ładuj z sieci');
  });
});
