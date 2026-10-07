import { TestBed } from '@angular/core/testing';

import { isRecord, readJson, readText, watchKey, writeJson, writeText } from './browser-storage';

const KEY = 'smart-home.test';

describe('browser storage', () => {
  beforeEach(() => localStorage.removeItem(KEY));

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(KEY);
  });

  function blockStorage(): void {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
  }

  describe('text', () => {
    it('comes back as it was kept', () => {
      writeText(KEY, 'pl');

      expect(readText(KEY)).toBe('pl');
      expect(localStorage.getItem(KEY)).toBe('pl');
    });

    it('is nothing for a key nobody wrote', () => {
      expect(readText(KEY)).toBeUndefined();
    });

    it('is removed by writing nothing', () => {
      writeText(KEY, 'pl');

      writeText(KEY, undefined);

      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('JSON', () => {
    it('comes back as the value that was kept', () => {
      writeJson(KEY, { name: 'Borys', rooms: ['loft'] });

      expect(readJson(KEY)).toEqual({ name: 'Borys', rooms: ['loft'] });
    });

    it('is nothing for a key nobody wrote, and for text that is not JSON', () => {
      expect(readJson(KEY)).toBeUndefined();

      localStorage.setItem(KEY, '{not json');

      expect(readJson(KEY)).toBeUndefined();
    });

    // whatever is in the key is handed over as it is: checking the shape is the caller's job
    it.each(['null', '7', '"text"', '[]'])('hands over a stored %s unchanged', (stored) => {
      localStorage.setItem(KEY, stored);

      expect(readJson(KEY)).toEqual(JSON.parse(stored));
    });

    it('is removed by writing nothing', () => {
      writeJson(KEY, { photos: false });

      writeJson(KEY, undefined);

      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  // private mode, blocked site data: every access throws
  describe('when the storage cannot be used', () => {
    it('reads nothing and writes nothing, without throwing', () => {
      blockStorage();

      expect(readText(KEY)).toBeUndefined();
      expect(readJson(KEY)).toBeUndefined();
      expect(() => writeText(KEY, 'pl')).not.toThrow();
      expect(() => writeJson(KEY, { photos: false })).not.toThrow();
      expect(() => writeText(KEY, undefined)).not.toThrow();
    });
  });

  describe('watching a key', () => {
    function watch(): ReturnType<typeof vi.fn> {
      const onChange = vi.fn();
      TestBed.runInInjectionContext(() => watchKey(KEY, onChange));
      return onChange;
    }

    it('tells when another tab changes the key, or clears the storage', () => {
      const onChange = watch();

      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
      window.dispatchEvent(new StorageEvent('storage', { key: null }));

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('stays quiet about other keys', () => {
      const onChange = watch();

      window.dispatchEvent(new StorageEvent('storage', { key: 'smart-home.other' }));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('stops listening with whoever asked', () => {
      const onChange = watch();

      TestBed.resetTestingModule();
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('tells a record from everything else', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('text')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});
