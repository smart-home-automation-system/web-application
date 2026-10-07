import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { HEATING_STATUS } from './heating.fixtures';
import { HOUSEHOLD } from './household.fixtures';
import { mockApiInterceptors } from './mock-api';

describe('mock API', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.removeItem('mock-scenario');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([...mockApiInterceptors])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => localStorage.removeItem('mock-scenario'));

  async function failure(request: Promise<unknown>): Promise<HttpErrorResponse> {
    return request.then(
      () => Promise.reject(new Error('the call was expected to fail')),
      (error: HttpErrorResponse) => error,
    );
  }

  it('answers a known endpoint from its fixture', async () => {
    expect(await firstValueFrom(http.get('/home/heating'))).toEqual(HEATING_STATUS);
  });

  it('answers the household registry from its fixture', async () => {
    expect(await firstValueFrom(http.get('/home/household'))).toEqual(HOUSEHOLD);
  });

  it('answers an unknown endpoint like the gateway does: 404 in the error contract', async () => {
    const error = await failure(firstValueFrom(http.get('/home/no/such/endpoint')));

    expect(error.status).toBe(404);
    expect(error.error.errors[0].message).toContain('/home/no/such/endpoint');
  });

  it('leaves calls outside the API alone', () => {
    let received: unknown;
    http.get('/assets/anything.json').subscribe((body) => (received = body));

    TestBed.inject(HttpTestingController)
      .expectOne('/assets/anything.json')
      .flush({ from: 'the real backend' });

    expect(received).toEqual({ from: 'the real backend' });
  });

  it('answers nothing in the offline scenario', async () => {
    localStorage.setItem('mock-scenario', 'offline');

    expect((await failure(firstValueFrom(http.get('/home/heating')))).status).toBe(0);
  });

  it('answers 502 in the server-error scenario', async () => {
    localStorage.setItem('mock-scenario', 'server-error');

    expect((await failure(firstValueFrom(http.get('/home/heating')))).status).toBe(502);
  });
});
