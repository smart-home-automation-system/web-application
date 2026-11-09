import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { SoftenerApi } from './softener-api';

describe('SoftenerApi', () => {
  let api: SoftenerApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(SoftenerApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks a regeneration now or tonight with when, and cancels it with a DELETE', async () => {
    const tonight = firstValueFrom(api.regenerate('tonight'));
    const sent = http.expectOne((request) => request.url === '/home/water/softener/regeneration');
    expect(sent.request.method).toBe('POST');
    expect(sent.request.params.get('when')).toBe('tonight');
    sent.flush({ command: 'regenerate tonight' }, { status: 202, statusText: 'Accepted' });
    await tonight;

    const cancel = firstValueFrom(api.cancelRegeneration());
    const cancelled = http.expectOne('/home/water/softener/regeneration');
    expect(cancelled.request.method).toBe('DELETE');
    cancelled.flush({ command: 'cancel the scheduled regeneration' }, { status: 202, statusText: 'Accepted' });
    await cancel;
  });

  it('opens the live stream with a PUT and closes it with a DELETE', async () => {
    const open = firstValueFrom(api.openLive());
    const opened = http.expectOne('/home/water/softener/live');
    expect(opened.request.method).toBe('PUT');
    opened.flush({ live: true, liveUntil: '2026-11-09T19:05:00' });
    expect(await open).toEqual({ live: true, liveUntil: '2026-11-09T19:05:00' });

    const close = firstValueFrom(api.closeLive());
    const closed = http.expectOne('/home/water/softener/live');
    expect(closed.request.method).toBe('DELETE');
    closed.flush(null, { status: 204, statusText: 'No Content' });
    await close;
  });
});
