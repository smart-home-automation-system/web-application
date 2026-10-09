import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting } from '../../../testing/i18n';
import { HouseholdMember } from '../../data-access/household/household-api';
import { Household } from './household';

const AURELIA: HouseholdMember = {
  name: 'Aurelia',
  phone: '+48500100101',
  active: true,
  role: 'admin',
  rooms: ['office'],
  devices: [{ name: 'Phone', mac: '02:00:00:00:a1:01' }],
};
const BORYS: HouseholdMember = {
  name: 'Borys',
  phone: '+48500100102',
  active: true,
  role: 'resident',
  devices: [],
};
const EMIL: HouseholdMember = { ...BORYS, name: 'Emil', phone: '+48500100105', active: false };

const PROFILES = [
  { name: 'Aurelia', role: 'admin', rooms: ['office'] },
  { name: 'Borys', role: 'resident' },
];

describe('Household', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Household>;

  beforeEach(() => {
    vi.useFakeTimers();
    // the administrator this browser remembers
    localStorage.setItem('smart-home.profile', JSON.stringify(PROFILES[0]));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideI18nTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Household);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
    localStorage.removeItem('smart-home.profile');
  });

  function answerTheProfiles(): void {
    http.expectOne({ method: 'GET', url: '/home/household/profiles' }).flush(PROFILES);
  }

  function answerTheRegistryWith(answer: object | string | null): void {
    vi.advanceTimersByTime(1);
    http.expectOne({ method: 'GET', url: '/home/household' }).flush(answer);
    fixture.detectChanges();
  }

  async function settled(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) {
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  const page = () => fixture.nativeElement as HTMLElement;
  const card = (name: string) => page().querySelector<HTMLElement>(`[data-member="${name}"]`)!;
  const button = (within: HTMLElement, label: string) =>
    [...within.querySelectorAll('button')].find((one) => one.textContent.trim().endsWith(label));

  it('shows everybody the registry holds, switched off or not', () => {
    answerTheRegistryWith([AURELIA, BORYS, EMIL]);

    expect(
      [...page().querySelectorAll('[data-member]')].map((one) => one.getAttribute('data-member')),
    ).toEqual(['Aurelia', 'Borys', 'Emil']);
    expect(card('Emil').textContent).toContain('Switched off');
    expect(card('Borys').textContent).not.toContain('Switched off');
    // without a profile there is no link to hand out
    expect(card('Emil').querySelector('[data-testid="personal-link"]')).toBeNull();
    expect(card('Borys').querySelector('[data-testid="personal-link"]')?.textContent).toMatch(
      /\/u\/Borys$/,
    );
  });

  // each of them would take the profile this browser remembers, or close the page to its user
  it('offers the administrator no way to switch off or remove themselves', () => {
    answerTheRegistryWith([AURELIA, BORYS]);

    expect(card('Aurelia').textContent).toContain('You');
    expect(button(card('Aurelia'), 'Switch off')).toBeUndefined();
    expect(button(card('Aurelia'), 'Remove')).toBeUndefined();
    expect(button(card('Borys'), 'Switch off')).toBeDefined();
    expect(button(card('Borys'), 'Remove')).toBeDefined();
  });

  // nothing checks an answer at runtime: `{}` is not an empty household
  it.each([null, {}, 'members'])(
    'says so when the answer %o is not a list of members',
    (answer) => {
      answerTheRegistryWith(answer);

      expect(page().textContent).toContain('The registry did not answer with its members.');
      expect(page().querySelector('[data-member]')).toBeNull();
      expect(button(page(), 'Add a member')).toBeUndefined();
    },
  );

  it('skips an entry it could not address, and shows the others', () => {
    answerTheRegistryWith([AURELIA, { phone: '+48500100109' }, null, BORYS]);

    expect(page().querySelectorAll('[data-member]')).toHaveLength(2);
  });

  it('offers to add the first member to an empty registry', () => {
    answerTheRegistryWith([]);

    expect(page().textContent).toContain('Nobody is registered in the household yet.');
    expect(button(page(), 'Add a member')).toBeDefined();
  });

  it('keeps the members on screen when a later read fails, next to the failure', () => {
    answerTheRegistryWith([AURELIA, BORYS]);

    vi.advanceTimersByTime(60_000);
    http
      .expectOne({ method: 'GET', url: '/home/household' })
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    fixture.detectChanges();

    expect(page().querySelectorAll('[data-member]')).toHaveLength(2);
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('error 502');
  });

  // who may open what follows the registry: a change is followed by a read of the profiles
  it('switches a member off, reads the registry again, then asks for the profiles', async () => {
    answerTheRegistryWith([AURELIA, BORYS]);

    button(card('Borys'), 'Switch off')!.click();
    await settled();
    http.expectOne({ method: 'POST', url: '/home/household/member/Borys/deactivate' }).flush({});
    await settled();
    // nothing moved yet: the card shows what the registry answers, not what was pressed
    expect(card('Borys').textContent).not.toContain('Switched off');

    answerTheRegistryWith([AURELIA, { ...BORYS, active: false }]);
    await settled();
    answerTheProfiles();

    expect(card('Borys').textContent).toContain('Switched off');
  });

  it('removes a member only after the question was answered', async () => {
    answerTheRegistryWith([AURELIA, BORYS]);

    button(card('Borys'), 'Remove')!.click();
    fixture.detectChanges();
    // no call yet
    http.expectNone({ method: 'DELETE', url: '/home/household/member/Borys' });
    const question = card('Borys').querySelector<HTMLElement>('[role="group"]')!;
    expect(question.textContent).toContain('Remove this member');

    button(question, 'Remove')!.click();
    await settled();
    http.expectOne({ method: 'DELETE', url: '/home/household/member/Borys' }).flush(null);
    await settled();
    answerTheRegistryWith([AURELIA]);
    await settled();
    answerTheProfiles();

    expect(page().querySelector('[data-member="Borys"]')).toBeNull();
  });

  it('words a refusal by its code, and keeps the question open', async () => {
    answerTheRegistryWith([AURELIA, BORYS]);
    button(card('Borys'), 'Remove')!.click();
    fixture.detectChanges();

    button(card('Borys').querySelector<HTMLElement>('[role="group"]')!, 'Remove')!.click();
    await settled();
    http.expectOne({ method: 'DELETE', url: '/home/household/member/Borys' }).flush(
      {
        errors: [
          { code: 'NOT_FOUND_HOUSEHOLD_MEMBER', message: 'Household member [Borys] not found' },
        ],
      },
      { status: 404, statusText: 'Not Found' },
    );
    await settled();
    answerTheRegistryWith([AURELIA, BORYS]);
    await settled();
    answerTheProfiles();

    const failure = card('Borys').querySelector('[data-testid="change-failure"]')!;
    expect(failure.textContent).toContain('The change was not carried out.');
    expect(failure.textContent).toContain('This member is no longer in the registry.');
    expect(failure.textContent).not.toContain('Household member [Borys] not found');
    expect(card('Borys').querySelector('[role="group"]')).not.toBeNull();
  });

  // a call without an answer may have been carried out
  it('does not call a change that got no answer a change that failed', async () => {
    answerTheRegistryWith([AURELIA, BORYS]);

    button(card('Borys'), 'Switch off')!.click();
    await settled();
    http
      .expectOne({ method: 'POST', url: '/home/household/member/Borys/deactivate' })
      .error(new ProgressEvent('error'));
    await settled();
    answerTheRegistryWith([AURELIA, BORYS]);
    await settled();
    answerTheProfiles();

    const failure = card('Borys').querySelector('[data-testid="change-failure"]')!;
    expect(failure.textContent).toContain('may have been carried out all the same');
    expect(failure.textContent).not.toContain('was not carried out');
  });

  it('adds a member from the form, and refuses one whose name is taken without a call', async () => {
    answerTheRegistryWith([AURELIA, BORYS]);
    button(page(), 'Add a member')!.click();
    fixture.detectChanges();
    const form = page().querySelector<HTMLElement>('[data-testid="registry"]')!;
    const [name, phone] = [...form.querySelectorAll('input')];
    const type = (input: HTMLInputElement, text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    };

    type(name, 'borys');
    type(phone, '+48 500 100 106');
    button(form, 'Add')!.click();
    fixture.detectChanges();
    expect(form.textContent).toContain('Another member already has this name.');
    http.expectNone({ method: 'POST', url: '/home/household/member' });

    type(name, ' Fabian ');
    button(form, 'Add')!.click();
    await settled();
    const call = http.expectOne({ method: 'POST', url: '/home/household/member' });
    expect(call.request.body).toEqual({
      name: 'Fabian',
      phone: '+48500100106',
      role: 'resident',
      rooms: [],
      permissions: [],
    });
    call.flush({});
    await settled();
    answerTheRegistryWith([AURELIA, BORYS, { ...BORYS, name: 'Fabian', phone: '+48500100106' }]);
    await settled();
    answerTheProfiles();

    expect(card('Fabian')).not.toBeNull();
    expect(form.querySelector('input')).toBeNull();
  });
});
