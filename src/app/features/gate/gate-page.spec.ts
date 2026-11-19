import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { NEVER, Observable, of, throwError } from 'rxjs';

import {
  FakeQueryResource,
  FakeResource,
  answer,
  answerQuery,
  fakeQueryResource,
  fakeResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HistoryRange } from '../../core/time/history-range';
import {
  GarageAlert,
  GarageGate,
  GateApi,
  GateEvent,
  GateRead,
} from '../../data-access/gate/gate-api';
import { GatePage } from './gate-page';

const READ: GateRead = {
  gate: {
    id: 30,
    reachable: true,
    safe: true,
    autoOffSeconds: 1,
    checkedAt: '2026-11-19T10:00:00',
  },
  bridge: { online: true, at: '2026-11-19T06:00:00' },
  lastRing: { at: '2026-11-19T09:30:00', button: '10010100000' },
  lastOpening: { at: '2026-11-19T09:31:00', source: 'dashboard', member: 'Borys' },
};

const GARAGES: readonly GarageGate[] = [
  {
    id: 32,
    name: 'Right',
    state: 'open',
    since: '2026-11-19T09:00:00',
    reachable: true,
    safe: true,
  },
  {
    id: 31,
    name: 'Left',
    state: 'closed',
    since: '2026-11-19T08:00:00',
    reachable: true,
    safe: true,
  },
  { id: 33, name: 'Back', reachable: true, safe: true },
];

