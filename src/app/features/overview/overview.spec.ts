import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { PollingResource } from '../../core/api/polling-resource';
import { HeatingApi, HeatingStatus } from '../../data-access/heating/heating-api';
import { Overview } from './overview';

describe('Overview', () => {
  const value = signal<HeatingStatus | undefined>(undefined);
  const error = signal<ApiError | undefined>(undefined);
  const loading = signal(true);
  const stale = signal(false);
  const lastUpdated = signal<number | undefined>(undefined);
  const resource: PollingResource<HeatingStatus> = {
    value,
    error,
    loading,
    stale,
    lastUpdated,
    refresh: () => Promise.resolve(),
  };
  let fixture: ComponentFixture<Overview>;

  beforeEach(() => {
    value.set(undefined);
    error.set(undefined);
    loading.set(true);
    stale.set(false);
    lastUpdated.set(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: HeatingApi, useValue: { watchStatus: () => resource } },
      ],
    });
    fixture = TestBed.createComponent(Overview);
  });

  async function text(): Promise<string> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('shows a progress bar until the first answer', async () => {
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('mat-progress-bar')).toBeTruthy();
  });

  it('shows an enabled heating system with the house time of the change', async () => {
    value.set({ isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' });
    loading.set(false);
    lastUpdated.set(Date.now());

    const content = await text();

    expect(content).toContain('Enabled');
    expect(content).toContain('Switched on: 28 Sept 2026, 06:45');
    expect(content).toContain('Updated just now');
    expect(fixture.nativeElement.querySelector('mat-progress-bar')).toBeNull();
  });

  it('shows a disabled heating system', async () => {
    value.set({ isHeatingEnabled: false, updatedAt: '2026-04-22T16:31:17.840868' });
    loading.set(false);

    const content = await text();

    expect(content).toContain('Disabled');
    expect(content).toContain('Switched off: 22 Apr 2026, 16:31');
  });

  it('leaves the time of the change out when the backend does not send it', async () => {
    value.set({ isHeatingEnabled: true });
    loading.set(false);

    expect(await text()).not.toContain('Switched');
  });

  it('explains a failure and keeps the last known state next to it', async () => {
    value.set({ isHeatingEnabled: true });
    error.set(new ApiError('network', 0));
    loading.set(false);
    stale.set(true);
    lastUpdated.set(Date.now());

    const content = await text();

    expect(content).toContain('Enabled');
    expect(content).toContain('cannot be reached');
    expect(content).toContain('Out of date - last update just now');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('explains a failure when nothing was ever received', async () => {
    error.set(new ApiError('server', 502));
    loading.set(false);
    stale.set(true);

    const content = await text();

    expect(content).toContain('(error 502)');
    expect(content).toContain('No data received');
  });

  it('shows the age of the data once it is worth a number', async () => {
    value.set({ isHeatingEnabled: true });
    loading.set(false);
    lastUpdated.set(Date.now() - 3 * 60_000);

    expect(await text()).toMatch(/Updated 3 min\.? ago/);
  });

  describe('in Polish', () => {
    it('translates the tile, the date and the age of the data', async () => {
      value.set({ isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' });
      loading.set(false);
      lastUpdated.set(Date.now() - 3 * 60_000);
      await fixture.whenStable();

      await useLanguage('pl');
      const content = await text();

      expect(content).toContain('Ogrzewanie');
      expect(content).toContain('Włączone');
      expect(content).toContain('Włączono: 28 wrz 2026, 06:45');
      expect(content).toContain('Zaktualizowano 3 min temu');
      expect(content).not.toContain('Heating');
    });

    it('translates a failure, with the status inside the sentence', async () => {
      error.set(new ApiError('server', 502));
      loading.set(false);
      stale.set(true);

      await useLanguage('pl');
      const content = await text();

      expect(content).toContain('Usługa jest teraz niedostępna (błąd 502).');
      expect(content).toContain('Brak danych');
    });

    it('shows what the backend said as it is: the backend speaks English only', async () => {
      error.set(new ApiError('client', 400, [{ message: 'Room {{ message }} is unknown.' }]));
      loading.set(false);
      stale.set(true);

      await useLanguage('pl');

      // word for word, braces included: the backend's text is not searched for placeholders
      expect(await text()).toContain('Room {{ message }} is unknown.');
    });

    it('translates the label of the progress bar', async () => {
      await useLanguage('pl');
      await fixture.whenStable();

      expect(
        fixture.nativeElement.querySelector('mat-progress-bar')?.getAttribute('aria-label'),
      ).toBe('Wczytywanie stanu ogrzewania');
    });
  });
});
