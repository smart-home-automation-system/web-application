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
  /**
   * The time zone of the house (IANA name). The backend sends its date-times as the wall-clock
   * time there, without an offset; showing one needs no zone, but telling how long ago it was
   * does - see `houseInstant`.
   */
  readonly houseTimeZone: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    apiBasePath: '/home',
    requestTimeoutMs: 10_000,
    houseTimeZone: 'Europe/Warsaw',
  }),
});