describe('GatePage', () => {
  let fixture: ComponentFixture<GatePage>;
  let gate: FakeResource<GateRead | null>;
  let garages: FakeResource<readonly GarageGate[] | null>;
  let alerts: FakeResource<readonly GarageAlert[] | null>;
  let events: FakeQueryResource<HistoryRange, readonly GateEvent[] | null>;
  let eventsRange: () => HistoryRange;
  let opened: string[];
  let pulsed: { id: number; member: string }[];
  let refusal: ApiError | undefined;
  let answering: boolean;

  const reply = (): Observable<void> =>
    !answering ? NEVER : refusal === undefined ? of(undefined) : throwError(() => refusal);

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-11-19T08:35:00Z'), toFake: ['Date'] });
    gate = fakeResource();
    garages = fakeResource();
    alerts = fakeResource();
    events = fakeQueryResource();
    for (const resource of [gate, garages, alerts]) {
      resource.refresh = vi.fn(() => Promise.resolve());
    }
    opened = [];
    pulsed = [];
    refusal = undefined;
    answering = true;
    localStorage.setItem(
      'smart-home.profile',
      JSON.stringify({ name: 'Celina', role: 'resident', rooms: ['bedroom'] }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: GateApi,
          useValue: {
            watchGate: () => gate,
            watchGarages: () => garages,
            watchAlerts: () => alerts,
            watchEvents: (range: () => HistoryRange) => {
              eventsRange = range;
              return events;
            },
            open: (member: string) => {
              opened.push(member);
              return reply();
            },
            pulse: (id: number, member: string) => {
              pulsed.push({ id, member });
              return reply();
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(GatePage);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const page = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined): string =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const byTestId = (testId: string, within: ParentNode = page()): HTMLElement | null =>
    within.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const garage = (id: number): HTMLElement =>
    page().querySelector<HTMLElement>(`[data-gate="${id}"]`)!;

  async function render(): Promise<void> {
    answer(gate, READ);
    answer(garages, GARAGES);
    answer(alerts, []);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('tells the driveway gate, the last opening with who made it, the last ring and the station', async () => {
    await render();

    expect(words(byTestId('gate-last-opening'))).toContain('from the application');
    expect(words(byTestId('gate-last-opening'))).toContain('Borys');
    expect(words(byTestId('gate-last-ring'))).toContain('09:30');
    expect(byTestId('gate-bridge')?.getAttribute('data-state')).toBe('online');
    expect(byTestId('gate-not-reachable')).toBeNull();
  });

  // owner, 2026-11-16: no question - the gate opens at once, with the member of the profile
  it('opens the driveway gate at once with the member of the profile, and reads it again', async () => {
    await render();

    byTestId('gate-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(opened).toEqual(['Celina']);
    expect(gate.refresh).toHaveBeenCalled();
    expect(byTestId('gate-open-sent')).not.toBeNull();
  });

  it('words a refusal of the opening', async () => {
    refusal = new ApiError('client', 409, [{ message: 'Open too soon', code: 'OPEN_TOO_SOON' }]);
    await render();

    byTestId('gate-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(words(byTestId('gate-open-failure'))).toBe(
      'The gate was commanded a moment ago - wait a few seconds.',
    );
  });

  it('tells a Shelly that does not answer, and a relay that does not switch itself off', async () => {
    answer(gate, { ...READ, gate: { id: 30, reachable: false } });
    fixture.detectChanges();
    expect(byTestId('gate-not-reachable')).not.toBeNull();

    answer(gate, { ...READ, gate: { id: 30, reachable: true, safe: false } });
    fixture.detectChanges();
    expect(byTestId('gate-not-safe')).not.toBeNull();
  });

  // owner, 2026-11-18: one button whose label follows the state; a missing state is never closed
  it('gives every garage gate its state and one button named by what a pulse does', async () => {
    await render();

    expect(
      [...page().querySelectorAll('[data-gate]')].map((row) => row.getAttribute('data-gate')),
    ).toEqual(['31', '32', '33']);
    expect(words(byTestId('garage-state', garage(31)))).toContain('Closed since');
    expect(words(byTestId('garage-state', garage(32)))).toBe('Open for 35 min');
    expect(words(byTestId('garage-state', garage(33)))).toBe('Not known');
    expect(words(byTestId('garage-pulse', garage(31)))).toBe('Open');
    expect(words(byTestId('garage-pulse', garage(32)))).toBe('Close');
    expect(words(byTestId('garage-pulse', garage(33)))).toBe('Run the gate');
  });

  // owner, 2026-11-18: no question, never disabled after a press - a second press stops the gate half-way
  it('sends every press of a garage gate at once and never disables its button', async () => {
    await render();
    const button = byTestId('garage-pulse', garage(32)) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    button.click();
    await fixture.whenStable();

    expect(pulsed).toEqual([
      { id: 32, member: 'Celina' },
      { id: 32, member: 'Celina' },
    ]);
    expect(garages.refresh).toHaveBeenCalled();
    expect(alerts.refresh).toHaveBeenCalled();
  });

  // a slow answer must not swallow the press that stops the gate
  it('sends a second press while the first one still waits for its answer', async () => {
    answering = false;
    await render();
    const button = byTestId('garage-pulse', garage(31)) as HTMLButtonElement;

    button.click();
    button.click();

    expect(pulsed).toHaveLength(2);
  });

  it('tells a garage gate whose sensor did not answer the last pulse', async () => {
    answer(gate, READ);
    answer(garages, [{ ...GARAGES[0], lastCommandConfirmed: false }]);
    answer(alerts, []);
    fixture.detectChanges();

    expect(words(byTestId('garage-not-reacted'))).toBe('The gate did not react');
  });

  it('lists the open alarms, an alarm apart from a warning, and says when there is none', async () => {
    await render();
    expect(byTestId('alerts-none')).not.toBeNull();

    answer(alerts, [
      {
        gate: 32,
        name: 'Right',
        kind: 'cold',
        level: 'alarm',
        openSince: '2026-11-19T09:00:00',
        reminders: 2,
      },
      { gate: 32, kind: 'long', level: 'warning', openSince: '2026-11-19T09:00:00', reminders: 0 },
    ]);
    fixture.detectChanges();

    const listed = [...page().querySelectorAll('[data-testid="gate-alert"]')];
    expect(listed.map((one) => one.getAttribute('data-level'))).toEqual(['alarm', 'warning']);
    expect(words(listed[0])).toContain('Right: Open in the cold');
    expect(words(listed[0])).toContain('repeated 2×');
    // a gate the alarm left unnamed is named from the garage gates
    expect(words(listed[1])).toContain('Right: Open for long');
  });

  // owner, 2026-11-19: a month is hundreds of items - twenty at first, twenty more with every "Show more"
  it('shows the newest twenty items of the timeline and twenty more on request', async () => {
    await render();
    const items: GateEvent[] = Array.from({ length: 25 }, (_, at) => ({
      kind: 'ring',
      at: `2026-11-1${at < 10 ? 9 : 8}T0${at % 10}:00:00`,
    }));
    answerQuery(events, eventsRange(), items);
    fixture.detectChanges();

    expect(page().querySelectorAll('.event')).toHaveLength(20);
    expect(words(page().querySelector('.events__more'))).toContain('20 of 25');

    byTestId('events-more')!.click();
    fixture.detectChanges();

    expect(page().querySelectorAll('.event')).toHaveLength(25);
    expect(byTestId('events-more')).toBeNull();
  });
});
