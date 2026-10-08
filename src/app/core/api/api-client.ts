import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, tap, throwError, timeout } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import { ApiError, toApiError } from './api-error';
import { ConnectionStore } from './connection-store';

export type ApiParams = Record<string, string | number | boolean>;

/**
 * Sent with every call: it tells the service worker to keep its hands off (`ngsw-bypass` is the
 * worker's own convention). The worker stores the application, never an answer of the backend -
 * a remembered "heating is on" is worse than an error - and left in the path it would also turn
 * a call that got no answer into an invented 504, which reads as a failing service instead of a
 * house out of reach. The gateway ignores the header.
 */
const PAST_THE_SERVICE_WORKER = { 'ngsw-bypass': 'true' };

/**
 * The only way to the backend. Paths are relative to the gateway base path (`/heating`, not
 * `/home/heating`), every failure comes out as an {@link ApiError}, and a call that gets no
 * answer in time fails instead of hanging - a connection that is accepted and then never
 * answered is the one outage that otherwise looks like "still loading" forever. How every call
 * ended is also reported to {@link ConnectionStore}, which knows from it whether the house can
 * be reached at all.
 *
 * The type parameter describes what the endpoint is documented to return; nothing checks it at
 * runtime, so a data-access service treats fields as optional wherever the backend may omit them.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly connection = inject(ConnectionStore);

  get<T>(path: string, params?: ApiParams): Observable<T> {
    return this.guard(this.http.get<T>(this.url(path), this.options(params)));
  }

  post<T>(path: string, body?: unknown, params?: ApiParams): Observable<T> {
    return this.guard(this.http.post<T>(this.url(path), body ?? null, this.options(params)));
  }

  patch<T>(path: string, body: unknown, params?: ApiParams): Observable<T> {
    return this.guard(this.http.patch<T>(this.url(path), body, this.options(params)));
  }

  delete<T>(path: string, params?: ApiParams): Observable<T> {
    return this.guard(this.http.delete<T>(this.url(path), this.options(params)));
  }

  private guard<T>(call: Observable<T>): Observable<T> {
    return call.pipe(
      // unsubscribing on timeout aborts the request itself
      timeout({
        first: this.config.requestTimeoutMs,
        with: () =>
          throwError(() => new ApiError('network', 0, [], new Error('The call timed out'))),
      }),
      tap(() => this.connection.succeeded()),
      catchError((error: unknown) => {
        const failure = toApiError(error);
        this.connection.failed(failure);
        return throwError(() => failure);
      }),
    );
  }

  private options(params?: ApiParams) {
    return { params, headers: PAST_THE_SERVICE_WORKER };
  }

  private url(path: string): string {
    return `${this.config.apiBasePath}/${path.replace(/^\/+/, '')}`;
  }
}
