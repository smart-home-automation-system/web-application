import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { toBrowserSubscription } from '../../core/push/push-platform';
import { PushSubscriptionApi } from './push-subscription-api';

describe('PushSubscriptionApi', () => {
  let http: HttpTestingController;
  let api: PushSubscriptionApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PushSubscriptionApi);
  });

  afterEach(() => http.verify());

  it('reads the public key of the house', async () => {
    const config = firstValueFrom(api.config());

    http
      .expectOne({ method: 'GET', url: '/home/household/push-config' })
      .flush({ publicKey: 'BKEY' });

    expect(await config).toEqual({ publicKey: 'BKEY' });
  });

  it('stores the subscription of this browser for the member, with the browser named', async () => {
    const done = firstValueFrom(
      api.store('Ola Nowak', {
        endpoint: 'https://web.push.apple.com/abc',
        keys: { p256dh: 'BAAA', auth: 'AAAA' },
      }),
    );

    const request = http.expectOne({
      method: 'PUT',
      url: '/home/household/member/Ola%20Nowak/push-subscriptions',
    });
    expect(request.request.body).toEqual({
      endpoint: 'https://web.push.apple.com/abc',
      keys: { p256dh: 'BAAA', auth: 'AAAA' },
      userAgent: navigator.userAgent.slice(0, 500),
    });
    request.flush({});
    await done;
  });

  it('removes it by its endpoint', async () => {
    const done = firstValueFrom(api.remove('Ola', 'https://web.push.apple.com/abc?x=1'));

    const request = http.expectOne(
      (call) =>
        call.method === 'DELETE' && call.url === '/home/household/member/Ola/push-subscriptions',
    );
    expect(request.request.params.get('endpoint')).toBe('https://web.push.apple.com/abc?x=1');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await done;
  });

  it('takes the keys of a browser subscription, and refuses one without them', () => {
    const subscription = (keys: Record<string, string>) =>
      ({
        toJSON: () => ({ endpoint: 'https://web.push.apple.com/abc', keys }),
      }) as unknown as PushSubscription;

    expect(toBrowserSubscription(subscription({ p256dh: 'BAAA', auth: 'AAAA' }))).toEqual({
      endpoint: 'https://web.push.apple.com/abc',
      keys: { p256dh: 'BAAA', auth: 'AAAA' },
    });
    expect(() => toBrowserSubscription(subscription({ auth: 'AAAA' }))).toThrow(
      'The browser gave a subscription without its keys',
    );
  });
});
