import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, of, throwError } from 'rxjs';

import { PushConfig, PushSubscriptionApi } from '../../data-access/household/push-subscription-api';
import { ApiError } from '../api/api-error';
import { ProfileStore } from '../profile/profile-store';
import { BrowserSubscription, PUSH_PLATFORM, PushPermission, PushPlatform } from './push-platform';
import { PushSubscriptionStore } from './push-subscription-store';

const SUBSCRIPTION: BrowserSubscription = {
  endpoint: 'https://web.push.apple.com/abc',
  keys: { p256dh: 'BAAA', auth: 'AAAA' },
};
const KEY = 'smart-home.push.ola';

describe('PushSubscriptionStore', () => {
  let platform: {
    supported: boolean;
    offersHomeScreen: boolean;
    permission: ReturnType<typeof vi.fn<() => PushPermission>>;
    requestPermission: ReturnType<typeof vi.fn<() => Promise<PushPermission>>>;
    current: ReturnType<typeof vi.fn<() => Promise<BrowserSubscription | null>>>;
    subscribe: ReturnType<typeof vi.fn<(key: string) => Promise<BrowserSubscription>>>;
    unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>;
    messages: Observable<unknown>;
  };
  let api: {
    config: ReturnType<typeof vi.fn<() => Observable<PushConfig | null>>>;
    store: ReturnType<
      typeof vi.fn<(member: string, subscription: BrowserSubscription) => Observable<void>>
    >;
    remove: ReturnType<typeof vi.fn<(member: string, endpoint: string) => Observable<void>>>;
  };
  const member = signal<{ name: string } | undefined>(undefined);

  beforeEach(() => {
    localStorage.removeItem(KEY);
    member.set(undefined);
    platform = {
      supported: true,
      offersHomeScreen: false,
      permission: vi.fn(() => 'default' as PushPermission),
      requestPermission: vi.fn(() => Promise.resolve('granted' as PushPermission)),
      current: vi.fn(() => Promise.resolve(null)),
      subscribe: vi.fn(() => Promise.resolve(SUBSCRIPTION)),
      unsubscribe: vi.fn(() => Promise.resolve()),
      messages: EMPTY,
    };
    api = {
      config: vi.fn(() => of({ publicKey: 'BKEY' })),
      store: vi.fn(() => of(undefined)),
      remove: vi.fn(() => of(undefined)),
    };
  });

  afterEach(() => localStorage.removeItem(KEY));

  function create(): PushSubscriptionStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: PUSH_PLATFORM, useValue: platform as unknown as PushPlatform },
        { provide: PushSubscriptionApi, useValue: api },
        { provide: ProfileStore, useValue: { profile: member } },
      ],
    });
    return TestBed.inject(PushSubscriptionStore);
  }

  /** The member opens the application: the check of the start runs. */
  async function start(store: PushSubscriptionStore, name = 'Ola'): Promise<PushSubscriptionStore> {
    member.set({ name });
    TestBed.tick();
    await vi.waitFor(() => expect(store.state()).not.toBe('checking'));
    return store;
  }

  describe('at the start', () => {
    it('says the browser cannot take a push, or that an iPhone tab needs the home screen first', async () => {
      platform.supported = false;
      expect((await start(create())).state()).toBe('unsupported');

      TestBed.resetTestingModule();
      platform.offersHomeScreen = true;
      expect((await start(create())).state()).toBe('install');
    });

    it('says the member blocked them', async () => {
      platform.permission.mockReturnValue('denied');

      expect((await start(create())).state()).toBe('denied');
    });

    it('is off for a member who never switched it on here, whatever the browser holds', async () => {
      platform.current.mockResolvedValue(SUBSCRIPTION);

      expect((await start(create())).state()).toBe('off');
      expect(api.store).not.toHaveBeenCalled();
    });

    // the write is an upsert: a registry that lost it, or a member renamed, gets it back
    it('stores the subscription of the browser again for a member who switched it on', async () => {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');
      platform.current.mockResolvedValue(SUBSCRIPTION);

      const store = await start(create());

      expect(store.state()).toBe('on');
      await vi.waitFor(() => expect(api.store).toHaveBeenCalledWith('Ola', SUBSCRIPTION));
      expect(platform.subscribe).not.toHaveBeenCalled();
    });

    // iOS drops a subscription now and then
    it('makes a subscription the browser lost anew while the permission stands', async () => {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');

      const store = await start(create());

      expect(platform.subscribe).toHaveBeenCalledWith('BKEY');
      expect(store.state()).toBe('on');
      await vi.waitFor(() => expect(api.store).toHaveBeenCalledWith('Ola', SUBSCRIPTION));
    });

    // a regenerated VAPID pair: the push services refuse every push to the old subscription
    it('replaces a subscription made with a key the house no longer has', async () => {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');
      platform.current.mockResolvedValue({ ...SUBSCRIPTION, serverKey: 'BOLD' });

      const store = await start(create());

      await vi.waitFor(() => expect(api.store).toHaveBeenCalledWith('Ola', SUBSCRIPTION));
      expect(platform.unsubscribe).toHaveBeenCalled();
      expect(platform.subscribe).toHaveBeenCalledWith('BKEY');
      expect(store.state()).toBe('on');
    });

    it('keeps a subscription of the key of the house, written padded or not', async () => {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');
      platform.current.mockResolvedValue({ ...SUBSCRIPTION, serverKey: 'BKEY' });
      api.config.mockReturnValue(of({ publicKey: 'BKEY==' }));

      await start(create());

      await vi.waitFor(() => expect(api.store).toHaveBeenCalled());
      expect(platform.subscribe).not.toHaveBeenCalled();
    });

    // the member was quicker: the check of the start does not undo what the tap did
    it('leaves the state to a change the member started meanwhile', async () => {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');
      let release: (value: PushConfig) => void = () => undefined;
      api.config.mockReturnValueOnce(
        new Observable<PushConfig>((subscriber) => {
          release = (value) => {
            subscriber.next(value);
            subscriber.complete();
          };
        }),
      );
      const store = create();
      member.set({ name: 'Ola' });
      TestBed.tick();

      await store.disable();
      release({ publicKey: 'BKEY' });
      await Promise.resolve();
      await Promise.resolve();

      expect(store.state()).toBe('off');
      expect(platform.subscribe).not.toHaveBeenCalled();
    });

    it('forgets what was switched on once the permission was reset on the device', async () => {
      localStorage.setItem(KEY, 'on');

      const store = await start(create());

      expect(store.state()).toBe('off');
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('tells a store again that failed, and keeps the switch on', async () => {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');
      platform.current.mockResolvedValue(SUBSCRIPTION);
      api.store.mockReturnValue(throwError(() => new ApiError('network', 0)));

      const store = await start(create());

      await vi.waitFor(() =>
        expect(store.failure()).toEqual({ kind: 'api', error: expect.any(ApiError) }),
      );
      expect(store.state()).toBe('on');
    });
  });

  describe('switched on', () => {
    it('asks first, subscribes with the key of the house, stores it and remembers it', async () => {
      const store = await start(create());

      await store.enable();

      expect(platform.requestPermission).toHaveBeenCalled();
      expect(platform.subscribe).toHaveBeenCalledWith('BKEY');
      expect(api.store).toHaveBeenCalledWith('Ola', SUBSCRIPTION);
      expect(store.state()).toBe('on');
      expect(localStorage.getItem(KEY)).toBe('on');
      expect(store.busy()).toBe(false);
    });

    it('says so when the member declines, and asks nothing else', async () => {
      platform.requestPermission.mockResolvedValue('denied');
      const store = await start(create());

      await store.enable();

      expect(store.state()).toBe('denied');
      expect(platform.subscribe).not.toHaveBeenCalled();
    });

    it('stays off when the question was closed without an answer', async () => {
      platform.requestPermission.mockResolvedValue('default');
      const store = await start(create());

      await store.enable();

      expect(store.state()).toBe('off');
    });

    it('says the house has no key, without subscribing', async () => {
      api.config.mockReturnValue(of({}));
      const store = await start(create());

      await store.enable();

      expect(store.state()).toBe('unconfigured');
      expect(platform.subscribe).not.toHaveBeenCalled();
    });

    // no optimistic state: on only once the registry stored it
    it('stays off when the registry refused it, and tells why', async () => {
      const refused = new ApiError('client', 409, [
        { message: 'switched off', code: 'MEMBER_SWITCHED_OFF' },
      ]);
      api.store.mockReturnValue(throwError(() => refused));
      const store = await start(create());

      await store.enable();

      expect(store.state()).toBe('off');
      expect(store.failure()).toEqual({ kind: 'api', error: refused });
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('tells a browser that did not subscribe', async () => {
      platform.subscribe.mockRejectedValue(new Error('AbortError'));
      const store = await start(create());

      await store.enable();

      expect(store.failure()).toEqual({ kind: 'browser' });
      expect(store.state()).toBe('off');
    });

    it('ignores a second tap while the first change is on its way', async () => {
      const store = await start(create());

      const first = store.enable();
      await store.enable();
      await first;

      expect(platform.requestPermission).toHaveBeenCalledTimes(1);
    });
  });

  describe('switched off', () => {
    async function on(): Promise<PushSubscriptionStore> {
      localStorage.setItem(KEY, 'on');
      platform.permission.mockReturnValue('granted');
      platform.current.mockResolvedValue(SUBSCRIPTION);
      return start(create());
    }

    it('ends the subscription of the browser, forgets it and removes it from the registry', async () => {
      const store = await on();

      await store.disable();

      expect(platform.unsubscribe).toHaveBeenCalled();
      expect(api.remove).toHaveBeenCalledWith('Ola', SUBSCRIPTION.endpoint);
      expect(store.state()).toBe('off');
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    // the device is silent whatever the registry answers; a dead row is removed on its 410
    it('is off on the device also when the removal from the registry failed, and says so', async () => {
      api.remove.mockReturnValue(throwError(() => new ApiError('server', 500)));
      const store = await on();

      await store.disable();

      expect(store.state()).toBe('off');
      expect(store.failure()).toEqual({ kind: 'api', error: expect.any(ApiError) });
    });
  });

  it('checks again for another member opened on the same device', async () => {
    const store = await start(create());
    localStorage.setItem('smart-home.push.jan', 'on');
    platform.permission.mockReturnValue('granted');
    platform.current.mockResolvedValue(SUBSCRIPTION);

    member.set({ name: 'Jan' });
    TestBed.tick();

    await vi.waitFor(() => expect(store.state()).toBe('on'));
    await vi.waitFor(() => expect(api.store).toHaveBeenCalledWith('Jan', SUBSCRIPTION));
    localStorage.removeItem('smart-home.push.jan');
  });
});
