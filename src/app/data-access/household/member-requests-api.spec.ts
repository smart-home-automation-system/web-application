import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  MemberRequest,
  MemberRequestsApi,
  MemberRequestsControl,
  WrittenRequestsControl,
} from './member-requests-api';

const BREAD: MemberRequest = { id: 1, member: 'Ola', text: 'Bread', author: 'Ola' };
const DONE: MemberRequest = { ...BREAD, doneAt: '2026-11-06T09:00:00', doneBy: 'Ola' };

describe('MemberRequestsApi', () => {
  let http: HttpTestingController;
  let requests: MemberRequestsControl;
  const member = signal<string | undefined>('Ola');

  beforeEach(() => {
    vi.useFakeTimers();
    member.set('Ola');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    requests = TestBed.runInInjectionContext(() => TestBed.inject(MemberRequestsApi).watch(member));
    answerTheListWith([BREAD]);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** The read due now - the first one, or the one after a write. */
  function listCall(name = 'Ola') {
    vi.advanceTimersByTime(1);
    return http.expectOne({
      method: 'GET',
      url: `/home/household/member/${name}/requests?done=true`,
    });
  }

  function answerTheListWith(list: readonly MemberRequest[]): void {
    listCall().flush(list);
  }

  const settled = () => Promise.resolve();

  it('reads the open requests and those done of the member, in one call', () => {
    expect(requests.value()).toEqual({ query: 'Ola', answer: [BREAD] });
  });

  it('asks for the list of another member when the profile changes', () => {
    member.set('Borys Nowak');
    TestBed.tick();
    listCall('Borys%20Nowak').flush([]);

    expect(requests.value()).toEqual({ query: 'Borys Nowak', answer: [] });
  });

  // no optimistic state: what the list read after the write says is what the card shows
  it('adds a request for anybody with the text and the author, and reads the list again', async () => {
    const taken = requests.add('Borys', 'Milk', 'Ola');
    expect(requests.changing()).toEqual({ kind: 'add', recipient: 'Borys' });

    const post = http.expectOne({ method: 'POST', url: '/home/household/member/Borys/requests' });
    expect(post.request.body).toEqual({ text: 'Milk', author: 'Ola' });
    post.flush({ id: 7, member: 'Borys', text: 'Milk', author: 'Ola' });
    answerTheListWith([BREAD]);

    expect(await taken).toBe(true);
    expect(requests.changing()).toBeUndefined();
    expect(requests.added()).toBe('Borys');
    expect(requests.failure()).toBeUndefined();
  });

  // the review of HAS-411: what was added was added from the profile on screen then
  it('forgets what was added when the profile changes', async () => {
    const taken = requests.add('Borys', 'Milk', 'Ola');
    http
      .expectOne({ method: 'POST', url: '/home/household/member/Borys/requests' })
      .flush({ id: 7 });
    answerTheListWith([BREAD]);
    await taken;
    expect(requests.added()).toBe('Borys');

    member.set('Celina');
    TestBed.tick();
    listCall('Celina').flush([]);

    expect(requests.added()).toBeUndefined();
  });

  it('ticks a request off as the member of the profile', async () => {
    requests.done(1, 'Ola');
    http
      .expectOne({ method: 'PUT', url: '/home/household/member/Ola/requests/1/done?member=Ola' })
      .flush(DONE);
    answerTheListWith([DONE]);
    await settled();

    expect(requests.value()?.answer).toEqual([DONE]);
    expect(requests.changing()).toBeUndefined();
  });

  it('removes a request', async () => {
    requests.remove(1);
    http
      .expectOne({ method: 'DELETE', url: '/home/household/member/Ola/requests/1' })
      .flush(null, { status: 204, statusText: 'No Content' });
    answerTheListWith([]);
    await settled();

    expect(requests.value()?.answer).toEqual([]);
  });

  it('ignores a second change while one is on its way', async () => {
    requests.done(1, 'Ola');
    expect(await requests.add('Ola', 'Milk', 'Ola')).toBe(false);

    http.expectOne({ method: 'PUT', url: '/home/household/member/Ola/requests/1/done?member=Ola' });
    http.expectNone({ method: 'POST', url: '/home/household/member/Ola/requests' });
  });

  // a refusal is told, and the list is read all the same - it says what the service has
  it('keeps a refused change with its code and reads the list again', async () => {
    const taken = requests.add('Emil', 'Milk', 'Ola');
    http
      .expectOne({ method: 'POST', url: '/home/household/member/Emil/requests' })
      .flush(
        { errors: [{ message: 'switched off', code: 'MEMBER_SWITCHED_OFF' }] },
        { status: 409, statusText: 'Conflict' },
      );
    answerTheListWith([BREAD]);

    expect(await taken).toBe(false);
    expect(requests.failure()?.change).toEqual({ kind: 'add', recipient: 'Emil' });
    expect(requests.failure()?.error.hasCode('MEMBER_SWITCHED_OFF')).toBe(true);
    expect(requests.added()).toBeUndefined();
  });

  it('asks for nothing while there is no member', () => {
    member.set(undefined);
    TestBed.tick();
    vi.advanceTimersByTime(1);

    expect(requests.value()).toEqual({ query: undefined, answer: null });
    requests.done(1, 'Ola');
    requests.remove(1);
    http.expectNone(() => true);
  });
});

describe('MemberRequestsApi.watchWrittenBy', () => {
  let http: HttpTestingController;
  let written: WrittenRequestsControl;
  const author = signal<string | undefined>('Ola');
  const others = signal<readonly string[]>(['Borys', 'Celina']);

  const FOR_BORYS: MemberRequest = { id: 7, member: 'Borys', text: 'Bulbs', author: 'Ola' };
  const FOR_CELINA: MemberRequest = { id: 9, member: 'Celina', text: 'Stamps', author: 'Ola' };

  beforeEach(() => {
    vi.useFakeTimers();
    author.set('Ola');
    others.set(['Borys', 'Celina']);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    written = TestBed.runInInjectionContext(() =>
      TestBed.inject(MemberRequestsApi).watchWrittenBy(author, others),
    );
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function listOf(name: string) {
    return http.expectOne({
      method: 'GET',
      url: `/home/household/member/${name}/requests?done=true`,
    });
  }

  /** The lists of the others, one after the other. */
  function answerTheOthers(
    borys: readonly MemberRequest[] | null,
    celina: readonly MemberRequest[] | null,
  ): void {
    vi.advanceTimersByTime(1);
    listOf('Borys').flush(borys);
    listOf('Celina').flush(celina);
  }

  it('reads the list of every other member, one after the other, as one answer', () => {
    vi.advanceTimersByTime(1);
    listOf('Borys').flush([FOR_BORYS]);
    // the next list is asked only once the one before answered
    listOf('Celina').flush([FOR_CELINA]);

    expect(written.asked()).toBe('["Ola","Borys","Celina"]');
    expect(written.value()).toEqual({
      query: '["Ola","Borys","Celina"]',
      answer: [FOR_BORYS, FOR_CELINA],
    });
  });

  // a list that is no list is no requests - never a broken screen
  it('takes an answer that is no list as no requests', () => {
    answerTheOthers(null, [FOR_CELINA]);

    expect(written.value()?.answer).toEqual([FOR_CELINA]);
  });

  // half of what was written is no answer to "what did I write"
  it('fails the whole answer when one list fails', () => {
    vi.advanceTimersByTime(1);
    listOf('Borys').flush([FOR_BORYS]);
    listOf('Celina').flush(
      { errors: [{ message: 'boom' }] },
      { status: 500, statusText: 'Server Error' },
    );

    expect(written.error()?.status).toBe(500);
    expect(written.value()).toBeUndefined();
  });

  it('removes a request from the list of its recipient and reads them all again', async () => {
    answerTheOthers([FOR_BORYS], [FOR_CELINA]);

    written.remove('Celina', 9);
    expect(written.removing()).toBe(9);
    http
      .expectOne({ method: 'DELETE', url: '/home/household/member/Celina/requests/9' })
      .flush(null, { status: 204, statusText: 'No Content' });
    answerTheOthers([FOR_BORYS], []);
    await Promise.resolve();

    expect(written.value()?.answer).toEqual([FOR_BORYS]);
    expect(written.removing()).toBeUndefined();
    expect(written.failure()).toBeUndefined();
  });

  it('keeps a refused removal with its id and reads them all again', async () => {
    answerTheOthers([FOR_BORYS], [FOR_CELINA]);

    written.remove('Borys', 7);
    written.remove('Celina', 9);
    http
      .expectOne({ method: 'DELETE', url: '/home/household/member/Borys/requests/7' })
      .flush({ errors: [{ message: 'boom' }] }, { status: 500, statusText: 'Server Error' });
    // the second press, while the first was on its way, was ignored
    http.expectNone({ method: 'DELETE', url: '/home/household/member/Celina/requests/9' });
    answerTheOthers([FOR_BORYS], [FOR_CELINA]);
    await Promise.resolve();

    expect(written.failure()?.id).toBe(7);
    expect(written.removing()).toBeUndefined();
  });

  it('asks for nothing while there is no author or nobody else', () => {
    answerTheOthers([], []);
    others.set([]);
    TestBed.tick();
    vi.advanceTimersByTime(1);
    expect(written.asked()).toBeUndefined();

    author.set(undefined);
    others.set(['Borys']);
    TestBed.tick();
    vi.advanceTimersByTime(1);

    expect(written.asked()).toBeUndefined();
    expect(written.value()?.answer).toBeNull();
    http.expectNone(() => true);
  });
});
