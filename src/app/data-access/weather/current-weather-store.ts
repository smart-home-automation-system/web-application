import { Injectable, inject } from '@angular/core';

import { WeatherApi } from './weather-api';

/**
 * The current weather, polled once for the whole application: the strip of the panel is on every
 * page, and the tile of the overview reads the same resource - two pollers would ask twice a
 * minute and could show two different answers side by side. It lives as long as the
 * application, like the shell that shows it.
 */
@Injectable({ providedIn: 'root' })
export class CurrentWeatherStore {
  readonly current = inject(WeatherApi).watchCurrent();
}
