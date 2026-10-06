import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';

import { ApiError } from './api-error';
import { PollingResource, pollingResource } from './polling-resource';

describe('pollingResource', () => {
  let owner: EnvironmentInjector;
  let ownerDestroyed: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    // stands for the component that owns the resource: destroying it must stop the polling
    owner = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    ownerDestroyed = false;
  });

  afterEach(() => {
    destroyOwner();
    vi.useRealTimers();
  });

  function destroyOwner(): void {
    if (!ownerDestroyed) {
      owner.destroy();
      ownerDestroyed = true;
    }
  }

  function create<T>(load: () => Observable<T>, intervalMs = 1_000): PollingResource<T> {
    return owner.runInContext(() => pollingResource(load, { intervalMs }));
  }

  it('loads at once and then at every interval', () => {
    const load = vi.fn(() => of('value'));

    const resource = create(load);
    vi.advanceTimersByTime(0);

    expect(load).toHaveBeenCalledTimes(1);
    expect(resource.value()).toBe('value');
    expect(resource.loading()).toBe(false);
    expect(resource.lastUpdated()).toBe(Date.now());

    vi.advanceTimersByTime(3_000);

    expect(load).toHaveBeenCalledTimes(4);
  });

  it('is loading until the first answer', () => {
    const answers = new Subject<string>();

    const resource = create(() => answers);
    vi.advanceTimersByTime(0);

    expect(resource.loading()).toBe(true);
    expect(resource.value()).toBeUndefined();

    answers.next('value');

    expect(resource.loading()).toBe(false);
  });

  it('keeps the last value when a later call fails, and reports the failure', () => {
    let fail = false;
    const resource = create(() => (fail ? throwError(() => new ApiError('server', 502)) : of(1)));
    vi.advanceTimersByTime(0);

    fail = true;
    vi.advanceTimersByTime(1_000);

    expect(resource.value()).toBe(1);
    expect(resource.error()?.status).toBe(502);
    expect(resource.stale()).toBe(true);

    fail = false;
    vi.advanceTimersByTime(1_000);

    expect(resource.error()).toBeUndefined();
    expect(resource.stale()).toBe(false);
  });

  it('stops loading when the first call fails', () => {
    const resource = create(() => throwError(() => new TypeError('not an api error')));
    vi.advanceTimersByTime(0);

    expect(resource.loading()).toBe(false);
    expect(resource.value()).toBeUndefined();
    expect(resource.error()?.kind).toBe('unexpected');
  });

  it('survives a failure: the next interval calls again', () => {
    const load = vi.fn(() => throwError(() => new ApiError('network', 0)));

    create(load);
    vi.advanceTimersByTime(2_000);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it('survives a loader that throws before it returns its observable', () => {
    let broken = true;
    const resource = create<string>(() => {
      if (broken) {
        throw new TypeError('thrown while building the request');
      }
      return of('value');
    });
    vi.advanceTimersByTime(0);

    expect(resource.loading()).toBe(false);
    expect(resource.error()?.kind).toBe('unexpected');

    broken = false;
    vi.advanceTimersByTime(1_000);

    expect(resource.value()).toBe('value');
    expect(resource.error()).toBeUndefined();
  });

  it('does not start a call while the previous one is still running', () => {
    const load = vi.fn(() => NEVER);

    create(load);
    vi.advanceTimersByTime(5_000);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('makes no calls while the tab is hidden and calls at once when it is back', () => {
    const load = vi.fn(() => of('value'));
    create(load);
    vi.advanceTimersByTime(0);

    setVisibility('hidden');
    vi.advanceTimersByTime(10_000);

    expect(load).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    vi.advanceTimersByTime(0);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('turns stale when the value was not refreshed for too long', () => {
    const resource = create(() => of('value'));
    vi.advanceTimersByTime(0);

    expect(resource.stale()).toBe(false);

    setVisibility('hidden');
    vi.advanceTimersByTime(60_000);

    expect(resource.stale()).toBe(true);
  });

  it('refresh calls now, restarts the interval and drops the answer on its way', () => {
    const first = new Subject<string>();
    const load = vi
      .fn<() => Observable<string>>()
      .mockReturnValueOnce(first)
      .mockReturnValue(of('fresh'));
    const resource = create(load);
    vi.advanceTimersByTime(0);

    resource.refresh();
    vi.advanceTimersByTime(0);
    first.next('late answer of the dropped call');

    expect(load).toHaveBeenCalledTimes(2);
    expect(resource.value()).toBe('fresh');

    vi.advanceTimersByTime(999);
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('stops polling when its owner is destroyed', () => {
    const load = vi.fn(() => of('value'));
    create(load);
    vi.advanceTimersByTime(0);

    destroyOwner();
    vi.advanceTimersByTime(10_000);

    expect(load).toHaveBeenCalledTimes(1);
  });
});

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}
