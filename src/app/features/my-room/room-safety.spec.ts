import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { throwError } from 'rxjs';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { DeviceCommands } from '../../core/api/device-commands';
import { SafetyRead } from '../../data-access/safety/safety-api';
import { SafetyStore } from '../../data-access/safety/safety-store';
import { RoomSafety } from './room-safety';

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
      lastHeardAt: '2026-11-20T09:55:00',
    },
    { id: 71, name: 'Smoke detector', room: 'kitchen', kind: 'smoke detector', alarm: on },
  ],
};

/** The office detector sounding - the one moment a mute does anything (HAS-464). */
const IN_ALARM: SafetyRead = {
  detectors: READ.detectors!.map((detector) =>
    detector.id === 72 ? { ...detector, alarm: on } : detector,
  ),
};

describe('RoomSafety', () => {
  let fixture: ComponentFixture<RoomSafety>;
  let safety: FakeResource<SafetyRead | null>;
  let commands: DeviceCommands<string>;
  let sent: string[];

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse('2026-11-20T09:00:00Z'), toFake: ['Date'] });
    safety = fakeResource();
    commands = new DeviceCommands<string>();
    sent = [];
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
      ],
    });
    fixture = TestBed.createComponent(RoomSafety);
    fixture.componentRef.setInput('room', 'office');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container').forEach((overlay) => overlay.remove());
  });

  async function card(): Promise<HTMLElement | null> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="room-safety"]');
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('lists the detectors of its room alone, without the room in the name', async () => {
    answer(safety, READ);
    const shown = (await card())!;

    expect(
      [...shown.querySelectorAll('[data-detector]')].map((row) =>
        row.getAttribute('data-detector'),
      ),
    ).toEqual(['72']);
    expect(words(shown.querySelector('.detector__name'))).toBe('Smoke detector');
    expect(words(shown.querySelector('[data-testid="detector-state"]'))).toContain('All right');
    expect(words(shown.querySelector('.detector__facts'))).toContain('Battery: Low - replace it');
  });

  // a resident presses nothing about a room but its lights, its blinds, its air conditioner - and the mute of its
  // detectors (HAS-469)
  it('names the mute of each detector in alarm as the one thing to press', async () => {
    answer(safety, IN_ALARM);
    const controls = [...(await card())!.querySelectorAll('button, a, input, [tabindex]')].map(
      (control) => control.getAttribute('aria-label') ?? words(control),
    );

    expect(controls).toEqual(['Mute Office smoke detector']);
  });

  // HAS-464: the base takes a mute of a quiet detector and does nothing - the service refuses it
  it('offers no mute while the detector is not in alarm', async () => {
    answer(safety, READ);

    expect((await card())!.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });

  it('takes the question of a mute away when the alarm is over', async () => {
    answer(safety, IN_ALARM);
    (await card())!.querySelector<HTMLButtonElement>('[data-testid="detector-mute"]')!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="safety-question"]')).not.toBeNull(),
    );

    answer(safety, READ);
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="safety-question"]')).toBeNull(),
    );
    expect(sent).toEqual([]);
  });

  it('asks before a mute and sends it for yes alone', async () => {
    answer(safety, IN_ALARM);
    (await card())!.querySelector<HTMLButtonElement>('[data-testid="detector-mute"]')!.click();
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="safety-question"]')).not.toBeNull(),
    );

    document.querySelector<HTMLButtonElement>('[data-testid="confirm-yes"]')!.click();
    await fixture.whenStable();

    expect(sent).toEqual(['mute 72']);
  });

  it('tells a mute that got no answer as one that may have been carried out', async () => {
    answer(safety, READ);
    commands.send(
      SafetyStore.keyOf(72, 'mute'),
      throwError(() => new ApiError('network', 0)),
    );

    expect(words((await card())!.querySelector('[data-testid="detector-failure"]'))).toBe(
      'The command got no answer - it may have been carried out all the same.',
    );
  });

  it('shows no card for a room without a detector, nor while the first answer is on its way', async () => {
    expect(await card()).toBeNull();

    fixture.componentRef.setInput('room', 'loft');
    answer(safety, READ);

    expect(await card()).toBeNull();
  });

  it('tells a failure before any answer: nobody knows then whether the room has a detector', async () => {
    fail(safety, new ApiError('server', 502));

    expect(words((await card())!.querySelector('[role="alert"]'))).toContain('502');
  });
});
