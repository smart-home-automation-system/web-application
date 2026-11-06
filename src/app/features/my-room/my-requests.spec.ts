import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  FakeQueryResource,
  answerQuery,
  failQuery,
  fakeQueryResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { ProfileStore } from '../../core/profile/profile-store';
import {
  FailedRequestChange,
  MemberRequest,
  RequestChange,
} from '../../data-access/household/member-requests-api';
import { MemberRequestsApi } from '../../data-access/household/member-requests-api';
import { MyRequests } from './my-requests';

// 10:30 in the house (Europe/Warsaw) on 6 November 2026
const NOW = Date.parse('2026-11-06T09:30:00Z');

const LIST: MemberRequest[] = [
  {
    id: 1,
    text: 'Bread and milk',
    author: 'Ola',
    createdAt: '2026-11-05T20:00:00',
    sentAt: '2026-11-06T08:00:00',
  },
  { id: 2, text: 'Batteries', author: 'Borys', createdAt: '2026-11-06T09:15:00' },
  {
    id: 3,
    text: 'Parcel',
    author: 'Ola',
    createdAt: '2026-11-04T10:00:00',
    doneAt: '2026-11-05T12:00:00',
    doneBy: 'Borys',
  },
];

describe('MyRequests', () => {
  let fixture: ComponentFixture<MyRequests>;
  let requests: FakeQueryResource<string | undefined, readonly MemberRequest[] | null>;
  let asked: () => string | undefined;
  let calls: string[];
  let taken: boolean;
  const changing = signal<RequestChange | undefined>(undefined);
  const failure = signal<FailedRequestChange | undefined>(undefined);
  const added = signal<string | undefined>(undefined);
  const profile = signal<{ name: string } | undefined>({ name: 'Ola' });
  const members = signal<readonly { name: string }[] | undefined>([
    { name: 'Borys' },
    { name: 'Ola' },
    { name: 'Celina' },
  ]);

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    requests = fakeQueryResource();
    calls = [];
    taken = true;
    changing.set(undefined);
    failure.set(undefined);
    added.set(undefined);
    profile.set({ name: 'Ola' });
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile, members } },
        {
          provide: MemberRequestsApi,
          useValue: {
            watch: (member: () => string | undefined) => {
              asked = member;
              return {
                ...requests,
                changing,
                failure,
                added,
                add: (recipient: string, text: string, author: string) => {
                  calls.push(`add ${recipient} "${text}" by ${author}`);
                  return Promise.resolve(taken);
                },
                done: (id: number, by: string) => calls.push(`done ${id} by ${by}`),
                remove: (id: number) => calls.push(`remove ${id}`),
              };
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MyRequests);
  });

  afterEach(() => vi.useRealTimers());

  function card(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="my-requests"]')!;
  }

  function words(element: Element | null | undefined): string {
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function byTestId<T extends HTMLElement>(id: string): T | null {
    return card().querySelector<T>(`[data-testid="${id}"]`);
  }

  async function shown(list: readonly MemberRequest[] | null = LIST): Promise<void> {
    await fixture.whenStable();
    answerQuery(requests, asked(), list);
    await fixture.whenStable();
  }

  async function type(text: string): Promise<void> {
    const input = byTestId<HTMLInputElement>('request-text')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    // the button submits the form; the DOM of the tests does not submit a form by a click
    byTestId('request-form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('reads the list of the member of the profile', async () => {
    await fixture.whenStable();
    expect(asked()).toBe('Ola');
  });

  it('lists the open requests with who wrote them, when, and whether the SMS went', async () => {
    await shown();

    const lines = [...byTestId('open-requests')!.querySelectorAll('li')].map((line) =>
      words(line).replace(/ check Done delete$/, ''),
    );
    // the own author is not named; a request of another day carries its date
    expect(lines).toEqual([
      'Bread and milk 5 Nov 2026, 20:00 sms texted 08:00',
      'Batteries from Borys 09:15 goes by SMS at 08:00',
    ]);
    expect(byTestId('done-requests')).toBeNull();
  });

  it('folds the requests done in the last 30 days under the list', async () => {
    await shown();
    expect(words(byTestId('done-toggle'))).toBe('expand_more Done in the last 30 days (1)');

    byTestId<HTMLButtonElement>('done-toggle')!.click();
    await fixture.whenStable();

    expect(words(byTestId('done-requests'))).toBe('Parcel done 5 Nov 2026, 12:00 by Borys');
  });

  it('says that nothing waits on an empty list', async () => {
    await shown([]);

    expect(words(byTestId('no-requests'))).toBe('Nothing is waiting for you.');
    expect(byTestId('done-toggle')).toBeNull();
  });

  // a database-service before 0.22.0 serves no such path: the card says so, the form stays
  it('tells the 404 of an older database-service', async () => {
    await fixture.whenStable();
    failQuery(
      requests,
      asked(),
      new ApiError('client', 404, [{ message: "No static resource for request '/x'." }]),
    );
    await fixture.whenStable();

    expect(card().querySelector('[role="alert"]')).not.toBeNull();
    expect(byTestId('open-requests')).toBeNull();
    expect(byTestId('request-form')).not.toBeNull();
  });

  it('ticks a request off and removes one as the member of the profile', async () => {
    await shown();
    const line = card().querySelector('[data-request="2"]')!;

    line.querySelector<HTMLButtonElement>('[data-testid="request-done"]')!.click();
    line.querySelector<HTMLButtonElement>('[data-testid="request-remove"]')!.click();

    expect(calls).toEqual(['done 2 by Ola', 'remove 2']);
  });

  it('tells on its line that a tick or a removal is on its way', async () => {
    changing.set({ kind: 'done', id: 2 });
    await shown();

    expect(words(card().querySelector('[data-request="2"] [data-testid="request-saving"]'))).toBe(
      'Saving...',
    );
    expect(card().querySelector('[data-request="1"] [data-testid="request-saving"]')).toBeNull();
  });

  it('refuses a blank text before it sends anything', async () => {
    await shown();
    await type('   ');
    await submit();

    expect(calls).toEqual([]);
    expect(words(card().querySelector('mat-error'))).toBe('Write what is needed.');
  });

  it('refuses a text of more than 100 characters', async () => {
    await shown();
    await type('a'.repeat(101));
    await submit();

    expect(calls).toEqual([]);
    expect(words(card().querySelector('mat-error'))).toBe('At most 100 characters.');
  });

  it('adds a request for the member of the profile by default, the text trimmed, and clears it', async () => {
    await shown();
    await type('  Milk  ');
    await submit();

    expect(calls).toEqual(['add Ola "Milk" by Ola']);
    expect(byTestId<HTMLInputElement>('request-text')!.value).toBe('');
  });

  it('keeps the text of a request the service did not take', async () => {
    taken = false;
    await shown();
    await type('Milk');
    await submit();

    expect(byTestId<HTMLInputElement>('request-text')!.value).toBe('Milk');
  });

  it('offers the members of the household, the member of the profile first', async () => {
    await shown();
    const select = card().querySelector('mat-select')!;
    (select as HTMLElement).click();
    await fixture.whenStable();

    const options = [...document.querySelectorAll('mat-option')].map((option) => words(option));
    expect(options).toEqual(['Ola', 'Borys', 'Celina']);
  });

  it('says for whom a request was added when it is not on this list', async () => {
    added.set('Borys');
    await shown();

    expect(words(byTestId('request-added'))).toBe('Added to the list of Borys');
  });

  it('tells a failed change next to the request it was for', async () => {
    failure.set({
      change: { kind: 'done', id: 2 },
      error: new ApiError('server', 500, [{ message: 'boom' }]),
    });
    await shown();

    expect(words(card().querySelector('[data-request="2"] [role="alert"]'))).toContain(
      'The request was not ticked off.',
    );
    expect(card().querySelector('[data-request="1"] [role="alert"]')).toBeNull();
  });

  // removed already is removed: the list read again no longer has it
  it('says nothing of a removal of a request that is gone', async () => {
    failure.set({
      change: { kind: 'remove', id: 2 },
      error: new ApiError('client', 404, [{ message: 'x', code: 'NOT_FOUND_REQUEST' }]),
    });
    await shown();

    expect(card().querySelector('[role="alert"]')).toBeNull();
  });

  // the controls of the card, in words - a new one fails this on purpose
  it('names exactly what can be pressed', async () => {
    await shown();

    const controls = [...card().querySelectorAll('button, input, [role="combobox"]')].map(
      (control) =>
        control.getAttribute('aria-label') ?? control.getAttribute('data-testid') ?? words(control),
    );
    expect(controls).toEqual([
      'request-done',
      'Remove the request',
      'request-done',
      'Remove the request',
      'done-toggle',
      'request-recipient',
      'request-text',
      'request-add',
    ]);
  });
});
