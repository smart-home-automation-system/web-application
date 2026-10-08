import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';

import { AppUpdate } from './app-update';

describe('AppUpdate', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>;
  let checkForUpdate: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

  function create(worker: 'enabled' | 'disabled' | 'none' = 'enabled'): AppUpdate {
    TestBed.configureTestingModule({
      providers:
        worker === 'none'
          ? []
          : [
              {
                provide: SwUpdate,
                useValue: {
                  isEnabled: worker === 'enabled',
                  versionUpdates,
                  unrecoverable,
                  checkForUpdate,
                },
              },
            ],
    });
    return TestBed.inject(AppUpdate);
  }

  function comeBack(state: DocumentVisibilityState): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
  }

  const version = (hash: string) => ({ hash });

  beforeEach(() => {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    checkForUpdate = vi.fn(() => Promise.resolve(false));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('has nothing to tell at the start', () => {
    expect(create().available()).toBe(false);
  });

  it('tells once a newer version is downloaded - not while it is on its way', () => {
    const update = create();

    versionUpdates.next({ type: 'VERSION_DETECTED', version: version('b') });
    versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED', version: version('a') });
    expect(update.available()).toBe(false);

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: version('a'),
      latestVersion: version('b'),
    });
    expect(update.available()).toBe(true);
  });

  it('does not offer a version whose download failed', () => {
    const update = create();

    versionUpdates.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: version('b'),
      error: 'no network',
    });

    expect(update.available()).toBe(false);
  });

  it('asks for a reload when the version in the browser can no longer repair itself', () => {
    const update = create();

    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'a file is gone' });

    expect(update.available()).toBe(true);
  });

  // an installed application is brought back from the background, hardly ever loaded
  it('asks the server for a new version when the page comes back into view', () => {
    create();
    expect(checkForUpdate).not.toHaveBeenCalled();

    comeBack('hidden');
    expect(checkForUpdate).not.toHaveBeenCalled();

    comeBack('visible');
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('asks once an hour while the page stays in view', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    create();

    vi.advanceTimersByTime(3_599_999);
    expect(checkForUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3_600_000);
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('survives a server that cannot be asked', async () => {
    checkForUpdate.mockRejectedValue(new Error('offline'));
    const update = create();

    comeBack('visible');
    await vi.advanceTimersByTimeAsync(0);

    expect(update.available()).toBe(false);
  });

  it('stops asking with the application', () => {
    create();
    TestBed.resetTestingModule();

    comeBack('visible');
    vi.advanceTimersByTime(3_600_000);

    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'none'] as const)('stays silent without a service worker (%s)', (worker) => {
    const update = create(worker);

    comeBack('visible');
    vi.advanceTimersByTime(3_600_000);
    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: version('a'),
      latestVersion: version('b'),
    });

    expect(checkForUpdate).not.toHaveBeenCalled();
    expect(update.available()).toBe(false);
  });

  it('reloads the page on request', () => {
    const reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: { location: { reload } } }],
    });

    TestBed.inject(AppUpdate).reload();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
