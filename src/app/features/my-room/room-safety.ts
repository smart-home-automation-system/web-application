import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { Ticker } from '../../core/time/ticker';
import { Detector } from '../../data-access/safety/safety-api';
import { SafetyStore } from '../../data-access/safety/safety-store';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { shortName } from '../../shared/device-names/device-names';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { DetectorState } from '../../shared/safety/detector-state';
import {
  describeSafetyError,
  detectorName,
  detectorsOfRoom,
  canMute,
  flagOf,
  shownFailureOf,
} from '../../shared/safety/safety-labels';
import { safetyQuestion } from '../../shared/safety/safety-question';

/**
 * The smoke detectors of one room on "My room" (HAS-469): every detector of the room - the resource of the whole
 * application (`SafetyStore`) filtered by the room, no call of its own - with its state, its battery and when it was
 * last heard, and **Mute** after a question in a window over the page, for every member in the rooms of their profile -
 * only while the detector is in alarm (HAS-464: a mute of a quiet detector does nothing).
 * **No card for a room without a detector**, nor while the first answer is on its way; a failure before any answer is
 * drawn - nobody knows then whether the room has one. Nothing optimistic: the detectors are read back and only that
 * answer moves the card.
 */
@Component({
  selector: 'app-room-safety',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DetectorState,
    DisplayTextPipe,
    HouseAgePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      @if (shown()) {
        <mat-card appearance="outlined" class="safety card--domain" data-testid="room-safety">
          <mat-card-header>
            <div mat-card-avatar class="domain-badge"><mat-icon>detector_smoke</mat-icon></div>
            <mat-card-title>{{ t('myRoom.safety.title') }}</mat-card-title>
            <mat-card-subtitle>
              <app-data-freshness [lastUpdated]="safety.lastUpdated()" [stale]="safety.stale()" />
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="safety__content">
            <app-api-error-strip [error]="safety.error()" [describeWith]="describeError" />
            <ul class="safety__list">
              @for (row of detectors() ?? []; track row.detector.id) {
                <li class="detector" [attr.data-detector]="row.detector.id">
                  <div class="detector__head">
                    <!-- the name of the registry without its room, printed as it is -->
                    <span class="detector__name">{{ row.name }}</span>
                    <app-detector-state [detector]="row.detector" />
                  </div>
                  <p class="detector__facts">
                    {{ t('safety.detector.battery') }}:&ngsp;
                    @switch (battery(row.detector)) {
                      @case ('yes') {
                        <strong>{{ t('safety.detector.batteryLow') }}</strong>
                      }
                      @case ('no') {
                        {{ t('safety.detector.allRight') }}
                      }
                      @default {
                        {{ t('safety.detector.notKnown') }}
                      }
                    }
                    &ngsp;·&ngsp;{{ t('safety.detector.lastHeard') }}:&ngsp;
                    @if (row.detector.lastHeardAt; as heard) {
                      {{ heard | houseAge }}
                    } @else {
                      {{ t('safety.detector.never') }}
                    }
                  </p>
                  @if (row.detector.lastCommandConfirmed === false) {
                    <p class="detector__warning" data-testid="detector-not-reacted">
                      {{ t('safety.detector.notReacted') }}
                    </p>
                  }
                  @if (failureOf(row.detector); as failure) {
                    <p class="detector__failure" role="alert" data-testid="detector-failure">
                      {{ failure | displayText }}
                    </p>
                  }
                  @if (mutable(row.detector)) {
                    <div class="detector__actions">
                      <button
                        matButton
                        type="button"
                        data-testid="detector-mute"
                        [attr.aria-label]="t('safety.mute') + ' ' + row.fullName"
                        disabledInteractive
                        [disabled]="busy(row.detector)"
                        (click)="ask(row.detector)"
                      >
                        <mat-icon>notifications_off</mat-icon>
                        {{ t('safety.mute') }}
                      </button>
                    </div>
                  }
                </li>
              }
            </ul>
            <p class="safety__note">{{ t('myRoom.safety.note') }}</p>
          </mat-card-content>
        </mat-card>
      }
    </ng-container>
  `,
  styleUrl: './room-safety.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomSafety {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  private readonly store = inject(SafetyStore);
  private readonly ticker = inject(Ticker);
  private readonly question = safetyQuestion();
  protected readonly safety = this.store.safety;
  protected readonly describeError = describeSafetyError;

  /** The detectors of the room, each named without its room; `undefined` while not answered. */
  protected readonly detectors = computed(() =>
    detectorsOfRoom(this.safety.value(), this.room())?.map((detector) => ({
      detector,
      fullName: detectorName(detector),
      // without the room alone: "Kitchen smoke detector" is "Smoke detector" - the kind is all its name says then
      name: shortName(detector.name, this.room(), '') ?? detectorName(detector),
    })),
  );

  /** Whether the card is shown: the room has a detector, or nothing is known of it but a failure. */
  protected readonly shown = computed(() => {
    const detectors = this.detectors();
    return detectors === undefined ? this.safety.error() !== undefined : detectors.length > 0;
  });

  protected mutable(detector: Detector): boolean {
    return canMute(detector);
  }

  protected battery(detector: Detector) {
    return flagOf(detector.batteryLow);
  }

  protected failureOf(detector: Detector) {
    const state = this.store.commands.stateOf(SafetyStore.keyOf(detector.id ?? -1, 'mute'));
    return shownFailureOf(state, this.ticker.now());
  }

  protected busy(detector: Detector): boolean {
    return (
      this.question.asked() !== undefined ||
      this.store.commands.stateOf(SafetyStore.keyOf(detector.id ?? -1, 'mute'))?.sending === true
    );
  }

  protected ask(detector: Detector): void {
    const id = detector.id;
    if (id === undefined) {
      return;
    }
    // the question stands while the detector is still a detector of this room, in alarm
    void this.question.ask(id, 'mute', () =>
      (this.detectors() ?? []).some((row) => row.detector.id === id && canMute(row.detector)),
    );
  }
}
