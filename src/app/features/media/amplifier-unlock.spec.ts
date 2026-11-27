import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { provideI18nTesting } from '../../../testing/i18n';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { Ticker } from '../../core/time/ticker';
import { AMPLIFIER_OUTCOME_SHOWN_MS, AmplifierUnlock } from './amplifier-unlock';

const CELINA: Profile = {
  name: 'Celina',
  role: 'resident',
  rooms: ['bedroom'],
  permissions: ['amplifier_unlock'],
};
const UNLOCK = '/home/media/amplifier/unlock';

// HAS-517: the unlock of the amplifier - one press after a question is one POST, told from its own answer
describe('AmplifierUnlock', () => {
  let profile: WritableSignal<Profile | undefined>;
  /** The shared clock, moved by hand. */
  let now: WritableSignal<number>;
  let http: HttpTestingController;
  let fixture: ComponentFixture<AmplifierUnlock>;

  beforeEach(() => {
    profile = signal<Profile | undefined>(CELINA);
    now = signal(Date.now());
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ProfileStore, useValue: { profile, members: signal(undefined) } },
        { provide: Ticker, useValue: { now } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AmplifierUnlock);
  });

  afterEach(() => http.verify());

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function card(): Promise<HTMLElement> {
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  async function button(): Promise<HTMLButtonElement> {
    return (await card()).querySelector<HTMLButtonElement>('[data-testid="amplifier-unlock"]')!;
  }

  const inWindow = async (id: string) => {
    await fixture.whenStable();
    return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  };

  async function confirmUnlock(): Promise<void> {
    (await button()).click();
    (await inWindow('confirm-yes'))!.click();
    await fixture.whenStable();
  }

  it('says what the unlock is for and offers it', async () => {
    expect(words((await card()).querySelector('mat-card-title'))).toBe('Amplifier');
    expect(words(await card())).toContain('After a power cut the amplifier hangs');
    expect(words(await button())).toContain('Unlock the amplifier');
    // nothing is read: the amplifier has no state
    http.expectNone(() => true);
  });

  it('asks in a window first, the safe answer focused, and sends nothing yet', async () => {
    (await button()).click();

    expect(words(await inWindow('amplifier-question'))).toBe(
      'Send the amplifier the file that unhangs it? Do it only when the amplifier does not answer.',
    );
    expect((await inWindow('confirm-cancel'))!.hasAttribute('cdkfocusinitial')).toBe(true);
    expect((await button()).getAttribute('aria-disabled')).toBe('true');
    http.expectNone(UNLOCK);
  });

  it('sends nothing for "Do not unlock"', async () => {
    (await button()).click();
    (await inWindow('confirm-cancel'))!.click();
    await fixture.whenStable();

    http.expectNone(UNLOCK);
    expect(await inWindow('amplifier-question')).toBeNull();
    expect((await button()).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('sends the unlock once with the member of the profile, and tells the answer', async () => {
    await confirmUnlock();

    const request = http.expectOne((call) => call.url === UNLOCK);
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('source')).toBe('dashboard');
    expect(request.request.params.get('member')).toBe('Celina');
    // one unlock at a time: the button waits for the answer
    expect((await card()).querySelector('[data-testid="amplifier-sending"]')).toBeTruthy();
    expect((await card()).querySelector('[data-testid="amplifier-when"]')).toBeNull();
    expect((await button()).getAttribute('aria-disabled')).toBe('true');
    (await button()).click();
    expect(await inWindow('amplifier-question')).toBeNull();

    request.flush(null, { status: 202, statusText: 'Accepted' });

    expect(words((await card()).querySelector('[data-testid="amplifier-sent"]'))).toContain(
      'The amplifier took the file',
    );
    expect((await button()).getAttribute('aria-disabled')).not.toBe('true');
    // when it was pressed, so an outcome left on an open page is never read as news
    expect(words((await card()).querySelector('[data-testid="amplifier-when"]'))).toMatch(
      /^Pressed: /,
    );
  });

  // owner, 2026-11-27: an outcome left on the card would mislead whoever comes for the next unlock
  it('tells the outcome for a minute, then leaves the card as before the press', async () => {
    await confirmUnlock();
    http
      .expectOne((call) => call.url === UNLOCK)
      .flush(null, { status: 202, statusText: 'Accepted' });
    expect((await card()).querySelector('[data-testid="amplifier-sent"]')).toBeTruthy();

    now.set(Date.now() + AMPLIFIER_OUTCOME_SHOWN_MS - 5_000);
    expect((await card()).querySelector('[data-testid="amplifier-sent"]')).toBeTruthy();

    now.set(Date.now() + AMPLIFIER_OUTCOME_SHOWN_MS + 1_000);
    expect((await card()).querySelector('[data-testid="amplifier-sent"]')).toBeNull();
    expect((await card()).querySelector('[data-testid="amplifier-when"]')).toBeNull();
    expect((await button()).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('lets a failure go after a minute too', async () => {
    await confirmUnlock();
    http.expectOne((call) => call.url === UNLOCK).error(new ProgressEvent('error'));
    expect((await card()).querySelector('[role="alert"]')).toBeTruthy();

    now.set(Date.now() + AMPLIFIER_OUTCOME_SHOWN_MS + 1_000);
    expect((await card()).querySelector('[role="alert"]')).toBeNull();
  });

  it('words a refusal of the service by its code', async () => {
    await confirmUnlock();

    http
      .expectOne((call) => call.url === UNLOCK)
      .flush(
        {
          errors: [{ message: 'The amplifier did not answer in time', code: 'AMPLIFIER_TIMEOUT' }],
        },
        { status: 504, statusText: 'Gateway Timeout' },
      );

    expect(words((await card()).querySelector('[role="alert"]'))).toContain(
      'The amplifier did not answer in time - it may have taken the file.',
    );
    expect((await card()).querySelector('[data-testid="amplifier-sent"]')).toBeNull();
  });

  it('tells an unlock without an answer as one that may have been carried out', async () => {
    await confirmUnlock();

    http.expectOne((call) => call.url === UNLOCK).error(new ProgressEvent('error'));

    expect(words((await card()).querySelector('[role="alert"]'))).toContain(
      'the unlock may have been carried out',
    );
  });

  // a question asked for one member is never sent for another
  it('sends nothing when the profile changed while the question was open', async () => {
    (await button()).click();
    profile.set({ ...CELINA, name: 'Aurelia' });
    (await inWindow('confirm-yes'))!.click();
    await fixture.whenStable();

    http.expectNone(UNLOCK);
    // the question is gone, nothing is on its way and nothing is told
    expect(await inWindow('amplifier-question')).toBeNull();
    expect((await card()).querySelector('[data-testid="amplifier-sending"]')).toBeNull();
    expect((await card()).querySelector('[data-testid="amplifier-sent"]')).toBeNull();
  });

  it('closes its question with the card', async () => {
    (await button()).click();
    expect(await inWindow('amplifier-question')).toBeTruthy();

    fixture.destroy();
    await new Promise((resolve) => setTimeout(resolve));

    expect(document.querySelector('[data-testid="amplifier-question"]')).toBeNull();
    http.expectNone(UNLOCK);
  });
});
