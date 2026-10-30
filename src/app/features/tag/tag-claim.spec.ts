import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { provideI18nTesting } from '../../../testing/i18n';
import { routes } from '../../app.routes';
import { Profile } from '../../core/profile/profile';

const STORAGE_KEY = 'smart-home.profile';
const PICC_DATA = 'EF963FF7828658A599F3041510671E88';
const CMAC = '94EED9EE65337086';
const TAG_URL = `/t?picc_data=${PICC_DATA}&cmac=${CMAC}`;

const HOUSEHOLD = [
  { name: 'Aurelia', role: 'admin', rooms: ['office'] },
  { name: 'Borys', role: 'resident', rooms: ['loft'] },
];
const BORYS: Profile = { name: 'Borys', role: 'resident', rooms: ['loft'] };

/** The tag page through the real routes - no shell, no guard - with only the backend replaced. */
describe('the tag page', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  async function open(url: string, profile?: Profile): Promise<void> {
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
    await harness.navigateByUrl(url);
    await settle();
  }

  afterEach(() => {
    localStorage.clear();
  });

  async function settle(): Promise<void> {
    await harness.fixture.whenStable();
    TestBed.tick();
  }

  function text(): string {
    return (
      (harness.routeNativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  function shown(id: string): boolean {
    return (
      (harness.routeNativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`) !== null
    );
  }

  async function registryAnswers(): Promise<void> {
    for (const call of http.match('/home/household/profiles')) {
      call.flush(HOUSEHOLD);
    }
    await settle();
  }

  async function claimAnswers(body: object, status = 200): Promise<object> {
    const call = await vi.waitFor(() => http.expectOne('/home/appliance/claims'));
    const sent = call.request.body as object;
    call.flush(body, { status, statusText: status === 200 ? 'OK' : 'Refused' });
    await settle();
    return sent;
  }

  function button(name: string): HTMLButtonElement {
    const found = [...(harness.routeNativeElement as HTMLElement).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.includes(name),
    );
    if (found === undefined) {
      throw new Error(`no button "${name}" in: ${text()}`);
    }
    return found;
  }

  it('claims at once for the member this browser remembers, and says so on the whole screen', async () => {
    await open(TAG_URL, BORYS);

    const sent = await claimAnswers({
      applianceId: 62,
      name: 'Dryer',
      state: 'idle',
      member: 'Borys',
      runId: 7,
    });

    expect(sent).toEqual({ piccData: PICC_DATA, cmac: CMAC, member: 'Borys' });
    expect(shown('tag-done')).toBe(true);
    expect(text()).toContain('Dryer');
    expect(text()).toContain('emptied');
    expect(text()).toContain('Recorded for Borys');
  });

  // a reload, or a tab restored the next day, must not send the read again
  it('takes the read out of the address', async () => {
    await open(TAG_URL, BORYS);

    expect(TestBed.inject(Location).path()).toBe('/t');
    await claimAnswers({ name: 'Dryer', member: 'Borys' });
  });

  it('asks who holds the phone in a browser that knows nobody, and claims for the one chosen', async () => {
    await open(TAG_URL);
    await registryAnswers();

    expect(shown('tag-choose')).toBe(true);
    expect(text()).toContain('Who is holding the phone?');
    http.expectNone('/home/appliance/claims');

    button('Borys').click();
    await registryAnswers();
    const sent = await claimAnswers({ name: 'Dryer', member: 'Borys' });

    expect(sent).toEqual({ piccData: PICC_DATA, cmac: CMAC, member: 'Borys' });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').name).toBe('Borys');
  });

  it('sends nothing for a link that carries no read of a tag', async () => {
    await open('/t?picc_data=nothing', BORYS);

    expect(shown('tag-invalid')).toBe(true);
    http.expectNone('/home/appliance/claims');
  });

  it('words a read that was used before', async () => {
    await open(TAG_URL, BORYS);

    await claimAnswers({ errors: [{ message: 'Replayed tag read', code: 'REPLAYED_TAG' }] }, 409);

    expect(shown('tag-failed')).toBe(true);
    expect(text()).toContain('This read has already been used');
    expect(text()).not.toContain('Try again');
  });

  // the member is checked before the read is spent: the same read goes again for the one chosen
  it('asks again when the remembered member is gone, and sends the same read for the one chosen', async () => {
    await open(TAG_URL, BORYS);
    await claimAnswers(
      { errors: [{ message: 'Unknown household member', code: 'UNKNOWN_MEMBER' }] },
      400,
    );
    await registryAnswers();

    expect(shown('tag-choose')).toBe(true);
    expect(text()).toContain('not a household member any more');

    button('Aurelia').click();
    await registryAnswers();
    const sent = await claimAnswers({ name: 'Dryer', member: 'Aurelia' });

    expect(sent).toEqual({ piccData: PICC_DATA, cmac: CMAC, member: 'Aurelia' });
  });

  // a recorded read is spent: "not you" changes the member and asks for the next read of the tag
  it('after a recorded claim changes the member and asks to hold the phone to the tag again', async () => {
    await open(TAG_URL, BORYS);
    await claimAnswers({ name: 'Dryer', member: 'Borys' });

    button('Not you?').click();
    await registryAnswers();
    button('Aurelia').click();
    await registryAnswers();

    expect(shown('tag-again')).toBe(true);
    expect(text()).toContain('From now on as Aurelia');
    http.expectNone('/home/appliance/claims');
  });

  it('offers another attempt after no answer, which sends the same read', async () => {
    await open(TAG_URL, BORYS);
    (await vi.waitFor(() => http.expectOne('/home/appliance/claims'))).error(
      new ProgressEvent('error'),
    );
    await settle();

    expect(text()).toContain('may have been recorded all the same');

    button('Try again').click();
    const sent = await claimAnswers({ name: 'Dryer', member: 'Borys' });

    expect(sent).toEqual({ piccData: PICC_DATA, cmac: CMAC, member: 'Borys' });
    expect(shown('tag-done')).toBe(true);
  });
});
