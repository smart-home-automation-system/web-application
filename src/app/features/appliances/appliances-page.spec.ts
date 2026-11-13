import { Component, WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';

import { provideI18nTesting } from '../../../testing/i18n';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { AppliancesPage } from './appliances-page';

@Component({ selector: 'app-household-appliances', template: '<p>household appliances</p>' })
class HouseholdAppliancesStub {}

@Component({ selector: 'app-my-chores', template: '<p>my chores</p>' })
class MyChoresStub {}

// the strip of its calls first, then the cards of every member the page gives it (owner 2026-11-13)
@Component({
  selector: 'app-appliances',
  template: '<p class="strip">sources</p><ng-content /><p>tuning of the appliances</p>',
})
class AppliancesStub {}

// HAS-438 (owner, 2026-11-13): one appliances page for every member - the appliances and the chores for
// all, what tunes the thresholds for the administrator alone, never even created for a resident (it
// reads the device registry and the cycles)
describe('AppliancesPage', () => {
  let profile: WritableSignal<Profile | undefined>;

  beforeEach(() => {
    profile = signal<Profile | undefined>({ name: 'Borys', role: 'resident', rooms: ['loft'] });
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile, members: signal(undefined) } },
      ],
    });
    TestBed.overrideComponent(AppliancesPage, {
      set: {
        imports: [
          NgTemplateOutlet,
          TranslocoDirective,
          HouseholdAppliancesStub,
          MyChoresStub,
          AppliancesStub,
        ],
      },
    });
  });

  async function page(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AppliancesPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a resident the appliances and their chores, and nothing that tunes them', async () => {
    const shown = await page();

    expect(shown.querySelector('h1')?.textContent?.trim()).toBe('Appliances');
    expect(shown.querySelector('app-household-appliances')).not.toBeNull();
    expect(shown.querySelector('app-my-chores')).not.toBeNull();
    expect(shown.querySelector('app-appliances')).toBeNull();
  });

  it('adds for the administrator what tunes the thresholds', async () => {
    profile.set({ name: 'Aurelia', role: 'admin', rooms: ['office'] });
    const shown = await page();

    expect(shown.querySelector('app-household-appliances')).not.toBeNull();
    expect(shown.querySelector('app-my-chores')).not.toBeNull();
    expect(shown.querySelector('app-appliances')).not.toBeNull();
    // the strip of the calls of the page above the cards of every member
    const strip = shown.querySelector('.strip')!;
    const household = shown.querySelector('app-household-appliances')!;
    expect(strip.compareDocumentPosition(household) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
