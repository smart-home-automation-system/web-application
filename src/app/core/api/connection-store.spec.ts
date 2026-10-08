import { TestBed } from '@angular/core/testing';

import { ApiError } from './api-error';
import { ConnectionStore } from './connection-store';

const STORAGE_KEY = 'smart-home.last-contact';
const NOON = Date.parse('2026-10-08T12:00:00Z');

describe('ConnectionStore', () => {
  function create(): ConnectionStore {
    return TestBed.inject(ConnectionStore);
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers({ now: NOON });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('starts within reach, with no contact to speak of', () => {
    const store = create();

    expect(store.offline()).toBe(false);
    expect(store.lastContact()).toBeUndefined();
  });

  it('starts out of reach on a device that is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(create().offline()).toBe(true);
  });

  it('is out of reach after a call that got no answer', () => {
    const store = create();

    store.failed(new ApiError('network', 0));

    expect(store.offline()).toBe(true);
  });

  // an answer, whatever it says, came from the house: what failed is for the view to tell
  it.each([
    ['a failing service', new ApiError('server', 502)],
    ['a refusal', new ApiError('client', 404)],
  ])('is within reach again after %s answered', (_, answer) => {
    const store = create();
    store.failed(new ApiError('network', 0));

    store.failed(answer);

    expect(store.offline()).toBe(false);
    expect(store.lastContact()).toBeUndefined();
  });

  // the captive page of a foreign network answers for every address
  it.each([new ApiError('invalid-response', 200), new ApiError('unexpected', 0)])(
    'concludes nothing from an answer that is not the API ($kind)',
    (answer) => {
      const store = create();

      store.failed(answer);
      expect(store.offline()).toBe(false);

      store.failed(new ApiError('network', 0));
      store.failed(answer);
      expect(store.offline()).toBe(true);
    },
  );

  it('is within reach after a call that succeeded, and knows when that was', () => {
    const store = create();
    store.failed(new ApiError('network', 0));

    store.succeeded();

    expect(store.offline()).toBe(false);
    expect(store.lastContact()).toBe(NOON);
  });

  it('keeps the time of the last success through the failures after it', () => {
    const store = create();
    store.succeeded();
    vi.setSystemTime(NOON + 300_000);

    store.failed(new ApiError('network', 0));

    expect(store.lastContact()).toBe(NOON);
  });

  it('goes out of reach when the device goes offline, and stays so when it is back', () => {
    const store = create();

    window.dispatchEvent(new Event('offline'));
    expect(store.offline()).toBe(true);

    // back on some network says nothing about the house: only an answer does
    window.dispatchEvent(new Event('online'));
    expect(store.offline()).toBe(true);
  });

  describe('across starts of the application', () => {
    it('remembers the last contact', () => {
      create().succeeded();
      TestBed.resetTestingModule();
      vi.setSystemTime(NOON + 3_600_000);

      expect(create().lastContact()).toBe(NOON);
    });

    // views poll every few seconds
    it('writes to the storage once a minute at most', () => {
      const write = vi.spyOn(Storage.prototype, 'setItem');
      const store = create();

      store.succeeded();
      vi.setSystemTime(NOON + 59_000);
      store.succeeded();
      expect(write).toHaveBeenCalledTimes(1);

      vi.setSystemTime(NOON + 60_000);
      store.succeeded();
      expect(write).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(String(NOON + 60_000));
    });

    it.each([
      ['text', '"yesterday"'],
      ['not JSON', '{'],
      ['a time that has not come yet', String(NOON + 1)],
      ['zero', '0'],
      ['an object', '{"at":1}'],
    ])('ignores a remembered value that is %s', (_, stored) => {
      localStorage.setItem(STORAGE_KEY, stored);

      expect(create().lastContact()).toBeUndefined();
    });

    it('works without storage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const store = create();

      store.succeeded();

      expect(store.lastContact()).toBe(NOON);
    });
  });
});
