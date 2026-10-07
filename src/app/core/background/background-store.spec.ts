import { TestBed } from '@angular/core/testing';

import { BackgroundStore } from './background-store';

const STORAGE_KEY = 'smart-home.background';

describe('BackgroundStore', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('shows the photos unless somebody switched them off', () => {
    expect(TestBed.inject(BackgroundStore).photos()).toBe(true);
  });

  it('remembers that the photos are off, and forgets it when they are on again', () => {
    const store = TestBed.inject(BackgroundStore);

    store.showPhotos(false);
    expect(store.photos()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"photos":false}');

    store.showPhotos(true);
    expect(store.photos()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('starts with the photos off when that was chosen on an earlier visit', () => {
    localStorage.setItem(STORAGE_KEY, '{"photos":false}');

    expect(TestBed.inject(BackgroundStore).photos()).toBe(false);
  });

  it('shows the photos when the stored value is unreadable', () => {
    localStorage.setItem(STORAGE_KEY, 'not json');

    expect(TestBed.inject(BackgroundStore).photos()).toBe(true);
  });

  it('follows a choice made in another tab', () => {
    const store = TestBed.inject(BackgroundStore);

    localStorage.setItem(STORAGE_KEY, '{"photos":false}');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));

    expect(store.photos()).toBe(false);
  });
});
