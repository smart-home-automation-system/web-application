import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { ProfileStore } from '../../core/profile/profile-store';
import {
  DevicePushFailure,
  DevicePushState,
  PushSubscriptionStore,
} from '../../core/push/push-subscription-store';
import { DeviceNotifications, PUSH_ERROR_TEXTS } from './device-notifications';

describe('DeviceNotifications', () => {
  let fixture: ComponentFixture<DeviceNotifications>;
  const state = signal<DevicePushState>('checking');
  const busy = signal(false);
  const failure = signal<DevicePushFailure | undefined>(undefined);
  const enable = vi.fn(() => Promise.resolve());
  const disable = vi.fn(() => Promise.resolve());

  beforeEach(async () => {
    state.set('checking');
    busy.set(false);
    failure.set(undefined);
    enable.mockClear();
    disable.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideRouter([]),
        { provide: PushSubscriptionStore, useValue: { state, busy, failure, enable, disable } },
        { provide: ProfileStore, useValue: { profile: signal({ name: 'Ola' }) } },
      ],
    });
    fixture = TestBed.createComponent(DeviceNotifications);
    await fixture.whenStable();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return (host().textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function toggle(): HTMLButtonElement | null {
    return host().querySelector('[data-testid="push-switch"] button');
  }

  async function show(next: DevicePushState): Promise<void> {
    state.set(next);
    await fixture.whenStable();
  }

  it('shows a progress bar while the device is asked', () => {
    expect(host().querySelector('mat-progress-bar')).toBeTruthy();
    expect(toggle()).toBeNull();
  });

  it('offers the switch, off, and switches on with a tap', async () => {
    await show('off');

    expect(text()).toContain('Notify me on this device');
    expect(toggle()!.getAttribute('aria-checked')).toBe('false');
    toggle()!.click();

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('shows the switch on, and switches off with a tap', async () => {
    await show('on');

    expect(toggle()!.getAttribute('aria-checked')).toBe('true');
    toggle()!.click();

    expect(disable).toHaveBeenCalledTimes(1);
  });

  // the icon opens the address it was added from: it has to be added from the personal link
  it('leads an iPhone tab to the personal link instead of the switch', async () => {
    await show('install');

    expect(toggle()).toBeNull();
    expect(text()).toContain('Open your personal link');
    expect(host().querySelector('[data-testid="personal-link"]')!.getAttribute('href')).toBe(
      '/u/Ola',
    );
  });

  it('words a browser without push, a house without a key and blocked notifications', async () => {
    await show('unsupported');
    expect(text()).toContain('This browser cannot show notifications');

    await show('unconfigured');
    expect(text()).toContain('the server has no key');

    await show('denied');
    expect(text()).toContain('Allow them in the settings of the device');
    expect(toggle()).toBeNull();
  });

  it('tells what the registry refused in its own words', async () => {
    await show('off');
    failure.set({
      kind: 'api',
      error: new ApiError('client', 409, [{ message: 'x', code: 'MEMBER_SWITCHED_OFF' }]),
    });
    await fixture.whenStable();

    expect(host().querySelector('[role="alert"]')!.textContent).toContain(
      'Your profile is switched off in the household',
    );
  });

  it('tells a device that did not set them up', async () => {
    await show('off');
    failure.set({ kind: 'browser' });
    await fixture.whenStable();

    expect(host().querySelector('[role="alert"]')!.textContent).toContain(
      'The device did not set up the notifications',
    );
  });

  it('speaks Polish', async () => {
    await show('off');
    await useLanguage('pl');
    await fixture.whenStable();

    expect(text()).toContain('Powiadomienia na tym urządzeniu');
    expect(text()).toContain('Powiadamiaj mnie na tym urządzeniu');
  });

  // a renamed or new code of database-service needs a text here
  it('has a text for every refusal it words', () => {
    expect(Object.keys(PUSH_ERROR_TEXTS)).toEqual([
      'MEMBER_SWITCHED_OFF',
      'NOT_FOUND_HOUSEHOLD_MEMBER',
    ]);
  });
});
