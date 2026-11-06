import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MemberRequest, MemberRequestsApi, MemberRequestsControl } from './member-requests-api';

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
