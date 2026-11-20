import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { CommandState } from '../../core/api/device-commands';
import { Detector, SafetyCommand, SafetyRead } from '../../data-access/safety/safety-api';
import { SafetyStore } from '../../data-access/safety/safety-store';
import { MessageKey } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { DetectorState } from '../../shared/safety/detector-state';
import {
  FlagValue,
  commandFailureOf,
  detectorKindText,
  detectorName,
  detectorsByFloor,
  detectorsOf,
  flagOf,
} from '../../shared/safety/safety-labels';
import { safetyQuestion } from '../../shared/safety/safety-question';

/** The words of a flag of trouble: what "yes" means for it, "no" and "not known". */
interface FlagRow {
  readonly id: 'battery' | 'endOfLife' | 'fault' | 'selfTest';
  readonly label: MessageKey;
  readonly yes: MessageKey;
  readonly no: MessageKey;
  readonly value: (detector: Detector) => FlagValue;
}

const FLAG_ROWS: readonly FlagRow[] = [
  {
    id: 'battery',
    label: 'safety.detector.battery',
    yes: 'safety.detector.batteryLow',
    no: 'safety.detector.allRight',
    value: (detector) => flagOf(detector.batteryLow),
  },
  {
    id: 'endOfLife',
    label: 'safety.detector.endOfLife',
    yes: 'safety.detector.endOfLifeYes',
    no: 'safety.detector.none',
    value: (detector) => flagOf(detector.endOfLife),
  },
  {
    id: 'fault',
    label: 'safety.detector.fault',
    yes: 'safety.detector.faultYes',
    no: 'safety.detector.none',
    value: (detector) => flagOf(detector.fault),
  },
  {
    id: 'selfTest',
    label: 'safety.detector.selfTest',
    yes: 'safety.detector.selfTestProblem',
    no: 'safety.detector.allRight',
    value: (detector) => flagOf(detector.selfTestProblem),
  },
];

/**
 * The detectors of the house on the safety page (HAS-469): by floor and room in the order of the house, a card of one
 * size per detector - every line always rendered, so the cards of a row stand level -, the state in a word, an icon
 * and its colour, the battery, the end of life, a fault, the self test, when it was last heard, the model and the
 * firmware. A flag the answer leaves out is "not known", never all right. **Mute** and **Self test** after a question
 * in a window over the page; the detectors are read back (`SafetyStore`) and only that answer moves the card.
 */
