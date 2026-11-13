import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import {
  FailedSwitch,
  HeatingStatus,
  HeatingSwitchControl,
} from '../../data-access/heating/heating-api';
import { HeatingSwitch } from './heating-switch';

/** The control of the switch, every signal set by hand; `turn` only notes what was asked. */
type FakeControl = FakeResource<HeatingStatus> & {
  readonly switching: WritableSignal<boolean>;
  readonly switchFailure: WritableSignal<FailedSwitch | undefined>;
  readonly asked: boolean[];
  turn(on: boolean): void;
};

function fakeControl(): FakeControl {
  const asked: boolean[] = [];
  // checked against the real control here, where a mismatch names the field
  const control: FakeControl & HeatingSwitchControl = {
    ...fakeResource<HeatingStatus>(),
    switching: signal(false),
    switchFailure: signal<FailedSwitch | undefined>(undefined),
    asked,
    turn: (on) => void asked.push(on),
  };
  return control;
}

const ON: HeatingStatus = { isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' };
const OFF: HeatingStatus = { isHeatingEnabled: false, updatedAt: '2026-04-22T16:31:17.840868' };

describe('HeatingSwitch', () => {
  let control: FakeControl;
  let fixture: ComponentFixture<HeatingSwitch>;

  beforeEach(() => {
    control = fakeControl();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    fixture = TestBed.createComponent(HeatingSwitch);
    fixture.componentRef.setInput('control', control);
  });

  async function card(): Promise<HTMLElement> {
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function button(name: string): Promise<HTMLButtonElement | undefined> {
    return [...(await card()).querySelectorAll('button')].find((candidate) =>
      words(candidate).endsWith(name),
    );
  }

  async function press(name: string): Promise<void> {
    const found = await button(name);
    expect(found, `the button "${name}"`).toBeDefined();
    found!.click();
    await fixture.whenStable();
  }

  const state = async () => words((await card()).querySelector('[data-testid="heating-state"]'));

  it('shows a progress bar until the service has answered', async () => {
    expect((await card()).querySelector('mat-progress-bar')).toBeTruthy();
    expect(await button('Switch on')).toBeUndefined();
    expect(await button('Switch off')).toBeUndefined();
  });

  it('shows a heating that is on, since when, and offers to switch it off', async () => {
    answer(control, ON);

    expect(await state()).toBe('check_circle Enabled');
    expect(words(await card())).toContain('Switched on: 28 Sept 2026, 06:45');
    expect(await button('Switch off')).toBeDefined();
    expect(await button('Switch on')).toBeUndefined();
  });

  it('shows a heating that is off, since when, and offers to switch it on', async () => {
    answer(control, OFF);

    expect(await state()).toBe('do_not_disturb_on Disabled');
    expect(words(await card())).toContain('Switched off: 22 Apr 2026, 16:31');
    expect(await button('Switch on')).toBeDefined();
  });

  // without a state there is no "other" state to offer
  it.each([
    ['an answer without the flag', {}],
    ['a flag that is not one', { isHeatingEnabled: 'yes' }],
  ])('neither guesses nor offers a change for %s', async (_, body) => {
    answer(control, body as HeatingStatus);

    expect(await state()).toBe('');
    expect(words(await card())).toContain(
      'The service does not say whether the heating is switched on.',
    );
    expect((await card()).querySelectorAll('button')).toHaveLength(0);
  });

  describe('the confirmation', () => {
    const inWindow = async (id: string) => {
      await fixture.whenStable();
      return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    };

    // HAS-438 (owner 2026-11-13): the question is a window over the page, the card keeps its size
    it('asks in a window before it switches, and sends nothing yet', async () => {
      answer(control, ON);

      await press('Switch off');

      expect(words(await inWindow('heating-switch-question'))).toBe(
        'Switch the heating of the whole house off?',
      );
      expect(control.asked).toEqual([]);
      // the state the question is about stays in view, and the button waits for the answer
      expect(await state()).toBe('check_circle Enabled');
      expect((await button('Switch off'))!.getAttribute('aria-disabled')).toBe('true');
    });

    it('focuses "Cancel", the answer that changes nothing', async () => {
      answer(control, ON);

      await press('Switch off');

      // the DOM of the tests lays nothing out: the window focuses the element marked so
      expect((await inWindow('confirm-cancel'))!.hasAttribute('cdkfocusinitial')).toBe(true);
    });

    it('switches nothing when the answer is "Cancel"', async () => {
      answer(control, ON);
      await press('Switch off');

      (await inWindow('confirm-cancel'))!.click();
      await fixture.whenStable();

      expect(control.asked).toEqual([]);
      expect(await inWindow('heating-switch-question')).toBeNull();
      expect((await button('Switch off'))!.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('asks the service to switch off once it is confirmed', async () => {
      answer(control, ON);
      await press('Switch off');

      (await inWindow('confirm-yes'))!.click();
      await fixture.whenStable();

      expect(control.asked).toEqual([false]);
      expect(await inWindow('heating-switch-question')).toBeNull();
    });

    it('asks the service to switch on once it is confirmed', async () => {
      answer(control, OFF);
      await press('Switch on');
      expect(words(await inWindow('heating-switch-question'))).toBe(
        'Switch the heating of the whole house on?',
      );

      (await inWindow('confirm-yes'))!.click();
      await fixture.whenStable();

      expect(control.asked).toEqual([true]);
    });

    // somebody else switched while the question was open: there is nothing left to confirm
    it('closes the question when the house is already in the state asked for', async () => {
      answer(control, ON);
      await press('Switch off');

      answer(control, OFF);

      expect(await inWindow('heating-switch-question')).toBeNull();
      expect(await button('Switch on')).toBeDefined();
      expect(control.asked).toEqual([]);
    });

    // a closed question is gone: nobody pressed anything since
    it('does not bring a closed question back when the house returns to where it was', async () => {
      answer(control, ON);
      await press('Switch off');
      answer(control, OFF);
      await card();

      answer(control, ON);

      expect(await inWindow('heating-switch-question')).toBeNull();
      expect(await button('Switch off')).toBeDefined();
    });

    it('closes the question when the service stops saying what the state is', async () => {
      answer(control, ON);
      await press('Switch off');
      answer(control, {});
      await card();

      answer(control, ON);

      expect(await inWindow('heating-switch-question')).toBeNull();
    });
  });

  describe('while a change is on its way', () => {
    // no optimistic state: what is on screen is what the service last answered
    it('keeps showing the state the service gave', async () => {
      answer(control, ON);
      await press('Switch off');
      await press('Switch off');
      control.switching.set(true);

      expect(await state()).toBe('check_circle Enabled');
      expect((await card()).querySelector('mat-progress-bar')?.getAttribute('aria-label')).toBe(
        'Switching the heating',
      );
    });

    it('does not take a second change, and keeps the button where the focus is', async () => {
      answer(control, ON);
      control.switching.set(true);

      const trigger = (await button('Switch off'))!;
      trigger.click();
      await fixture.whenStable();

      expect(trigger.getAttribute('aria-disabled')).toBe('true');
      expect(trigger.disabled).toBe(false);
      expect((await card()).querySelector('[role="group"]')).toBeNull();
      expect(control.asked).toEqual([]);
    });
  });

  describe('when the change fails', () => {
    it('says what could not be done and why, next to the state the service gives', async () => {
      answer(control, ON);
      control.switchFailure.set({ on: false, error: new ApiError('server', 500) });

      const failure = (await card()).querySelector('[data-testid="switch-failure"] [role="alert"]');

      expect(words(failure)).toContain(
        'The heating could not be switched off. The service is not available right now (error 500).',
      );
      expect(await state()).toBe('check_circle Enabled');
      expect(await button('Switch off')).toBeDefined();
    });

    it('names the other direction for a failed switching on', async () => {
      answer(control, OFF);
      control.switchFailure.set({ on: true, error: new ApiError('server', 500) });

      expect(words((await card()).querySelector('[data-testid="switch-failure"]'))).toContain(
        'The heating could not be switched on.',
      );
    });

    // no answer is not a refusal: the change may have been carried out, or still be on its way
    it('does not call a change that got no answer a change that failed', async () => {
      answer(control, ON);
      control.switchFailure.set({ on: false, error: new ApiError('network', 0) });

      const failure = words((await card()).querySelector('[data-testid="switch-failure"]'));

      expect(failure).toContain('The change got no answer and may not have been carried out.');
      expect(failure).not.toContain('could not be switched');
    });

    it('stops telling a failure once the house is in the state that was asked for', async () => {
      answer(control, ON);
      control.switchFailure.set({ on: false, error: new ApiError('network', 0) });
      await card();

      answer(control, OFF);

      expect((await card()).querySelector('[data-testid="switch-failure"]')).toBeNull();
      expect(await state()).toBe('do_not_disturb_on Disabled');
    });
  });

  describe('when the state cannot be read', () => {
    it('says why, in place of the state', async () => {
      fail(control, new ApiError('server', 502));

      const shown = await card();

      expect(words(shown.querySelector('[role="alert"]'))).toContain('(error 502)');
      expect(words(shown)).not.toContain('does not say');
      expect(shown.querySelectorAll('button')).toHaveLength(0);
    });

    it('keeps the last state on screen, marked as out of date', async () => {
      answer(control, ON);
      fail(control, new ApiError('network', 0));

      const shown = await card();

      expect(await state()).toBe('check_circle Enabled');
      expect(shown.querySelector('app-data-freshness')?.classList).toContain('freshness--stale');
      expect(words(shown.querySelector('[role="alert"]'))).toContain(
        'The server cannot be reached.',
      );
    });
  });

  it('speaks Polish', async () => {
    answer(control, ON);
    await useLanguage('pl');

    expect(await state()).toBe('check_circle Włączone');
    await press('Wyłącz');
    await fixture.whenStable();
    expect(words(document.querySelector('[data-testid="heating-switch-question"]'))).toBe(
      'Wyłączyć ogrzewanie całego domu?',
    );
    expect(words(document.querySelector('[data-testid="confirm-cancel"]'))).toBe('Anuluj');
  });
});
