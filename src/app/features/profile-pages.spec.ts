import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideI18nTesting, useLanguage } from '../../testing/i18n';
import { routes } from '../app.routes';
import { ProfileStore } from '../core/profile/profile-store';
import { Profile } from '../core/profile/profile';

const STORAGE_KEY = 'smart-home.profile';

const HOUSEHOLD = [
  { name: 'Aurelia', role: 'admin', rooms: ['office'] },
  { name: 'Borys', role: 'resident', rooms: ['loft'] },
  { name: 'Celina', role: 'resident' },
];

const AURELIA: Profile = { name: 'Aurelia', role: 'admin', rooms: ['office'] };
const BORYS: Profile = { name: 'Borys', role: 'resident', rooms: ['loft'] };

/**
 * The profiles through the real routes: the guard, the picker, the personal link and the page
 * of a resident, with only the backend replaced.
 */
describe('profiles in the application', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  async function start(profile?: Profile): Promise<void> {
    if (profile) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideI18nTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  }

  function page(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  function url(): string {
    return TestBed.inject(Router).url;
  }

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    TestBed.tick();
  }

  /** Answers the question to the registry that is on its way. */
  async function registryAnswers(body: object[] = HOUSEHOLD): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/home/household/profiles'))).flush(body);
    await settle();
  }

  async function registryFails(status = 502): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/home/household/profiles'))).flush(
      { errors: [{ message: 'The registry said something private' }] },
      { status, statusText: 'Failed' },
    );
    await settle();
  }

  function sideNavigation(): (string | undefined)[] {
    return [...page().querySelectorAll('.shell__side-nav a')].map((a) =>
      a.querySelector('.mat-mdc-list-item-title')?.textContent?.trim(),
    );
  }

  beforeEach(() => localStorage.removeItem(STORAGE_KEY));

  afterEach(() => {
    // the page of a member reads the switch of the house and its room; what those two reads
    // show is the business of the page (my-room.spec), not of the profiles. Reads only: a call
    // that changes the house is never let through here
    http.match(
      (request) =>
        request.method === 'GET' &&
        (request.url === '/home/heating' || request.url.startsWith('/home/heating/rooms/')),
    );
    http.verify();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('smart-home.language.Borys');
  });

  describe('without a profile', () => {
    it.each(['/', '/overview', '/settings', '/room', '/no/such/page'])(
      'leads from %s to the picker',
      async (address) => {
        await start();

        await harness.navigateByUrl(address);
        await registryAnswers();

        expect(url()).toBe('/profiles');
      },
    );

    it('offers every active member as a link to their personal address', async () => {
      await start();
      await harness.navigateByUrl('/profiles');
      expect(page().querySelector('mat-progress-bar')).toBeTruthy();

      await registryAnswers();

      const members = [...page().querySelectorAll<HTMLAnchorElement>('a.member')];
      expect(members.map((member) => member.getAttribute('href'))).toEqual([
        '/u/Aurelia',
        '/u/Borys',
        '/u/Celina',
      ]);
      expect(members[0].textContent).toContain('Administrator');
      expect(members[1].textContent).toContain('Resident');
      expect(page().querySelector('mat-progress-bar')).toBeNull();
    });

    it('shows no navigation and no profile in the panel', async () => {
      await start();
      await harness.navigateByUrl('/profiles');
      await registryAnswers();

      expect(sideNavigation()).toEqual([]);
      expect(page().querySelector('.shell__bottom-nav')).toBeNull();
      expect(page().querySelector('.shell__profile')).toBeNull();
    });

    it('says so when nobody is registered', async () => {
      await start();
      await harness.navigateByUrl('/profiles');

      await registryAnswers([]);

      expect(page().textContent).toContain('Nobody is registered in the household yet.');
    });

    it('explains a registry that fails without quoting it, and asks again on request', async () => {
      await start();
      await harness.navigateByUrl('/profiles');

      await registryFails();

      const alert = page().querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('(error 502)');
      expect(page().textContent).not.toContain('something private');

      page().querySelector<HTMLButtonElement>('mat-card-actions button')!.click();
      await registryAnswers();

      expect(page().querySelectorAll('a.member').length).toBe(3);
      expect(page().querySelector('[role="alert"]')).toBeNull();
    });

    it('speaks Polish when Polish is chosen', async () => {
      await start();
      await harness.navigateByUrl('/profiles');
      await registryAnswers();

      await useLanguage('pl');
      await settle();

      expect(page().querySelector('h1')?.textContent).toContain('Wybierz swój profil');
      expect(page().querySelector('a.member:nth-of-type(1)')?.textContent).toContain(
        'Administrator',
      );
      expect(page().querySelectorAll('a.member')[1].textContent).toContain('Domownik');
    });
  });

  describe('a personal link', () => {
    it('opens the profile of the administrator and goes on to the overview', async () => {
      await start();

      await harness.navigateByUrl('/u/aurelia');
      await registryAnswers();
      (await vi.waitFor(() => http.expectOne('/home/heating'))).flush({ isHeatingEnabled: true });

      expect(url()).toBe('/overview');
      expect(TestBed.inject(ProfileStore).profile()).toEqual(AURELIA);
    });

    it('opens the profile of a resident and goes on to their room', async () => {
      await start();

      await harness.navigateByUrl('/u/Borys');
      await registryAnswers();
      await vi.waitFor(() => expect(url()).toBe('/room'));

      expect(page().querySelector('h1')?.textContent).toContain('My room');
      expect(page().querySelector('.shell__profile')?.textContent).toContain('Borys');
    });

    // a member who is switched off is not in the answer of the registry: the same case
    it('ends on a clear message for a name nobody answers to', async () => {
      const member = 'nobody';
      await start();

      await harness.navigateByUrl(`/u/${member}`);
      expect(page().querySelector('mat-progress-bar')).toBeTruthy();
      await registryAnswers();

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain(
          'This link does not open a profile',
        ),
      );
      expect(url()).toBe(`/u/${member}`);
      expect(page().querySelector('a[matButton]')?.getAttribute('href')).toBe('/');
      expect(TestBed.inject(ProfileStore).profile()).toBeUndefined();
    });

    it('never puts the name from the address on screen', async () => {
      await start();

      await harness.navigateByUrl('/u/%7B%7B%20message%20%7D%7D');
      await registryAnswers();
      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('does not open'),
      );

      expect(page().textContent).not.toContain('message');
    });

    it('explains a registry that cannot be asked, and opens the link on a second try', async () => {
      await start();
      await harness.navigateByUrl('/u/Borys');

      await registryFails(503);

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain(
          'The profile could not be opened',
        ),
      );
      expect(page().querySelector('[role="alert"]')?.textContent).toContain('(error 503)');

      page().querySelector<HTMLButtonElement>('app-personal-link button')!.click();
      await registryAnswers();
      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    // the banner keeps asking the registry while the house is out of reach: its answer opens
    // the link, nobody has to tap "Try again" under a message that is no longer true
    it('opens the link by itself once the registry answers again', async () => {
      await start();
      await harness.navigateByUrl('/u/Borys');
      await registryFails(503);
      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain(
          'The profile could not be opened',
        ),
      );

      void TestBed.inject(ProfileStore).refresh();
      await registryAnswers();

      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    it('opens the own link of the member remembered while the registry is away', async () => {
      await start(BORYS);
      await harness.navigateByUrl('/u/borys');

      await registryFails(503);

      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    // the installed application starts from this address every time
    it('opens the own link of the member remembered at once, without waiting for the registry', async () => {
      await start(BORYS);

      await harness.navigateByUrl('/u/borys');
      await vi.waitFor(() => expect(url()).toBe('/room'));

      await registryAnswers();
      expect(url()).toBe('/room');
    });

    it('asks who is using the application when the own link is of a member switched off since', async () => {
      await start(BORYS);
      await harness.navigateByUrl('/u/borys');
      await vi.waitFor(() => expect(url()).toBe('/room'));

      await registryAnswers([HOUSEHOLD[0]]);

      await vi.waitFor(() => expect(url()).toBe('/profiles'));
      expect(TestBed.inject(ProfileStore).profile()).toBeUndefined();
      await registryAnswers([HOUSEHOLD[0]]);
    });

    it('opens the member of the link followed last', async () => {
      await start();
      await harness.navigateByUrl('/u/Borys');

      await harness.navigateByUrl('/u/Celina');
      await registryAnswers();
      await vi.waitFor(() => expect(url()).toBe('/room'));

      expect(TestBed.inject(ProfileStore).profile()?.name).toBe('Celina');
    });

    it('tells a member without a room that none is assigned', async () => {
      await start();

      await harness.navigateByUrl('/u/Celina');
      await registryAnswers();
      await vi.waitFor(() => expect(url()).toBe('/room'));

      expect(page().textContent).toContain('No room is assigned to your profile yet.');
    });
  });

  // Safari on an iPhone is told by a property of its navigator that no other browser has
  describe('a personal link on an iPhone', () => {
    function iPhone(standalone: boolean): void {
      Object.defineProperty(navigator, 'standalone', { value: standalone, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    }

    afterEach(() => {
      delete (navigator as { standalone?: boolean }).standalone;
      delete (navigator as { maxTouchPoints?: number }).maxTouchPoints;
    });

    it('stays under its own address in a browser tab and shows how to add it to the home screen', async () => {
      iPhone(false);
      await start();

      await harness.navigateByUrl('/u/Borys');
      await registryAnswers();

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('Add to the Home Screen'),
      );
      // what gets added is the address in the bar: it has to be the link, not the page it leads to
      expect(url()).toBe('/u/Borys');
      expect(TestBed.inject(ProfileStore).profile()).toEqual(BORYS);
      const steps = [...page().querySelectorAll('.steps__list li span')].map((step) =>
        step.textContent?.trim(),
      );
      expect(steps).toEqual([
        'Tap the Share button of the browser.',
        'Choose "Add to Home Screen".',
        'Tap "Add".',
      ]);
    });

    it('goes on to the application for whoever stays in the browser', async () => {
      iPhone(false);
      await start();
      await harness.navigateByUrl('/u/Borys');
      await registryAnswers();
      const onward = await vi.waitFor(() => {
        const link = page().querySelector<HTMLAnchorElement>('app-install-instructions a');
        expect(link).toBeTruthy();
        return link!;
      });

      onward.click();

      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    it('shows the steps to the member remembered too', async () => {
      iPhone(false);
      await start(BORYS);

      await harness.navigateByUrl('/u/Borys');

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('Add to the Home Screen'),
      );
      await registryAnswers();
      expect(url()).toBe('/u/Borys');
    });

    // the browser remembered them, the registry no longer has them: nothing to install
    it('takes the steps back from a member who is switched off since', async () => {
      iPhone(false);
      await start(BORYS);
      await harness.navigateByUrl('/u/Borys');
      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('Add to the Home Screen'),
      );

      await registryAnswers([HOUSEHOLD[0]]);

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('does not open'),
      );
      expect(page().querySelector('app-install-instructions')).toBeNull();
    });

    it('explains the steps in Polish', async () => {
      iPhone(false);
      await start();
      await useLanguage('pl');

      await harness.navigateByUrl('/u/Borys');
      await registryAnswers();

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('Dodaj do ekranu początkowego'),
      );
      expect(page().querySelector('.steps__list')?.textContent).toContain(
        'Wybierz „Do ekranu początkowego”.',
      );
    });

    it('goes straight on when opened from the home screen', async () => {
      iPhone(true);
      await start();

      await harness.navigateByUrl('/u/Borys');
      await registryAnswers();

      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    it('says nothing about the home screen when the link opens nobody', async () => {
      iPhone(false);
      await start();

      await harness.navigateByUrl('/u/nobody');
      await registryAnswers();

      await vi.waitFor(() =>
        expect(page().querySelector('h1')?.textContent).toContain('does not open'),
      );
      expect(page().querySelector('app-install-instructions')).toBeNull();
    });
  });

  describe('a resident', () => {
    // the guard, not the navigation: these are addresses typed by hand
    it.each(['/', '/overview', '/settings', '/about', '/profiles', '/no/such/page'])(
      'is led from %s to their room',
      async (address) => {
        await start(BORYS);

        await harness.navigateByUrl(address);

        expect(url()).toBe('/room');
      },
    );

    it('is offered their room and nothing else', async () => {
      await start(BORYS);
      await harness.navigateByUrl('/room');

      expect(sideNavigation()).toEqual(['My room']);
      // a bar with one destination leads nowhere
      expect(page().querySelector('.shell__bottom-nav')).toBeNull();
      expect(page().querySelector('a.shell__profile')).toBeNull();
      expect(page().querySelector('.shell__profile')?.textContent).toContain('Borys');
      // the card of their room, named by it
      await settle();
      expect(
        page().querySelector('[data-testid="room-heating"] mat-card-title')?.textContent?.trim(),
      ).toBe('loft');
    });

    it('may open a personal link and the error page', async () => {
      await start(BORYS);

      await harness.navigateByUrl('/error');

      expect(url()).toBe('/error');
    });

    it('leaves the picker to the administrator they turn into', async () => {
      await start(BORYS);
      await harness.navigateByUrl('/u/aurelia');
      await registryAnswers();
      (await vi.waitFor(() => http.expectOne('/home/heating'))).flush({ isHeatingEnabled: true });

      await harness.navigateByUrl('/profiles');
      await registryAnswers();

      expect(url()).toBe('/profiles');
    });
  });

  describe('the administrator', () => {
    it('is offered every destination and the way to the picker', async () => {
      await start(AURELIA);
      await harness.navigateByUrl('/about');

      expect(sideNavigation()).toEqual([
        'Overview',
        'Heating',
        'Hot water',
        'Boiler room',
        'Presence',
        'My room',
        'Settings',
        'About',
      ]);
      const profile = page().querySelector<HTMLAnchorElement>('a.shell__profile');
      expect(profile?.getAttribute('href')).toBe('/profiles');
      expect(profile?.textContent).toContain('Aurelia');
      expect(profile?.textContent).toContain('Switch profile');
    });

    it('opens their own room too', async () => {
      await start(AURELIA);

      await harness.navigateByUrl('/room');

      expect(url()).toBe('/room');
    });
  });

  describe('a profile that changes under an open page', () => {
    // the guard let the administrator through; the profile changed before the page arrived
    it('leaves a page of the administrator that was on its way when the role changed', async () => {
      await start({ ...BORYS, role: 'admin' });
      await harness.navigateByUrl('/room');
      const router = TestBed.inject(Router);

      const navigation = router.navigateByUrl('/about');
      void TestBed.inject(ProfileStore).refresh();
      (await vi.waitFor(() => http.expectOne('/home/household/profiles'))).flush(HOUSEHOLD);
      await navigation;
      await settle();

      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    it('leaves the page of the administrator when the registry says resident', async () => {
      await start({ ...BORYS, role: 'admin' });
      await harness.navigateByUrl('/about');
      expect(url()).toBe('/about');

      void TestBed.inject(ProfileStore).refresh();
      await registryAnswers();

      await vi.waitFor(() => expect(url()).toBe('/room'));
    });

    it('asks who is using the application once the member is switched off', async () => {
      await start({ name: 'Emil', role: 'resident', rooms: [] });
      await harness.navigateByUrl('/room');

      void TestBed.inject(ProfileStore).refresh();
      await registryAnswers();

      await vi.waitFor(() => expect(url()).toBe('/profiles'));
      // the picker asks for the list of its own
      await registryAnswers();
    });

    it('stays on a page the new role may see as well', async () => {
      await start({ ...BORYS, role: 'admin' });
      await harness.navigateByUrl('/room');
      const content = page().querySelector('app-my-room');

      void TestBed.inject(ProfileStore).refresh();
      await registryAnswers();

      expect(url()).toBe('/room');
      expect(page().querySelector('app-my-room')).toBe(content);
    });
  });
});
