import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Path every backend call starts with; the ingress sends it to `api-gateway-service`. */
  readonly apiBasePath: string;
  /**
   * IANA zone of the house. The backend sends local date-times without an offset; this zone is
   * what turns one into a point in time when its age has to be computed.
   */
  readonly houseTimeZone: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG', {
  providedIn: 'root',
  factory: () => ({ apiBasePath: '/home', houseTimeZone: 'Europe/Warsaw' }),
});