@Component({
  selector: 'app-safety-detectors',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    DetectorState,
    DisplayTextPipe,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      @if (floors(); as list) {
        @if (list.length === 0) {
          <p class="note" data-testid="detectors-none">{{ t('safety.detectors.none') }}</p>
        }
        @for (floor of list; track floor.id) {
          <section class="floor" [attr.data-floor]="floor.id">
            <h2 class="floor__title">{{ t(floor.label) }}</h2>
            <div class="detectors">
              @for (room of floor.rooms; track room.room) {
                @for (detector of room.detectors; track detector.id) {
                  <mat-card
                    appearance="outlined"
                    class="detector card--domain"
                    data-testid="safety-detector"
                    [attr.data-detector]="detector.id"
                    [attr.data-room]="room.room"
                  >
                    <mat-card-header>
                      <div mat-card-avatar class="domain-badge">
                        <mat-icon>{{ iconOf(detector) }}</mat-icon>
                      </div>
                      <mat-card-title class="detector__name">{{ nameOf(detector) }}</mat-card-title>
                      <mat-card-subtitle class="detector__room">
                        <!-- the identifier of the room and the kind; the room is the registry's, printed as it is -->
                        @if (room.room !== '') {
                          {{ room.room }}
                        } @else {
                          {{ t('safety.detectors.noRoom') }}
                        }
                        &ngsp;·&ngsp;{{ kindOf(detector) | displayText }}
                      </mat-card-subtitle>
                    </mat-card-header>
                    <mat-card-content class="detector__content">
                      <app-detector-state [detector]="detector" />
                      <dl class="facts">
                        @for (row of FLAG_ROWS; track row.id) {
                          @let value = row.value(detector);
                          <div [attr.data-fact]="row.id" [attr.data-value]="value">
                            <dt>{{ t(row.label) }}</dt>
                            <dd>
                              @if (value === 'yes') {
                                <strong class="warning">{{ t(row.yes) }}</strong>
                              } @else if (value === 'no') {
                                {{ t(row.no) }}
                              } @else {
                                <span class="quiet">{{ t('safety.detector.notKnown') }}</span>
                              }
                            </dd>
                          </div>
                        }
                        <div data-fact="lastHeard">
                          <dt>{{ t('safety.detector.lastHeard') }}</dt>
                          <dd>
                            @if (detector.lastHeardAt; as heard) {
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
                        <div data-fact="model">
                          <dt>{{ t('safety.detector.model') }}</dt>
                          <dd>{{ detector.model ?? t('safety.detector.notKnown') }}</dd>
                        </div>
                        <div data-fact="firmware">
                          <dt>{{ t('safety.detector.firmware') }}</dt>
                          <dd>{{ detector.firmware ?? t('safety.detector.notKnown') }}</dd>
                        </div>
                      </dl>
                      <div class="notes">
                        @if (detector.confirmed === false) {
                          <p class="note" data-testid="detector-not-confirmed">
                            {{ t('safety.detector.notConfirmed') }}
                          </p>
                        }
                        @if (detector.lastCommandConfirmed === false) {
                          <p class="warning-line" data-testid="detector-not-reacted">
                            {{ t('safety.detector.notReacted') }}
                          </p>
                        }
                        @if (lastCommandOf(detector); as command) {
                          @if (command.error) {
                            <p class="failure" role="alert" data-testid="detector-failure">
                              {{ failureOf(command) | displayText }}
                            </p>
                          }
                        }
                      </div>
                      <!-- the commands in the bottom right corner, after a question in a window over the page -->
                      <div class="actions">
                        <button
                          matButton
                          type="button"
                          data-testid="detector-self-test"
                          disabledInteractive
                          [disabled]="busy(detector, 'selfTest')"
                          (click)="ask(detector, 'selfTest')"
                        >
                          {{ t('safety.selfTest') }}
                        </button>
                        <button
                          matButton="filled"
                          type="button"
                          data-testid="detector-mute"
                          disabledInteractive
                          [disabled]="busy(detector, 'mute')"
                          (click)="ask(detector, 'mute')"
                        >
                          {{ t('safety.mute') }}
                        </button>
                      </div>
                    </mat-card-content>
                  </mat-card>
                }
              }
            </div>
          </section>
        }
      }
    </ng-container>
  `,
  styleUrl: './safety-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyDetectors {
  private readonly store = inject(SafetyStore);
  private readonly question = safetyQuestion();

  /** What `safety-service` last answered; `undefined` until the first answer. */
  readonly read = input.required<SafetyRead | null | undefined>();

  protected readonly FLAG_ROWS = FLAG_ROWS;
  protected readonly nameOf = detectorName;
  protected readonly kindOf = (detector: Detector) => detectorKindText(detector.kind);
  protected readonly failureOf = commandFailureOf;

  private readonly detectors = computed(() => detectorsOf(this.read()));
  protected readonly floors = computed(() => {
    const detectors = this.detectors();
    return detectors === undefined ? undefined : detectorsByFloor(detectors);
  });

  protected iconOf(detector: Detector): string {
    switch (detector.kind) {
      case 'co detector':
        return 'detector_co';
      case 'heat detector':
        return 'local_fire_department';
      default:
        return 'detector_smoke';
    }
  }

  /** The newer of the two commands of the detector - what the card tells. */
  protected lastCommandOf(detector: Detector): CommandState | undefined {
    const id = detector.id ?? -1;
    const mute = this.store.commands.stateOf(SafetyStore.keyOf(id, 'mute'));
    const test = this.store.commands.stateOf(SafetyStore.keyOf(id, 'selfTest'));
    return (mute?.order ?? 0) >= (test?.order ?? 0) ? (mute ?? test) : test;
  }

  protected busy(detector: Detector, command: SafetyCommand): boolean {
    const id = detector.id ?? -1;
    return (
      this.question.asked() !== undefined ||
      this.store.commands.stateOf(SafetyStore.keyOf(id, command))?.sending === true
    );
  }

  protected ask(detector: Detector, command: SafetyCommand): void {
    const id = detector.id;
    if (id === undefined) {
      return;
    }
    // the question stands while the detector is still in the answer
    void this.question.ask(id, command, () =>
      (this.detectors() ?? []).some((candidate) => candidate.id === id),
    );
  }
}
