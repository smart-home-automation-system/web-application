import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

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
    refresh: () => undefined,
  };
  let fixture: ComponentFixture<Overview>;

  beforeEach(() => {
    value.set(undefined);
    error.set(undefined);
    loading.set(true);
    stale.set(false);
    lastUpdated.set(undefined);
    TestBed.configureTestingModule({
      providers: [{ provide: HeatingApi, useValue: { watchStatus: () => resource } }],
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
    expect(content).toContain('Sep 28, 2026');
    expect(content).toContain('6:45');
    expect(fixture.nativeElement.querySelector('mat-progress-bar')).toBeNull();
  });

  it('shows a disabled heating system', async () => {
    value.set({ isHeatingEnabled: false });
    loading.set(false);

    expect(await text()).toContain('Disabled');
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
    expect(content).toContain('Out of date');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('explains a failure when nothing was ever received', async () => {
    error.set(new ApiError('server', 502));
    loading.set(false);
    stale.set(true);

    const content = await text();

    expect(content).toContain('502');
    expect(content).toContain('No data received');
  });
});
