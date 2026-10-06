import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Path every backend call starts with; the ingress sends it to `api-gateway-service`. */
  readonly apiBasePath: string;
  /**
   * How long a backend call may stay unanswered before it counts as failed. The gateway and the
   * services give up on their own calls after about 5 s, so anything slower than this is a
   * connection that will never answer.
   */
  readonly requestTimeoutMs: number;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({ apiBasePath: '/home', requestTimeoutMs: 10_000 }),
});
