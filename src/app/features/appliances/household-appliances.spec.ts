import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { Appliance, FailedAcknowledgement } from '../../data-access/appliance/appliance-api';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { HouseholdAppliances } from './household-appliances';

/** Thursday 8 October 2026, 14:30:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T12:30:00Z');

const DRYER: Appliance = {
  id: 62,
  name: 'Dryer',
  state: 'finished',
  finishedAt: '2026-10-08T14:05:00',
  awaitingSince: '2026-10-08T14:15:00',
};
const WASHER: Appliance = {
  id: 61,
  name: 'Washing machine',
  state: 'running',
  runningSince: '2026-10-08T13:40:00',
};
const DISHWASHER: Appliance = { id: 63, name: 'Dishwasher', state: 'idle' };

// HAS-282: the appliances of the household - on the appliances page of every member since HAS-438
// (they were on My room before), with "Emptied" for a finished one
describe('HouseholdAppliances', () => {
  let profile: WritableSignal<Profile | undefined>;
  let appliances: FakeResource<readonly Appliance[] | null>;
  let acknowledged: string[];
  const acknowledgeFailure = signal<FailedAcknowledgement | undefined>(undefined);
  let fixture: ComponentFixture<HouseholdAppliances> | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    profile = signal<Profile | undefined>({ name: 'Celina', role: 'resident', rooms: ['bedroom'] });
    appliances = fakeResource();
    acknowledged = [];
    acknowledgeFailure.set(undefined);
    fixture = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile, members: signal(undefined) } },
        {
          provide: ApplianceStore,
          useFactory: () => ({
            appliances: {
              ...appliances,
              acknowledging: signal(undefined),
              acknowledgeFailure,
              acknowledge: (id: number, member?: string) => acknowledged.push(`${id} by ${member}`),
            },
          }),
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function card(): Promise<HTMLElement | null> {
    fixture ??= TestBed.createComponent(HouseholdAppliances);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="appliances"]');
  }

  it('lists every appliance with its state', async () => {
    await card();
    answer(appliances, [WASHER, DRYER, DISHWASHER]);

    const rows = [...(await card())!.querySelectorAll('.appliance')].map(words);
    expect(rows).toEqual([
      'Washing machine Running Running since 13:40',
      'Dryer Finished - waits to be emptied Finished at 14:05 Emptied',
      'Dishwasher Idle',
    ]);
  });

  it('offers "Emptied" for the finished one only, and sends it', async () => {
    await card();
    answer(appliances, [WASHER, DRYER, DISHWASHER]);

    const buttons = [...(await card())!.querySelectorAll('button')];
    expect(buttons.map(words)).toEqual(['Emptied']);
    buttons[0].click();

    // HAS-347: as the member of the profile, whom the household messages then name
    expect(acknowledged).toEqual(['62 by Celina']);
  });

  // HAS-348: also while it is finishing - emptied before the message came
  it('offers "Emptied" for one that is finishing, and sends it', async () => {
    await card();
    answer(appliances, [{ ...WASHER, state: 'finishing' }, DISHWASHER]);

    const rows = [...(await card())!.querySelectorAll('.appliance')].map(words);
    expect(rows).toEqual([
      'Washing machine Finishing Running since 13:40 Emptied',
      'Dishwasher Idle',
    ]);
    (await card())!.querySelector<HTMLButtonElement>('button')!.click();

    expect(acknowledged).toEqual(['61 by Celina']);
  });

  it('tells a refused acknowledgement next to the appliance', async () => {
    await card();
    answer(appliances, [DRYER]);
    acknowledgeFailure.set({
      id: 62,
      error: new ApiError('client', 409, [
        { message: 'Nothing to acknowledge', code: 'NOTHING_TO_ACKNOWLEDGE' },
      ]),
    });

    expect(words((await card())!.querySelector('[data-appliance="62"] [role="alert"]'))).toContain(
      'Nothing waits to be emptied any more.',
    );
  });

  it('words an acknowledgement without an answer as one that may have been carried out', async () => {
    await card();
    answer(appliances, [DRYER]);
    acknowledgeFailure.set({ id: 62, error: new ApiError('network', 0) });

    expect(words((await card())!.querySelector('[data-appliance="62"] [role="alert"]'))).toContain(
      'may have been marked all the same',
    );
  });

  // an acknowledgement without an answer that was carried out: the list read again says so
  it('lets the failure go once the list shows the appliance emptied', async () => {
    await card();
    answer(appliances, [DRYER]);
    acknowledgeFailure.set({ id: 62, error: new ApiError('network', 0) });
    answer(appliances, [{ id: 62, name: 'Dryer', state: 'idle' }]);

    expect((await card())!.querySelector('[data-appliance="62"] [role="alert"]')).toBeNull();
  });

  it('shows no card for a household without appliances, nor while the first answer is on its way', async () => {
    expect(await card()).toBeNull();

    answer(appliances, []);
    expect(await card()).toBeNull();
  });

  it('tells a failure before any answer', async () => {
    await card();
    fail(appliances, new ApiError('server', 502));

    expect((await card())!.querySelector('[role="alert"]')).not.toBeNull();
  });
});
