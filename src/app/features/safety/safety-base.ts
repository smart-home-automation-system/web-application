import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { SafetyRead, SafetyStatus } from '../../data-access/safety/safety-api';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { baseViews } from '../../shared/safety/safety-labels';

/**
 * The base station of the detectors (HAS-469): whether it is on the broker, its Wi-Fi network and signal, when it was
 * last heard and whether the technical monitor calls it silent - `GET /safety/status` (safety-service >= 0.3.0) with
 * the network of `GET /safety`. Both calls are told in the strip of sources at the top of the page.
 */
@Component({
  selector: 'app-safety-base',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    HouseAgePipe,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="card--domain" data-testid="safety-base">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>router</mat-icon></div>
          <mat-card-title>{{ t('safety.base.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content class="card__content">
          @if (bases(); as list) {
            @if (list.length === 0) {
              <p class="note" data-testid="bases-none">{{ t('safety.base.none') }}</p>
            }
            @for (base of list; track $index) {
              <div class="base" [attr.data-base]="base.stationSerial">
                <!-- the serial of the base, as the base gives it -->
                <span class="base__serial">{{ base.stationSerial ?? '?' }}</span>
                <dl class="facts">
                  <div>
                    <dt>{{ t('safety.base.connection') }}</dt>
                    <dd data-testid="base-reachable">
                      @if (base.reachable === true) {
                        {{ t('safety.base.reachable') }}
                      } @else if (base.reachable === false) {
                        <strong class="warning">{{ t('safety.base.notReachable') }}</strong>
                      } @else {
                        <span class="quiet">{{ t('safety.base.unknown') }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t('safety.base.wifi') }}</dt>
                    <dd>{{ base.wifiSsid ?? t('safety.detector.notKnown') }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('safety.base.signal') }}</dt>
                    <dd>
                      @if (base.wifiRssi !== undefined) {
                        {{ base.wifiRssi | localNumber }} dBm
                      } @else {
                        <span class="quiet">{{ t('safety.detector.notKnown') }}</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t('safety.base.lastHeard') }}</dt>
                    <dd>
                      @if (base.lastHeardAt; as heard) {
                        <span
                          >{{ heard | houseDateTime }}&ngsp;<span class="quiet"
                            >({{ heard | houseAge }})</span
                          ></span
                        >
                      } @else {
                        <span class="quiet">{{ t('safety.detector.never') }}</span>
                      }
                    </dd>
                  </div>
                </dl>
                @if (base.silent === true) {
                  <p class="failure" data-testid="base-silent">{{ t('safety.base.silent') }}</p>
                }
              </div>
            }
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './safety-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyBase {
  /** The technical monitor; `undefined` until it answered. */
  readonly status = input.required<SafetyStatus | null | undefined>();
  /** The detectors and bases, for the Wi-Fi network of a base. */
  readonly read = input.required<SafetyRead | null | undefined>();

  protected readonly bases = computed(() => {
    const status = this.status();
    const read = this.read();
    const bases = Array.isArray(read?.bases) ? read.bases : undefined;
    // the monitor not answered (yet, or a service before 0.3.0): the bases of the detectors' call alone
    if (status === undefined) {
      return read === undefined ? undefined : baseViews([], bases);
    }
    return baseViews(Array.isArray(status?.bases) ? status.bases : [], bases);
  });
}
