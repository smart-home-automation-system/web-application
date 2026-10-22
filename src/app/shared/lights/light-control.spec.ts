import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';

import { provideI18nTesting } from '../../../testing/i18n';
import { DeviceCommands } from '../../core/api/device-commands';
import { LightApi } from '../../data-access/light/light-api';
import { ControlledLight, LightControl } from './light-control';

/** 8 October 2026, 14:30:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T12:30:00Z');

@Component({
  imports: [LightControl],
  template: `
    <app-light-control
      [light]="light()"
      name="Light strip"
      [commands]="commands"
      [refresh]="refresh"
      [roomBusy]="roomBusy()"
    />
  `,
})
class Host {
  readonly light = signal<ControlledLight>({ id: 13, name: 'Bedroom light strip', kind: 'rgbw' });
  readonly commands = new DeviceCommands<number>();
  readonly roomBusy = signal(false);
  readonly refreshed: number[] = [];
  readonly refresh = () => {
    this.refreshed.push(1);
    return Promise.resolve();
  };
}

// the controls of one light, shared by the lights card of My room (HAS-268) - the commands they
// send, by the id of the light, and what each offers for which kind of light
describe('LightControl', () => {
  let fixture: ComponentFixture<Host>;
  let sent: string[];

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    sent = [];
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: LightApi,
          useValue: {
            turn: (id: number, on: boolean) => {
              sent.push(`${on ? 'on' : 'off'} ${id}`);
              return of(undefined);
            },
            brightness: (id: number, value: number) => {
              sent.push(`brightness ${value} ${id}`);
              return of(undefined);
            },
            color: (id: number, color: { rgb: number[]; white?: number }) => {
              sent.push(
                `color ${color.rgb.join('/')}${color.white === undefined ? '' : ' white ' + color.white} ${id}`,
              );
              return of(undefined);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Host);
  });

  afterEach(() => vi.useRealTimers());

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function control(): Promise<HTMLElement> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('app-light-control')!;
  }

  function slider(host: HTMLElement, testId: string): HTMLInputElement {
    return host.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
  }

  it('shows the light by its short name and its state, not known until the service says', async () => {
    const shown = await control();

    expect(words(shown.querySelector('.light__name'))).toBe('Light strip');
    expect(words(shown.querySelector('[data-testid="light-state"]'))).toBe('not known yet');
    expect(words(shown.querySelector('.note'))).toBe(
      'No change seen since the start of the service',
    );
  });

  it('switches the light and reads the lights back - nothing optimistic', async () => {
    const shown = await control();

    shown.querySelector<HTMLButtonElement>('[data-testid="light-on"]')!.click();
    await control();

    expect(sent).toEqual(['on 13']);
    expect(fixture.componentInstance.refreshed).toHaveLength(1);
    expect(words(shown.querySelector('[data-testid="light-state"]'))).toBe('not known yet');
  });

  it('offers brightness to a light that dims and sends it within 1 and 100', async () => {
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'rgbw',
      on: true,
      brightness: 60,
    });
    const shown = await control();
    expect(words(shown.querySelector('[data-testid="light-state"]'))).toBe('on · 60 %');

    slider(shown, 'brightness').value = '0';
    shown.querySelector<HTMLButtonElement>('[data-testid="set-brightness"]')!.click();

    expect(sent).toEqual(['brightness 1 13']);
  });

  it('offers no brightness and no colour to a relay', async () => {
    fixture.componentInstance.light.set({
      id: 3,
      name: 'Office ceiling light',
      kind: 'relay',
      on: false,
    });
    const shown = await control();

    expect(shown.querySelector('[data-testid="brightness"]')).toBeNull();
    expect(shown.querySelector('[data-testid="set-color"]')).toBeNull();
  });

  // white is offered only to a light that reported a white channel: the device tells, not the registry
  it('sends the colour chosen, with white for a light that has it', async () => {
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'rgbw',
      on: true,
      color: { rgb: [255, 120, 0], white: 10 },
    });
    const shown = await control();
    expect(shown.querySelectorAll('[data-testid^="color-"]')).toHaveLength(4);
    expect(shown.querySelector<HTMLElement>('[data-testid="chosen-color"]')!.style.background).toBe(
      'rgb(255, 120, 0)',
    );

    const blue = slider(shown, 'color-2');
    blue.value = '200';
    blue.dispatchEvent(new Event('input'));
    blue.dispatchEvent(new Event('change'));
    await control();
    shown.querySelector<HTMLButtonElement>('[data-testid="set-color"]')!.click();

    expect(sent).toEqual(['color 255/120/200 white 10 13']);
    expect(shown.querySelector<HTMLElement>('[data-testid="chosen-color"]')!.style.background).toBe(
      'rgb(255, 120, 200)',
    );
  });

  // a colour set by a rule or another hand is never shown as the one chosen here
  it('follows the colour the light reports, until a slider moves - and again after a new report', async () => {
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'rgbw',
      color: { rgb: [255, 120, 0] },
    });
    const shown = await control();
    const swatch = () =>
      shown.querySelector<HTMLElement>('[data-testid="chosen-color"]')!.style.background;

    const blue = slider(shown, 'color-2');
    blue.value = '200';
    blue.dispatchEvent(new Event('input'));
    blue.dispatchEvent(new Event('change'));
    await control();
    expect(swatch()).toBe('rgb(255, 120, 200)');

    // the same colour reported again: the choice stays
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'rgbw',
      on: true,
      color: { rgb: [255, 120, 0] },
    });
    await control();
    expect(swatch()).toBe('rgb(255, 120, 200)');

    // a new colour reported: the choice follows it
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'rgbw',
      on: true,
      color: { rgb: [0, 0, 255] },
    });
    await control();
    expect(swatch()).toBe('rgb(0, 0, 255)');
  });

  it('sends no brightness that is not a number', async () => {
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'dimmer',
      on: true,
    });
    const shown = await control();

    // a thumb without a numeric value: the browser gives NaN, the slider's own fallback aside
    const component = fixture.debugElement.query(By.directive(LightControl))
      .componentInstance as unknown as { setBrightness(value: number): void };
    component.setBrightness(Number.NaN);
    await control();

    expect(sent).toEqual([]);
    expect(shown.querySelector('[data-testid="light-failure"]')).toBeNull();
  });

  it('sends no white for a light without a white channel, and says so', async () => {
    fixture.componentInstance.light.set({
      id: 13,
      name: 'Bedroom light strip',
      kind: 'rgbw',
      color: { rgb: [0, 0, 255] },
    });
    const shown = await control();

    expect(shown.querySelectorAll('[data-testid^="color-"]')).toHaveLength(3);
    shown.querySelector<HTMLButtonElement>('[data-testid="set-color"]')!.click();

    expect(sent).toEqual(['color 0/0/255 13']);
    expect(words(shown)).toContain('This light reported no white channel.');
  });

  it('waits while a command of the room is on its way', async () => {
    fixture.componentInstance.roomBusy.set(true);
    const shown = await control();

    expect(shown.querySelector<HTMLButtonElement>('[data-testid="light-on"]')!.disabled).toBe(true);
    expect(shown.querySelector<HTMLButtonElement>('[data-testid="light-off"]')!.disabled).toBe(
      true,
    );
  });
});
