import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import { toApiError } from './api-error';

export type ApiParams = Record<string, string | number | boolean>;

/**
 * The only way to the backend. Paths are relative to the gateway base path (`/heating`, not
 * `/home/heating`), and every failure comes out as an {@link ApiError}.
 *
 * The type parameter describes what the endpoint is documented to return; nothing checks it at
 * runtime, so a data-access service treats fields as optional wherever the backend may omit them.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly basePath = inject(APP_CONFIG).apiBasePath;

  get<T>(path: string, params?: ApiParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params }).pipe(catchError(rethrow));
  }

  post<T>(path: string, body?: unknown, params?: ApiParams): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? null, { params }).pipe(catchError(rethrow));
  }

  patch<T>(path: string, body: unknown, params?: ApiParams): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { params }).pipe(catchError(rethrow));
  }

  delete<T>(path: string, params?: ApiParams): Observable<T> {
    return this.http.delete<T>(this.url(path), { params }).pipe(catchError(rethrow));
  }

  private url(path: string): string {
    return `${this.basePath}/${path.replace(/^\/+/, '')}`;
  }
}

function rethrow(error: unknown): Observable<never> {
  return throwError(() => toApiError(error));
}
