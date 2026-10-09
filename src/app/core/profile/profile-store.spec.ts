import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { HouseholdApi, HouseholdProfile } from '../../data-access/household/household-api';
import { ApiError } from '../api/api-error';
import { ProfileStore } from './profile-store';

const STORAGE_KEY = 'smart-home.profile';

const HOUSEHOLD: HouseholdProfile[] = [
  { name: 'Aurelia', role: 'admin', rooms: ['office'] },
  { name: 'Borys', role: 'resident', rooms: ['loft'] },
];

describe('ProfileStore', () => {
  /** What the registry answers; a test replaces it to change the household or make it fail. */
  let registry: () => Observable<HouseholdProfile[]>;

  function create(stored?: unknown): ProfileStore {
    if (stored !== undefined) {
      localStorage.setItem(
        STORAGE_KEY,
        typeof stored === 'string' ? stored : JSON.stringify(stored),
      );
    }
    TestBed.configureTestingModule({
      providers: [{ provide: HouseholdApi, useValue: { profiles: () => registry() } }],
    });
    return TestBed.inject(ProfileStore);
  }

  function remembered(): unknown {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    registry = () => of(HOUSEHOLD);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('starts without a profile in a browser nobody chose one in', () => {
    const store = create();

    expect(store.profile()).toBeUndefined();
    expect(store.members()).toBeUndefined();
  });

  it('starts as the member remembered, before the registry is asked', () => {
    const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });

    expect(store.profile()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
  });

  it.each(['not json', '{"name":"Borys"}', '[]', '{"name":"Borys","role":"owner"}'])(
    'ignores a remembered value of %s',
    (stored) => {
      expect(create(stored).profile()).toBeUndefined();
    },
  );

  describe('opening a profile', () => {
    it('takes the role and the rooms from the registry and remembers them', async () => {
      const store = create();

      expect(await store.open('Aurelia')).toBe('opened');

      expect(store.profile()).toEqual({ name: 'Aurelia', role: 'admin', rooms: ['office'] });
      expect(remembered()).toEqual({ name: 'Aurelia', role: 'admin', rooms: ['office'] });
    });

    it('finds the member whatever the case of the name, and keeps the name of the registry', async () => {
      const store = create();

      expect(await store.open('bORYS')).toBe('opened');

      expect(store.profile()?.name).toBe('Borys');
    });

    it.each(['nobody', ''])('opens nothing for "%s"', async (member) => {
      const store = create();

      expect(await store.open(member)).toBe('unknown');

      expect(store.profile()).toBeUndefined();
      expect(remembered()).toBeNull();
    });

    it('leaves the profile in use alone when the link names nobody', async () => {
      const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });

      expect(await store.open('nobody')).toBe('unknown');

      expect(store.profile()?.name).toBe('Borys');
    });

    it('opens nothing while the registry cannot be asked, and says why', async () => {
      registry = () => throwError(() => new ApiError('network', 0));
      const store = create();

      expect(await store.open('Aurelia')).toBe('unavailable');

      expect(store.profile()).toBeUndefined();
      expect(store.error()?.kind).toBe('network');
    });

    // the link a member opens the application with has to work while the backend is away
    it('opens the link of the member already remembered while the registry is away', async () => {
      registry = () => throwError(() => new ApiError('network', 0));
      const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });

      expect(await store.open('borys')).toBe('opened');
      expect(await store.open('Aurelia')).toBe('unavailable');

      expect(store.profile()?.name).toBe('Borys');
    });

    // the installed application starts from the own link of its member: it must not wait for
    // an answer that takes ten seconds to not arrive
    it('opens the link of the member already remembered before the registry answers', async () => {
      const answer = new Subject<HouseholdProfile[]>();
      const members = vi.fn(() => answer);
      registry = members;
      const store = create({ name: 'Borys', role: 'admin', rooms: [] });

      expect(await store.open('BORYS')).toBe('opened');
      expect(store.profile()?.role).toBe('admin');

      // ...and the registry is asked all the same: what it says takes effect when it answers
      expect(members).toHaveBeenCalledTimes(1);
      answer.next(HOUSEHOLD);
      answer.complete();
      await vi.waitFor(() => expect(store.profile()?.role).toBe('resident'));
    });

    it('takes the profile from a member who opened their own link and is switched off since', async () => {
      const answer = new Subject<HouseholdProfile[]>();
      registry = () => answer;
      const store = create({ name: 'Emil', role: 'resident', rooms: [] });

      expect(await store.open('Emil')).toBe('opened');
      answer.next(HOUSEHOLD);
      answer.complete();

      await vi.waitFor(() => expect(store.profile()).toBeUndefined());
      expect(remembered()).toBeNull();
    });

    it('replaces the profile of somebody else', async () => {
      const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });

      await store.open('Aurelia');

      expect(store.profile()?.name).toBe('Aurelia');
    });
  });

  describe('asking the registry again', () => {
    it('lists the members the registry answers with', async () => {
      const store = create();

      expect(await store.refresh()).toBe(true);

      expect(store.members()?.map((member) => member.name)).toEqual(['Aurelia', 'Borys']);
      expect(store.loading()).toBe(false);
    });

    it('takes over a role and rooms that changed, and remembers them', async () => {
      const store = create({ name: 'Borys', role: 'admin', rooms: [] });

      await store.refresh();

      expect(store.profile()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
      expect(remembered()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
    });

    // what the registry grants a member beyond the role reaches an open page the same way
    describe('the permissions of the member', () => {
      const GRANTED = {
        name: 'Borys',
        role: 'resident',
        rooms: ['loft'],
        permissions: ['heating_switch'],
      };

      it('takes over a permission the registry granted, and remembers it', async () => {
        registry = () => of([GRANTED]);
        const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });

        await store.refresh();

        expect(store.profile()).toEqual(GRANTED);
        expect(remembered()).toEqual(GRANTED);
      });

      it('drops a permission the registry took away, from the profile and from the storage', async () => {
        const store = create(GRANTED);
        expect(store.profile()?.permissions).toEqual(['heating_switch']);

        await store.refresh();

        expect(store.profile()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
        expect(remembered()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
      });

      it('starts with the permission remembered, before the registry is asked', () => {
        const store = create(GRANTED);

        expect(store.profile()).toEqual(GRANTED);
      });
    });

    // the registry answers with its active members only: switched off and gone look the same
    it('forgets a member who is no longer in the answer', async () => {
      const store = create({ name: 'Emil', role: 'resident', rooms: [] });

      await store.refresh();

      expect(store.profile()).toBeUndefined();
      expect(remembered()).toBeNull();
    });

    // the application has to keep working as the same person while the backend is away
    it('keeps the remembered profile when the registry fails', async () => {
      registry = () => throwError(() => new ApiError('server', 502));
      const store = create({ name: 'Emil', role: 'admin', rooms: [] });

      expect(await store.refresh()).toBe(false);

      expect(store.profile()?.name).toBe('Emil');
      expect(store.error()?.status).toBe(502);
      expect(store.members()).toBeUndefined();
    });

    // `{}` or an error page with status 200 says nothing about anybody
    it.each([{}, null, 'ok'])(
      'treats an answer of %o as a failure, not as an empty household',
      async (answer) => {
        registry = () => of(answer as unknown as HouseholdProfile[]);
        const store = create({ name: 'Borys', role: 'resident', rooms: [] });

        expect(await store.refresh()).toBe(false);

        expect(store.profile()?.name).toBe('Borys');
        expect(store.error()?.kind).toBe('invalid-response');
      },
    );

    it('forgets the failure with the next answer', async () => {
      registry = () => throwError(() => new ApiError('network', 0));
      const store = create();
      await store.refresh();

      registry = () => of(HOUSEHOLD);
      await store.refresh();

      expect(store.error()).toBeUndefined();
    });

    it('asks once for calls made while an answer is on its way', async () => {
      const answer = new Subject<HouseholdProfile[]>();
      const members = vi.fn(() => answer);
      registry = members;
      const store = create();

      const first = store.refresh();
      const second = store.open('Borys');
      expect(store.loading()).toBe(true);
      answer.next(HOUSEHOLD);
      answer.complete();

      expect(await first).toBe(true);
      expect(await second).toBe('opened');
      expect(members).toHaveBeenCalledTimes(1);

      await store.refresh();

      expect(members).toHaveBeenCalledTimes(2);
    });

    // an answer already on its way may have left the registry before the change
    it('asks anew after a change, instead of settling for a call that is under way', async () => {
      const before = new Subject<HouseholdProfile[]>();
      const answers: Observable<HouseholdProfile[]>[] = [
        before,
        of([{ name: 'Borys', role: 'admin', rooms: ['loft'] }]),
      ];
      const members = vi.fn(() => answers.shift()!);
      registry = members;
      const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });

      void store.refresh();
      const afterChange = store.refreshAfterChange();
      expect(members).toHaveBeenCalledTimes(1);
      before.next(HOUSEHOLD);
      before.complete();

      expect(await afterChange).toBe(true);
      expect(members).toHaveBeenCalledTimes(2);
      expect(store.profile()?.role).toBe('admin');
    });

    it('asks at once after a change when no call is under way', async () => {
      const members = vi.fn(() => of(HOUSEHOLD));
      registry = members;
      const store = create();

      await store.refreshAfterChange();

      expect(members).toHaveBeenCalledTimes(1);
    });

    // names are one whatever their case - for the registry, and for a personal link
    it('keeps the profile of a member whose name was only spelled anew, and takes the spelling', async () => {
      registry = () => of([{ name: 'Borys', role: 'resident', rooms: ['loft'] }]);
      const store = create({ name: 'borys', role: 'resident', rooms: ['loft'] });

      await store.refresh();

      expect(store.profile()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
      expect(remembered()).toEqual({ name: 'Borys', role: 'resident', rooms: ['loft'] });
    });
  });

  it('works without storage: the profile then lasts as long as the page', async () => {
    const store = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(await store.open('Borys')).toBe('opened');

    expect(store.profile()?.name).toBe('Borys');
  });

  describe('when the page comes back into view', () => {
    function comeBack(state: DocumentVisibilityState): void {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
      document.dispatchEvent(new Event('visibilitychange'));
    }

    it('asks the registry again and takes over what changed', async () => {
      const members = vi.fn(() => of(HOUSEHOLD));
      registry = members;
      const store = create({ name: 'Borys', role: 'admin', rooms: [] });

      comeBack('visible');
      await vi.waitFor(() => expect(store.profile()?.role).toBe('resident'));

      expect(members).toHaveBeenCalledTimes(1);
    });

    it('asks nothing when the page is hidden, or nobody has a profile', () => {
      const members = vi.fn(() => of(HOUSEHOLD));
      registry = members;
      const store = create({ name: 'Borys', role: 'resident', rooms: [] });

      comeBack('hidden');
      expect(members).not.toHaveBeenCalled();

      TestBed.resetTestingModule();
      localStorage.removeItem(STORAGE_KEY);
      create();
      comeBack('visible');
      expect(members).not.toHaveBeenCalled();
      expect(store.profile()?.name).toBe('Borys');
    });
  });

  describe('in step with other tabs', () => {
    it('takes over the profile opened in another tab', () => {
      const store = create();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name: 'Aurelia', role: 'admin', rooms: [] }),
      );

      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));

      expect(store.profile()?.name).toBe('Aurelia');
    });

    it('takes over a permission another tab learned of', () => {
      const store = create({ name: 'Borys', role: 'resident', rooms: ['loft'] });
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          name: 'Borys',
          role: 'resident',
          rooms: ['loft'],
          permissions: ['heating_switch'],
        }),
      );

      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));

      expect(store.profile()?.permissions).toEqual(['heating_switch']);
    });

    it('loses the profile when the storage is cleared', () => {
      const store = create({ name: 'Borys', role: 'resident', rooms: [] });
      localStorage.removeItem(STORAGE_KEY);

      window.dispatchEvent(new StorageEvent('storage', { key: null }));

      expect(store.profile()).toBeUndefined();
    });

    it('ignores what other keys do', () => {
      const store = create({ name: 'Borys', role: 'resident', rooms: [] });
      localStorage.removeItem(STORAGE_KEY);

      window.dispatchEvent(new StorageEvent('storage', { key: 'smart-home.theme' }));

      expect(store.profile()?.name).toBe('Borys');
    });
  });
});
