import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { HeatingApi, HeatingStatus } from '../../data-access/heating/heating-api';
import { HouseHeatingPage } from './house-heating-page';

const granted: Profile = {
  name: 'Celina',
  role: 'resident',
  rooms: ['bedroom'],
  permissions: ['heating_switch'],
};

// HAS-438 (owner, 2026-11-13): the switch of the heating of the whole house on a tab of its own, for a
// member the registry granted heating_switch - it was on My room before
describe('HouseHeatingPage', () => {
  let profile: WritableSignal<Profile | undefined>;
  let status: FakeResource<HeatingStatus>;
  let turned: boolean[];
  /** How many times the page asked for the switch of the house. */
  let switchesWatched: number;
  let fixture: ComponentFixture<HouseHeatingPage> | undefined;

  beforeEach(() => {
    profile = signal<Profile | undefined>(granted);
    status = fakeResource();
    turned = [];
    switchesWatched = 0;
    fixture = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile, members: signal(undefined) } },
        {
          provide: HeatingApi,
          useValue: {
            watchSwitch: () => {
              switchesWatched++;
              return {
                ...status,
                switching: signal(false),
                switchFailure: signal(undefined),
                turn: (on: boolean) => turned.push(on),
              };
            },
          },
        },
      ],
    });
  });

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function page(): Promise<HTMLElement> {
    fixture ??= TestBed.createComponent(HouseHeatingPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the switch of the house, the card shared with the heating dashboard', async () => {
    await page();
    answer(status, { isHeatingEnabled: false, updatedAt: '2026-09-28T06:45:12.840868' });

    const shown = await page();
    expect(words(shown.querySelector('h1'))).toBe('House heating');
    expect(words(shown.querySelector('[data-testid="heating-switch"]'))).toContain('Disabled');
    expect(switchesWatched).toBe(1);
  });

  it('keeps the switch for a member without a room', async () => {
    profile.set({ ...granted, rooms: [] });

    expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeTruthy();
  });

  // the route asks for the permission; a permission taken away under the open page polls nothing more
  it('takes the switch away as soon as the registry does, and gives it back', async () => {
    await page();

    profile.set({ name: 'Celina', role: 'resident', rooms: ['bedroom'] });
    expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeNull();

    profile.set(granted);
    expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeTruthy();
    expect(switchesWatched).toBe(2);
  });

  // not the role decides: an administrator switches the heating on its dashboard
  it('asks nothing for the administrator without the permission', async () => {
    profile.set({ name: 'Aurelia', role: 'admin', rooms: ['office'] });

    expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeNull();
    expect(switchesWatched).toBe(0);
  });

  it('ignores a permission it does not know', async () => {
    profile.set({
      name: 'Celina',
      role: 'resident',
      rooms: ['bedroom'],
      permissions: ['everything'],
    });

    expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeNull();
    expect(switchesWatched).toBe(0);
  });
});
