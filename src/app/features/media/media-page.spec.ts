import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting } from '../../../testing/i18n';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { MediaPage } from './media-page';

const granted: Profile = {
  name: 'Celina',
  role: 'resident',
  rooms: ['bedroom'],
  permissions: ['amplifier_unlock'],
};

// HAS-517 (owner, 2026-11-27): the page of media-service, built as the heating of the house - the unlock of the
// amplifier for a member the registry granted amplifier_unlock, whatever the role
describe('MediaPage', () => {
  let profile: WritableSignal<Profile | undefined>;
  let fixture: ComponentFixture<MediaPage> | undefined;

  beforeEach(() => {
    profile = signal<Profile | undefined>(granted);
    fixture = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProfileStore, useValue: { profile, members: signal(undefined) } },
      ],
    });
  });

  async function page(): Promise<HTMLElement> {
    fixture ??= TestBed.createComponent(MediaPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const card = async () => (await page()).querySelector('[data-testid="amplifier"]');

  it('is named after the service and shows the unlock of the amplifier', async () => {
    expect((await page()).querySelector('h1')?.textContent?.trim()).toBe('Media');
    expect(await card()).toBeTruthy();
  });

  it('takes the card away as soon as the registry takes the permission, and gives it back', async () => {
    await page();

    profile.set({ name: 'Celina', role: 'resident', rooms: ['bedroom'] });
    expect(await card()).toBeNull();

    profile.set(granted);
    expect(await card()).toBeTruthy();
  });

  // a member without the permission sees no card (a DoD item of HAS-517) - the administrator neither
  it.each<Profile>([
    { name: 'Borys', role: 'resident', rooms: ['loft'] },
    { name: 'Aurelia', role: 'admin', rooms: ['office'] },
    { name: 'Celina', role: 'resident', rooms: ['bedroom'], permissions: ['heating_switch'] },
    { name: 'Emil', role: 'resident', rooms: [], permissions: ['everything'] },
  ])('shows no card to $name without the permission', async (without) => {
    profile.set(without);

    expect(await card()).toBeNull();
  });
});
