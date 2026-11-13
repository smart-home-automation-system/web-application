import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { of, throwError } from 'rxjs';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { AirconApi, AirconCommand, AirconUnit } from '../../data-access/aircon/aircon-api';
import { RoomAircon } from './room-aircon';

const OFFICE: AirconUnit = {
  id: 140,
  name: 'Air conditioner',
  room: 'office',
  power: true,
  mode: 'cool',
  targetTemperature: 23,
  roomTemperature: 25,
  fanSpeed: 'auto',
  quiet: false,
  turbo: false,
  sleep: false,
  reachable: true,
  compressorRunning: true,
};

describe('RoomAircon', () => {
  let fixture: ComponentFixture<RoomAircon>;
  let room: FakeResource<readonly AirconUnit[] | null>;
  let asked: () => string;
  let sent: { id: number; command: AirconCommand }[];
  let refused: ApiError | undefined;

  beforeEach(() => {
    room = fakeResource();
    room.refresh = vi.fn(() => Promise.resolve());
    sent = [];
    refused = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: AirconApi,
          useValue: {
            watchRoom: (name: () => string) => {
              asked = name;
              return room;
            },
            command: (id: number, command: AirconCommand) => {
              sent.push({ id, command });
              return refused === undefined ? of(undefined) : throwError(() => refused);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(RoomAircon);
    fixture.componentRef.setInput('room', 'office');
  });

  function card(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="room-aircon"]');
  }

  function words(element: Element | null | undefined): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function press(testId: string): void {
    const control = card()!.querySelector(`[data-testid="${testId}"]`)!;
    // a toggle of a group is its inner button
    ((control.querySelector('button') ?? control) as HTMLButtonElement).click();
  }

  it('asks for the room it is given', async () => {
    await fixture.whenStable();
    expect(asked()).toBe('office');
  });

  // no card while the first answer is on its way, and none for a room without a unit
  it('draws nothing for a room without a unit', async () => {
    await fixture.whenStable();
    expect(card()).toBeNull();

    fail(
      room,
      new ApiError('client', 404, [{ message: 'Room not found', code: 'NOT_FOUND_ROOM' }]),
    );
    await fixture.whenStable();
    expect(card()).toBeNull();

    answer(room, []);
    await fixture.whenStable();
    expect(card()).toBeNull();
  });

  it('tells a failure before any answer - nobody knows whether the room has a unit', async () => {
    fail(room, new ApiError('server', 502, [{ message: 'Bad gateway' }]));
    await fixture.whenStable();

    expect(card()).not.toBeNull();
  });

  it('shows the state the unit reported', async () => {
    answer(room, [OFFICE]);
    await fixture.whenStable();

    expect(words(card()!.querySelector('[data-testid="aircon-state"]'))).toBe(
      'On · Cooling · 23 °C',
    );
    expect(words(card())).toContain('Its sensor 25 °C');
    expect(words(card())).toContain('compressor running');
  });

  // missing is never off: a unit not read yet offers no settings
  it('offers no settings for a unit not read yet', async () => {
    answer(room, [{ id: 140, name: 'Air conditioner', room: 'office' }]);
    await fixture.whenStable();

    expect(words(card()!.querySelector('[data-testid="aircon-state"]'))).toBe('Not known');
    expect(card()!.querySelector('[data-testid="aircon-mode"]')).toBeNull();
    expect(card()!.querySelector('[data-testid="aircon-not-read"]')).not.toBeNull();
  });

  it('names exactly the controls of the unit as what can be pressed', async () => {
    answer(room, [OFFICE]);
    await fixture.whenStable();

    // every button - the modes are one group with a stop each, the fan a step down and up (HAS-438)
    const controls = [...card()!.querySelectorAll('button, [role="combobox"]')].map((control) =>
      control.getAttribute('role') === 'switch'
        ? 'switch: ' + words(control.closest('mat-slide-toggle'))
        : control.getAttribute('role') === 'combobox'
          ? 'select: ' + words(control.closest('mat-form-field')?.querySelector('mat-label'))
          : (control.getAttribute('aria-label') ??
            words(control.querySelector('.mode__label') ?? control)),
    );
    expect(controls).toEqual([
      'On Air conditioner',
      'Off Air conditioner',
      'Auto',
      'Cooling',
      'Drying',
      'Fan',
      'Heating',
      'Lower the target Air conditioner',
      'Raise the target Air conditioner',
      'Slower fan Air conditioner',
      'Faster fan Air conditioner',
      'switch: Quiet Air conditioner',
      'switch: Turbo Air conditioner',
      'switch: Sleep Air conditioner',
    ]);
  });

  // a command as a change by hand, read back at once and 2.5 s later; only the reads move the card
  it('sends a command and reads the room again twice', { timeout: 10_000 }, async () => {
    answer(room, [OFFICE]);
    await fixture.whenStable();

    press('aircon-target-up');
    await fixture.whenStable();

    expect(sent).toEqual([{ id: 140, command: { targetTemperature: 24 } }]);
    expect(room.refresh).toHaveBeenCalledTimes(1);
    // the second read on the real clock: faked timers stall the scheduler of Angular in CI
    await new Promise((resolve) => setTimeout(resolve, 2_600));
    expect(room.refresh).toHaveBeenCalledTimes(2);
    expect(words(card()!.querySelector('[data-testid="aircon-state"]'))).toBe(
      'On · Cooling · 23 °C',
    );
  });

  // HAS-438 (owner, 2026-11-13): the fan by a step, as the target - auto, then low to high
  it('steps the fan from auto through the speeds, and stops at both ends', async () => {
    answer(room, [OFFICE]);
    await fixture.whenStable();

    expect(words(card()!.querySelector('[data-testid="aircon-fan-speed"]'))).toBe('Auto');
    expect(
      (card()!.querySelector('[data-testid="aircon-fan-down"]') as HTMLButtonElement).disabled,
    ).toBe(true);
    press('aircon-fan-up');
    await fixture.whenStable();
    expect(sent).toEqual([{ id: 140, command: { fanSpeed: 'low' } }]);

    answer(room, [{ ...OFFICE, fanSpeed: 'high' }]);
    await fixture.whenStable();
    expect(
      (card()!.querySelector('[data-testid="aircon-fan-up"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  // a speed this version does not know is printed as it came, and offers no step
  it('offers no step from a fan speed it does not know', async () => {
    answer(room, [{ ...OFFICE, fanSpeed: 'silent' }]);
    await fixture.whenStable();

    expect(words(card()!.querySelector('[data-testid="aircon-fan-speed"]'))).toBe('silent');
    for (const testId of ['aircon-fan-down', 'aircon-fan-up']) {
      expect(
        (card()!.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
  });

  // a copy of CommandRules: cooling never below 22 °C - not sent, and the minus is off at the bottom
  it('never lowers cooling below 22 °C', async () => {
    answer(room, [{ ...OFFICE, targetTemperature: 22 }]);
    await fixture.whenStable();

    const down = card()!.querySelector('[data-testid="aircon-target-down"]') as HTMLButtonElement;
    expect(down.disabled).toBe(true);
  });

  it('sends 22 °C with the mode when cooling is chosen below it', async () => {
    answer(room, [{ ...OFFICE, mode: 'heat', targetTemperature: 20 }]);
    await fixture.whenStable();

    const cooling = [...card()!.querySelectorAll('mat-button-toggle button')].find(
      (button) => words(button.querySelector('.mode__label')) === 'Cooling',
    ) as HTMLButtonElement;
    cooling.click();
    await fixture.whenStable();

    expect(sent).toEqual([{ id: 140, command: { mode: 'cool', targetTemperature: 22 } }]);
  });

  it('keeps turbo and quiet off in drying', async () => {
    answer(room, [{ ...OFFICE, mode: 'dry' }]);
    await fixture.whenStable();

    const turbo = card()!.querySelector('[data-testid="aircon-turbo"] button') as HTMLButtonElement;
    expect(turbo.disabled).toBe(true);
  });

  it('tells a command the unit did not take in its own words', async () => {
    answer(room, [OFFICE]);
    refused = new ApiError('server', 502, [{ message: 'Device failed', code: 'DEVICE_FAILED' }]);
    await fixture.whenStable();

    press('aircon-off');
    await fixture.whenStable();

    expect(words(card()!.querySelector('[data-testid="aircon-failure"]'))).toBe(
      'The unit did not answer the command - it may have taken it all the same.',
    );
  });

  it('tells the window that holds the unit and when it is set back', async () => {
    answer(room, [
      {
        ...OFFICE,
        power: false,
        window: { state: 'open', hold: true, restoreUntil: '2026-11-08T14:13:00' },
      },
    ]);
    await fixture.whenStable();

    expect(words(card()!.querySelector('[data-testid="aircon-window-hold"]'))).toBe(
      'Stopped by the open window - set back if it closes before 14:13',
    );
  });

  it('marks a unit that does not answer', async () => {
    answer(room, [{ ...OFFICE, reachable: false }]);
    await fixture.whenStable();

    expect(card()!.querySelector('[data-testid="aircon-unreachable"]')).not.toBeNull();
  });
});
