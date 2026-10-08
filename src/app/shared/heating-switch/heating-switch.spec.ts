import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

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
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
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
    it('asks before it switches, and sends nothing yet', async () => {
      answer(control, ON);

      await press('Switch off');

      const question = (await card()).querySelector('[role="group"]')!;
      expect(words(question)).toContain('Switch the heating of the whole house off?');
      expect(question.getAttribute('aria-labelledby')).toBe(question.querySelector('p')?.id);
      expect(control.asked).toEqual([]);
      // the state the question is about stays in view
      expect(await state()).toBe('check_circle Enabled');
    });

    it('moves the focus to "Cancel", the answer that changes nothing', async () => {
      answer(control, ON);

      await press('Switch off');

      expect(document.activeElement).toBe(await button('Cancel'));
    });

    it('switches nothing when the answer is "Cancel", and gives the focus back', async () => {
      answer(control, ON);
      await press('Switch off');

      await press('Cancel');

      expect(control.asked).toEqual([]);
      expect((await card()).querySelector('[role="group"]')).toBeNull();
      expect(document.activeElement).toBe(await button('Switch off'));
    });

    it('asks the service to switch off once it is confirmed', async () => {
      answer(control, ON);
      await press('Switch off');

      // the second button of that name: the one inside the question
      await press('Switch off');

      expect(control.asked).toEqual([false]);
      expect((await card()).querySelector('[role="group"]')).toBeNull();
    });

    it('asks the service to switch on once it is confirmed', async () => {
      answer(control, OFF);
      await press('Switch on');
      expect(words((await card()).querySelector('[role="group"]'))).toContain(
        'Switch the heating of the whole house on?',
      );

      await press('Switch on');

      expect(control.asked).toEqual([true]);
    });

    // somebody else switched while the question was open: there is nothing left to confirm
    it('drops the question when the house is already in the state asked for', async () => {
      answer(control, ON);
      await press('Switch off');

      answer(control, OFF);

      expect((await card()).querySelector('[role="group"]')).toBeNull();
      expect(await button('Switch on')).toBeDefined();
      expect(control.asked).toEqual([]);
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
      control.switchFailure.set({ on: true, error: new ApiError('network', 0) });

      expect(words((await card()).querySelector('[data-testid="switch-failure"]'))).toContain(
        'The heating could not be switched on. The server cannot be reached.',
      );
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
    expect(words((await card()).querySelector('[role="group"]'))).toContain(
      'Wyłączyć ogrzewanie całego domu?',
    );
    expect(await button('Anuluj')).toBeDefined();
  });
});
