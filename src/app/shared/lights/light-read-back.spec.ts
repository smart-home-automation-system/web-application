import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LIGHTS_READ_AGAIN_AFTER_MS, lightReadBack } from './light-read-back';

// HAS-293, shared since HAS-266: a read at once and one more for an Eaton light that reports late
describe('lightReadBack', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function readBack(refresh: () => Promise<void>) {
    const owner = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const read = runInInjectionContext(owner, () => lightReadBack(refresh));
    return { read, destroy: () => owner.destroy() };
  }

  it('reads at once, and once more a moment later', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const { read } = readBack(refresh);

    await read();
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(LIGHTS_READ_AGAIN_AFTER_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('makes no second read for an owner that is gone', async () => {
    const refresh = vi.fn(() => Promise.resolve());
    const { read, destroy } = readBack(refresh);

    await read();
    destroy();
    vi.advanceTimersByTime(LIGHTS_READ_AGAIN_AFTER_MS);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
