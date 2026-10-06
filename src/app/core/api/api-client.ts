import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import { ApiError, toApiError } from './api-error';

export type ApiParams = Record<string, string | number | boolean>;

/**
 * The only way to the backend. Paths are relative to the gateway base path (`/heating`, not
 * `/home/heating`), every failure comes out as an {@link ApiError}, and a call that gets no
 * answer in time fails instead of hanging - a connection that is accepted and then never
 * answered is the one outage that otherwise looks like "still loading" forever.
 *
 * The type parameter describes what the endpoint is documented to return; nothing checks it at
 * runtime, so a data-access service treats fields as optional wherever the backend may omit them.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  get<T>(path: string, params?: ApiParams): Observable<T> {
    return this.guard(this.http.get<T>(this.url(path), { params }));
  }

  post<T>(path: string, body?: unknown, params?: ApiParams): Observable<T> {
    return this.guard(this.http.post<T>(this.url(path), body ?? null, { params }));
  }

  patch<T>(path: string, body: unknown, params?: ApiParams): Observable<T> {
    return this.guard(this.http.patch<T>(this.url(path), body, { params }));
  }

  delete<T>(path: string, params?: ApiParams): Observable<T> {
    return this.guard(this.http.delete<T>(this.url(path), { params }));
  }

  private guard<T>(call: Observable<T>): Observable<T> {
    return call.pipe(
      // unsubscribing on timeout aborts the request itself
      timeout({
        first: this.config.requestTimeoutMs,
        with: () =>
          throwError(() => new ApiError('network', 0, [], new Error('The call timed out'))),
      }),
      catchError((error: unknown) => throwError(() => toApiError(error))),
    );
  }

  private url(path: string): string {
    return `${this.config.apiBasePath}/${path.replace(/^\/+/, '')}`;
  }
}
